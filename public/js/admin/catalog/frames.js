/**
 * Optii Admin — Frames & Variants Catalogue Controller + Single Frame Creation (1-5 Images)
 */

import { adminState } from '../core/state.js';
import { apiRequest } from '../core/api-client.js';
import { debounce, escapeHtml, formatInr, slugifyText } from '../shared/formatters.js';
import { closeModal, openModal, requestConfirmation, showToast } from '../shared/notifications.js';

let taxonomyLoaded = false;
let currentNewProdStep = 1;
let isSubmittingNewProd = false;
const stagedImages = [];
const IMAGE_TYPE_OPTIONS = [
  { value: 'studio_front', label: 'Studio Front' },
  { value: 'model_on_face', label: 'Model Wearing' },
  { value: 'angle_45', label: '45° Angle' },
  { value: 'hinge_detail', label: 'Hinge Detail' },
  { value: 'packaging', label: 'Case / Packaging' }
];
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_IMAGES = 5;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

export function invalidateProductTaxonomyCache() {
  taxonomyLoaded = false;
}

export async function ensureProductFilterTaxonomy(forceRefresh = false) {
  if (!forceRefresh && taxonomyLoaded && adminState.brands.length && adminState.categories.length && adminState.shapes.length) {
    populateFilterDropdowns();
    return;
  }

  try {
    const [brandsRes, catsRes, shapesRes] = await Promise.all([
      apiRequest('/brands'),
      apiRequest('/categories'),
      apiRequest('/shapes')
    ]);
    adminState.brands = brandsRes.brands || [];
    adminState.categories = catsRes.categories || [];
    adminState.shapes = shapesRes.shapes || [];
    taxonomyLoaded = true;
    populateFilterDropdowns();
  } catch (err) {
    showToast('Failed to load brand, category, and shape options.', 'error');
  }
}

function populateFilterDropdowns() {
  const brandSel = document.getElementById('products-filter-brand');
  const catSel = document.getElementById('products-filter-category');
  const shapeSel = document.getElementById('products-filter-shape');

  if (brandSel) {
    brandSel.innerHTML = `<option value="">All Brands</option>` +
      adminState.brands.map(b => `<option value="${escapeHtml(b.slug)}">${escapeHtml(b.name)}</option>`).join('');
    brandSel.value = adminState.productFilters.brand;
  }
  if (catSel) {
    catSel.innerHTML = `<option value="">All Categories</option>` +
      adminState.categories.map(c => `<option value="${escapeHtml(c.slug)}">${escapeHtml(c.name)}</option>`).join('');
    catSel.value = adminState.productFilters.category;
  }
  if (shapeSel) {
    shapeSel.innerHTML = `<option value="">All Shapes</option>` +
      adminState.shapes.map(s => `<option value="${escapeHtml(s.slug)}">${escapeHtml(s.name)}</option>`).join('');
    shapeSel.value = adminState.productFilters.shape;
  }
}

export async function loadFrameCatalog() {
  const tbody = document.getElementById('products-table-body');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="11" class="empty-state-box">Loading frames catalogue…</td></tr>';
  await ensureProductFilterTaxonomy(false);

  try {
    const filters = adminState.productFilters;
    const params = new URLSearchParams({
      search: filters.search || '',
      brand: filters.brand || '',
      category: filters.category || '',
      shape: filters.shape || '',
      status: filters.status || 'all',
      sort: filters.sort || 'newest',
      limit: String(filters.limit),
      offset: String(filters.offset)
    });

    const apiResponse = await apiRequest(`/products?${params.toString()}`);
    adminState.products = apiResponse.products || [];
    adminState.productsTotal = Number(apiResponse.total ?? adminState.products.length);

    const countEl = document.getElementById('products-results-count');
    if (countEl) {
      countEl.textContent = `${adminState.productsTotal} frame(s)`;
    }

    renderProductsPagination();

    if (adminState.products.length === 0) {
      tbody.innerHTML = '<tr><td colspan="11" class="empty-state-box">No optical frames match your current search and filters.</td></tr>';
      return;
    }

    const isAdmin = adminState.user?.role === 'admin';
    tbody.innerHTML = adminState.products.map(product => `
      <tr>
        <td>
          <div style="display:flex;align-items:center;gap:10px;">
            ${product.primary_image
              ? `<img src="/${escapeHtml(product.primary_image.replace(/^\/+/, ''))}" alt="${escapeHtml(product.name)}" class="frame-thumb" />`
              : `<div class="frame-thumb" style="display:flex;align-items:center;justify-content:center;font-size:12px;color:var(--ink-secondary);">No Img</div>`}
            <div>
              <div style="font-weight:600;">${escapeHtml(product.name)}</div>
              <div style="font-size:12px;color:var(--ink-secondary);">${escapeHtml(product.slug)}</div>
            </div>
          </div>
        </td>
        <td><span style="font-family:var(--font-mono);font-weight:700;font-size:12px;">${escapeHtml(product.sku)}</span></td>
        <td>${escapeHtml(product.brand_name || '—')}</td>
        <td>${escapeHtml(product.category_name || '—')}</td>
        <td>${escapeHtml(product.shape_name || '—')}</td>
        <td><span style="font-family:var(--font-mono);font-size:12px;">${product.lens_width_mm}-${product.bridge_width_mm}-${product.temple_length_mm} mm</span></td>
        <td><strong>${product.variant_count || 0}</strong></td>
        <td><strong>${product.total_stock || 0}</strong></td>
        <td><strong>${formatInr(product.base_price_inr)}</strong></td>
        <td>
          <span class="badge-status ${product.is_active ? 'active' : 'archived'}">${product.is_active ? 'Active' : 'Archived'}</span>
        </td>
        <td>
          <div style="display:flex;gap:4px;flex-wrap:wrap;">
            <button type="button" class="btn-secondary btn-sm" onclick="OptiiAdmin.viewProductVariants(${product.id})">Manage &amp; Variants</button>
            ${isAdmin ? `
              <button type="button" class="btn-secondary btn-sm" onclick="OptiiAdmin.toggleProductActive(${product.id}, ${product.is_active ? 0 : 1}, '${escapeHtml(product.name).replace(/'/g, '')}')">
                ${product.is_active ? 'Archive' : 'Restore'}
              </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="11" class="empty-state-box" style="color:#991b1b;">Error loading frame catalogue.</td></tr>';
    showToast(err.message || 'Failed to load frame catalogue.', 'error');
  }
}

function renderProductsPagination() {
  const el = document.getElementById('products-pagination-bar');
  if (!el) return;

  const { limit, offset } = adminState.productFilters;
  const total = adminState.productsTotal;
  const start = total === 0 ? 0 : offset + 1;
  const end = Math.min(offset + limit, total);

  el.innerHTML = `
    <span>Showing <strong>${start}–${end}</strong> of <strong>${total}</strong> master frames</span>
    <div style="display:flex;gap:6px;">
      <button type="button" class="btn-secondary btn-sm" id="btn-products-prev" ${offset <= 0 ? 'disabled' : ''}>Previous</button>
      <button type="button" class="btn-secondary btn-sm" id="btn-products-next" ${end >= total ? 'disabled' : ''}>Next</button>
    </div>
  `;

  document.getElementById('btn-products-prev')?.addEventListener('click', () => {
    adminState.productFilters.offset = Math.max(0, offset - limit);
    loadFrameCatalog();
  });
  document.getElementById('btn-products-next')?.addEventListener('click', () => {
    if (end < total) {
      adminState.productFilters.offset = offset + limit;
      loadFrameCatalog();
    }
  });
}

export const debouncedProductSearch = debounce((value) => {
  adminState.productFilters.search = value;
  adminState.productFilters.offset = 0;
  loadFrameCatalog();
}, 280);

export function updateProductFilter(key, value) {
  adminState.productFilters[key] = value;
  adminState.productFilters.offset = 0;
  loadFrameCatalog();
}

// ─── STAGED 1–5 PRODUCT IMAGE QUEUE IN NEW PRODUCT MODAL ───
function clearStagedImages() {
  while (stagedImages.length > 0) {
    const item = stagedImages.pop();
    if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
  }
  const input = document.getElementById('new-prod-images-input');
  if (input) input.value = '';
  renderStagedImages();
}

function addFilesToStaging(fileList) {
  const errEl = document.getElementById('new-prod-images-error');
  if (errEl) errEl.textContent = '';

  const files = Array.from(fileList || []);
  for (const file of files) {
    if (stagedImages.length >= MAX_IMAGES) {
      const msg = `Maximum ${MAX_IMAGES} images allowed per product colorway. Remove one to add another.`;
      if (errEl) errEl.textContent = msg;
      showToast(msg, 'error');
      break;
    }
    if (!ALLOWED_MIME.has(file.type)) {
      const msg = `"${file.name}" is unsupported (${file.type || 'unknown'}). Upload JPEG, PNG, or WebP only.`;
      if (errEl) errEl.textContent = msg;
      showToast(msg, 'error');
      continue;
    }
    if (file.size > MAX_FILE_BYTES) {
      const msg = `"${file.name}" exceeds the 5 MB image limit.`;
      if (errEl) errEl.textContent = msg;
      showToast(msg, 'error');
      continue;
    }
    const defaultType = IMAGE_TYPE_OPTIONS[Math.min(stagedImages.length, IMAGE_TYPE_OPTIONS.length - 1)].value;
    stagedImages.push({
      file,
      previewUrl: URL.createObjectURL(file),
      image_type: defaultType
    });
  }
  renderStagedImages();
}

export function removeStagedProductImage(index) {
  const [removed] = stagedImages.splice(index, 1);
  if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
  renderStagedImages();
}

export function moveStagedProductImage(index, delta) {
  const target = index + delta;
  if (target < 0 || target >= stagedImages.length) return;
  const [item] = stagedImages.splice(index, 1);
  stagedImages.splice(target, 0, item);
  renderStagedImages();
}

export function setStagedProductPrimaryImage(index) {
  if (index <= 0 || index >= stagedImages.length) return;
  const [item] = stagedImages.splice(index, 1);
  stagedImages.unshift(item);
  renderStagedImages();
}

export function updateStagedProductImageType(index, imageType) {
  if (stagedImages[index]) stagedImages[index].image_type = imageType;
}

function renderStagedImages() {
  const grid = document.getElementById('new-prod-images-preview');
  const countBadge = document.getElementById('new-prod-images-count');
  if (countBadge) {
    countBadge.textContent = `${stagedImages.length} / ${MAX_IMAGES} selected`;
  }
  if (!grid) return;

  if (stagedImages.length === 0) {
    grid.innerHTML = '<div style="font-size:12px;color:var(--ink-secondary);padding:8px 0;">No photos staged yet. Upload up to 5 images (image #1 becomes the Primary card view; image #2 becomes the Hover view).</div>';
    return;
  }

  grid.innerHTML = stagedImages.map((item, idx) => `
    <div class="staged-image-card">
      <div class="staged-image-thumb-wrap">
        <img src="${item.previewUrl}" alt="Preview ${idx + 1}" />
        ${idx === 0 ? '<span class="staged-image-badge">1 · Primary</span>' : (idx === 1 ? '<span class="staged-image-badge secondary">2 · Hover</span>' : `<span class="staged-image-badge secondary">#${idx + 1}</span>`)}
      </div>
      <select class="form-control" style="height:28px;font-size:11px;padding:2px 6px;" onchange="OptiiAdmin.updateStagedProductImageType(${idx}, this.value)" aria-label="View type for image ${idx + 1}">
        ${IMAGE_TYPE_OPTIONS.map(opt => `<option value="${opt.value}" ${item.image_type === opt.value ? 'selected' : ''}>${opt.label}</option>`).join('')}
      </select>
      <div class="staged-image-actions">
        <div style="display:flex;gap:4px;">
          <button type="button" class="btn-secondary btn-sm" style="padding:2px 7px;" onclick="OptiiAdmin.moveStagedProductImage(${idx}, -1)" ${idx === 0 ? 'disabled' : ''} aria-label="Move image left">←</button>
          <button type="button" class="btn-secondary btn-sm" style="padding:2px 7px;" onclick="OptiiAdmin.moveStagedProductImage(${idx}, 1)" ${idx === stagedImages.length - 1 ? 'disabled' : ''} aria-label="Move image right">→</button>
          ${idx > 0 ? `<button type="button" class="btn-secondary btn-sm" style="padding:2px 6px;font-size:11px;" onclick="OptiiAdmin.setStagedProductPrimaryImage(${idx})" aria-label="Set image ${idx + 1} as primary">Primary</button>` : ''}
        </div>
        <button type="button" class="btn-danger btn-sm" style="padding:2px 8px;" onclick="OptiiAdmin.removeStagedProductImage(${idx})" aria-label="Remove image">×</button>
      </div>
    </div>
  `).join('');
}

let newProdDropzoneBound = false;
function bindNewProductUploader() {
  if (newProdDropzoneBound) return;
  const dz = document.getElementById('new-prod-images-dropzone');
  const inp = document.getElementById('new-prod-images-input');
  if (!dz || !inp) return;

  newProdDropzoneBound = true;
  dz.addEventListener('click', () => inp.click());
  dz.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      inp.click();
    }
  });
  dz.addEventListener('dragover', (e) => {
    e.preventDefault();
    dz.classList.add('drag-over');
  });
  dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));
  dz.addEventListener('drop', (e) => {
    e.preventDefault();
    dz.classList.remove('drag-over');
    if (e.dataTransfer?.files?.length) addFilesToStaging(e.dataTransfer.files);
  });
  inp.addEventListener('change', (e) => {
    if (e.target.files?.length) addFilesToStaging(e.target.files);
    inp.value = '';
  });
}

function setNewProductError(msg) {
  const errBanner = document.getElementById('new-prod-error-banner');
  if (errBanner) {
    errBanner.textContent = msg || '';
    errBanner.style.display = msg ? 'block' : 'none';
  }
  if (msg) showToast(msg, 'error');
}

function renderNewProductWizardStep() {
  document.querySelectorAll('[data-newprod-step-pill]').forEach(pill => {
    const num = Number(pill.dataset.newprodStepPill);
    pill.classList.toggle('active', num === currentNewProdStep);
    pill.classList.toggle('done', num < currentNewProdStep);
    pill.setAttribute('aria-selected', num === currentNewProdStep ? 'true' : 'false');
  });

  document.querySelectorAll('[data-newprod-step-pane]').forEach(pane => {
    pane.style.display = Number(pane.dataset.newprodStepPane) === currentNewProdStep ? 'block' : 'none';
  });

  const prevBtn = document.getElementById('btn-newprod-prev');
  const nextBtn = document.getElementById('btn-newprod-next');
  const submitBtn = document.getElementById('btn-newprod-submit');
  if (prevBtn) prevBtn.style.display = currentNewProdStep > 1 ? 'inline-flex' : 'none';
  if (nextBtn) nextBtn.style.display = currentNewProdStep < 4 ? 'inline-flex' : 'none';
  if (submitBtn) submitBtn.style.display = currentNewProdStep === 4 ? 'inline-flex' : 'none';

  const modalBody = document.querySelector('#modal-new-product .admin-modal-body');
  if (modalBody) modalBody.scrollTop = 0;

  const activePane = document.querySelector(`[data-newprod-step-pane="${currentNewProdStep}"]`);
  const firstInput = activePane?.querySelector('input:not([type="hidden"]), select, textarea, [tabindex="0"]');
  if (firstInput) setTimeout(() => firstInput.focus(), 20);
}

function validateNewProductStep(stepNum) {
  const form = document.getElementById('new-product-form');
  if (!form) return false;
  setNewProductError('');

  if (stepNum === 1) {
    const name = form.name?.value.trim() || '';
    const prodCode = form.prod_code?.value.trim() || '';
    const brandId = Number(form.brand_id?.value);
    const categoryId = Number(form.category_id?.value);
    const shapeId = Number(form.shape_id?.value);
    const material = form.material?.value.trim() || '';
    const basePrice = Number(form.base_price_inr?.value);

    if (name.length < 2) { setNewProductError('Frame Name must be at least 2 characters.'); return false; }
    if (prodCode.length < 2) { setNewProductError('Product Code (prod_code) must be at least 2 characters.'); return false; }
    if (!brandId || !categoryId || !shapeId) { setNewProductError('Brand, Category, and Frame Shape are all required.'); return false; }
    if (material.length < 2) { setNewProductError('Frame Material is required (at least 2 characters).'); return false; }
    if (!Number.isFinite(basePrice) || basePrice <= 0) { setNewProductError('Base Retail Price must be greater than ₹0.'); return false; }
  }

  if (stepNum === 2) {
    const lensW = Number(form.lens_width_mm?.value);
    const bridgeW = Number(form.bridge_width_mm?.value);
    const templeL = Number(form.temple_length_mm?.value);
    const frameH = form.frame_height_mm?.value ? Number(form.frame_height_mm.value) : null;
    const totalW = form.total_width_mm?.value ? Number(form.total_width_mm.value) : null;

    if (!Number.isFinite(lensW) || lensW < 30 || lensW > 75) { setNewProductError('Lens Width must be between 30 and 75 mm.'); return false; }
    if (!Number.isFinite(bridgeW) || bridgeW < 10 || bridgeW > 35) { setNewProductError('Bridge Width must be between 10 and 35 mm.'); return false; }
    if (!Number.isFinite(templeL) || templeL < 100 || templeL > 180) { setNewProductError('Temple Length must be between 100 and 180 mm.'); return false; }
    if (frameH !== null && (!Number.isFinite(frameH) || frameH < 20 || frameH > 90)) { setNewProductError('Frame Height must be between 20 and 90 mm.'); return false; }
    if (totalW !== null && (!Number.isFinite(totalW) || totalW < 90 || totalW > 200)) { setNewProductError('Total Width must be between 90 and 200 mm.'); return false; }
  }

  if (stepNum === 3) {
    const colorName = form.initial_color_name?.value.trim() || '';
    const stock = Number(form.initial_opening_stock?.value);
    const priceOverride = form.initial_price_override?.value ? Number(form.initial_price_override.value) : null;

    if (!colorName) { setNewProductError('Colour Name is required.'); return false; }
    if (!Number.isInteger(stock) || stock < 0) { setNewProductError('Opening Stock must be a non-negative whole number.'); return false; }
    if (priceOverride !== null && (!Number.isFinite(priceOverride) || priceOverride <= 0)) { setNewProductError('Variant Price Override must be greater than ₹0 or left blank.'); return false; }
  }

  return true;
}

export function goToNewProductStep(targetStep) {
  const step = Number(targetStep);
  if (step < 1 || step > 4) return;
  if (step > currentNewProdStep) {
    for (let s = currentNewProdStep; s < step; s++) {
      if (!validateNewProductStep(s)) return;
    }
  } else {
    setNewProductError('');
  }
  currentNewProdStep = step;
  renderNewProductWizardStep();
}

export function nextNewProductStep() {
  if (!validateNewProductStep(currentNewProdStep)) return;
  if (currentNewProdStep < 4) {
    currentNewProdStep++;
    renderNewProductWizardStep();
  }
}

export function prevNewProductStep() {
  if (currentNewProdStep > 1) {
    setNewProductError('');
    currentNewProdStep--;
    renderNewProductWizardStep();
  }
}

let formKeydownBound = false;
let lastEnterStepAt = 0;
export async function openNewProductModal() {
  const form = document.getElementById('new-product-form');
  if (form) {
    form.reset();
    if (!formKeydownBound) {
      formKeydownBound = true;
      form.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'BUTTON') {
          if (currentNewProdStep < 4) {
            e.preventDefault();
            e.stopPropagation();
            const now = Date.now();
            if (e.repeat || now - lastEnterStepAt < 250) return;
            lastEnterStepAt = now;
            nextNewProductStep();
          }
        }
      });
    }
  }
  clearStagedImages();
  setNewProductError('');
  const errImg = document.getElementById('new-prod-images-error');
  if (errImg) errImg.textContent = '';

  currentNewProdStep = 1;
  isSubmittingNewProd = false;
  openModal('modal-new-product');
  renderNewProductWizardStep();
  bindNewProductUploader();
  await ensureProductFilterTaxonomy(true);

  const activeBrands = adminState.brands.filter(b => b.is_active);
  const activeCats = adminState.categories.filter(c => c.is_active);
  const activeShapes = adminState.shapes.filter(s => s.is_active);

  const brandSel = document.getElementById('new-prod-brand');
  const catSel = document.getElementById('new-prod-category');
  const shapeSel = document.getElementById('new-prod-shape');

  if (brandSel) {
    brandSel.innerHTML = activeBrands.length
      ? activeBrands.map(b => `<option value="${b.id}">${escapeHtml(b.name)}</option>`).join('')
      : '<option value="">No active brands — add one in Taxonomy</option>';
  }
  if (catSel) {
    catSel.innerHTML = activeCats.length
      ? activeCats.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')
      : '<option value="">No active categories — add one in Taxonomy</option>';
  }
  if (shapeSel) {
    shapeSel.innerHTML = activeShapes.length
      ? activeShapes.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('')
      : '<option value="">No active shapes — add one in Taxonomy</option>';
  }
}

export async function handleCreateProduct(event) {
  event.preventDefault();
  if (currentNewProdStep < 4) return;
  if (isSubmittingNewProd) return;

  for (let s = 1; s <= 3; s++) {
    if (!validateNewProductStep(s)) {
      currentNewProdStep = s;
      renderNewProductWizardStep();
      return;
    }
  }
  if (stagedImages.length > MAX_IMAGES) {
    return setNewProductError(`Maximum ${MAX_IMAGES} images allowed.`);
  }

  const form = event.target;
  const submitBtn = document.getElementById('btn-newprod-submit') || form.querySelector('button[type="submit"]');
  const name = form.name.value.trim();
  const prodCode = form.prod_code.value.trim();

  const payload = {
    name,
    prod_code: prodCode,
    brand_id: Number(form.brand_id.value),
    category_id: Number(form.category_id.value),
    shape_id: Number(form.shape_id.value),
    gender: form.gender?.value || 'unisex',
    frame_type: form.frame_type?.value || 'Full Rim',
    base_price_inr: Number(form.base_price_inr.value),
    material: form.material.value.trim(),
    frame_fit: form.frame_fit.value.trim(),
    lens_width_mm: Number(form.lens_width_mm.value),
    bridge_width_mm: Number(form.bridge_width_mm.value),
    temple_length_mm: Number(form.temple_length_mm.value),
    frame_height_mm: form.frame_height_mm?.value ? Number(form.frame_height_mm.value) : null,
    total_width_mm: form.total_width_mm?.value ? Number(form.total_width_mm.value) : null,
    description: form.description.value.trim(),
    initial_variant: {
      color_name: form.initial_color_name.value.trim(),
      price_override_inr: form.initial_price_override?.value ? Number(form.initial_price_override.value) : null,
      stock_quantity: Number(form.initial_opening_stock?.value || 0)
    }
  };

  try {
    isSubmittingNewProd = true;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Saving Frame…';
    }

    const res = await apiRequest('/products', { method: 'POST', body: payload });
    if (!res.success) {
      throw new Error(res.message || 'Unable to create frame.');
    }

    if (stagedImages.length > 0 && res.variant_id) {
      if (submitBtn) submitBtn.textContent = `Uploading ${stagedImages.length} photo(s)…`;
      const fd = new FormData();
      fd.append('image_types', JSON.stringify(stagedImages.map(s => s.image_type)));
      stagedImages.forEach(s => fd.append('images', s.file));

      const uploadRes = await fetch(`/api/admin/variants/${res.variant_id}/images`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminState.token}` },
        body: fd
      });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok || !uploadData.success) {
        showToast(uploadData.message || 'Frame created, but photo upload failed. Open Manage & Variants to retry.', 'warning');
      }
    }

    showToast(res.message || 'Frame created successfully.', 'success');
    clearStagedImages();
    closeModal('modal-new-product');
    form.reset();
    loadFrameCatalog();
  } catch (err) {
    setNewProductError(err.message || 'Error creating optical frame.');
  } finally {
    isSubmittingNewProd = false;
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Create Frame';
    }
  }
}

export async function toggleProductActive(id, newStatus, productName = 'this frame') {
  const verb = newStatus ? 'Restore' : 'Archive';
  const confirmed = await requestConfirmation({
    title: `${verb} Optical Frame`,
    message: newStatus
      ? `Restore "${productName}" so it becomes visible on the customer storefront?`
      : `Archive "${productName}"? It will be hidden from the customer storefront while preserving historical orders.`,
    confirmLabel: verb,
    danger: !newStatus
  });
  if (!confirmed) return;

  try {
    await apiRequest(`/products/${id}/status`, {
      method: 'PATCH',
      body: { is_active: newStatus }
    });
    showToast(`Frame ${newStatus ? 'restored' : 'archived'} successfully.`, 'success');
    loadFrameCatalog();
  } catch (err) {
    showToast(err.message || 'Error updating status.', 'error');
  }
}

export function switchCatalogSubtab(tabName) {
  document.querySelectorAll('[data-catalog-tab]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.catalogTab === tabName);
  });
  document.querySelectorAll('[data-catalog-pane]').forEach(pane => {
    pane.style.display = pane.dataset.catalogPane === tabName ? 'block' : 'none';
  });
}
