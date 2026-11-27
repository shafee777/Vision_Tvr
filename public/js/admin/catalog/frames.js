/**
 * Optii Admin — Frames & Variants Catalogue Controller
 */

import { adminState } from '../core/state.js';
import { apiRequest } from '../core/api-client.js';
import { debounce, escapeHtml, formatInr, slugifyText } from '../shared/formatters.js';
import { closeModal, openModal, requestConfirmation, showToast } from '../shared/notifications.js';

let taxonomyLoaded = false;

export async function ensureProductFilterTaxonomy() {
  if (taxonomyLoaded && adminState.brands.length && adminState.categories.length && adminState.shapes.length) {
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
    showToast('Failed to load filter taxonomy options.', 'error');
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

  tbody.innerHTML = '<tr><td colspan="10" class="empty-state-box">Loading frames catalogue…</td></tr>';
  await ensureProductFilterTaxonomy();

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
      tbody.innerHTML = '<tr><td colspan="10" class="empty-state-box">No optical frames match your current search and filters.</td></tr>';
      return;
    }

    const isAdmin = adminState.user?.role === 'admin';
    tbody.innerHTML = adminState.products.map(product => `
      <tr>
        <td>
          <div style="display:flex;align-items:center;gap:10px;">
            ${product.primary_image
              ? `<img src="/${escapeHtml(product.primary_image)}" alt="${escapeHtml(product.name)}" class="frame-thumb" />`
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
            <button type="button" class="btn-secondary btn-sm" onclick="OptiiAdmin.viewProductVariants(${product.id})">Manage & Variants</button>
            ${isAdmin ? `
              <button type="button" class="btn-secondary btn-sm" onclick="OptiiAdmin.toggleProductActive(${product.id}, ${product.is_active ? 0 : 1}, '${escapeHtml(product.name)}')">
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

export async function openNewProductModal() {
  openModal('modal-new-product');
  await ensureProductFilterTaxonomy();

  const brandSel = document.getElementById('new-prod-brand');
  const catSel = document.getElementById('new-prod-category');
  const shapeSel = document.getElementById('new-prod-shape');

  if (brandSel) {
    brandSel.innerHTML = adminState.brands.map(b => `<option value="${b.id}">${escapeHtml(b.name)}</option>`).join('') || '<option value="">No brands found</option>';
  }
  if (catSel) {
    catSel.innerHTML = adminState.categories.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('') || '<option value="">No categories found</option>';
  }
  if (shapeSel) {
    shapeSel.innerHTML = adminState.shapes.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('') || '<option value="">No shapes found</option>';
  }
}

export async function handleCreateProduct(event) {
  event.preventDefault();
  const form = event.target;
  const submitBtn = form.querySelector('button[type="submit"]');

  const name = form.name.value.trim();
  const slug = form.slug.value.trim() || slugifyText(name);
  const sku = form.sku.value.trim();

  const payload = {
    name,
    slug,
    sku,
    brand_id: Number(form.brand_id.value),
    category_id: Number(form.category_id.value),
    shape_id: Number(form.shape_id.value),
    gender: form.gender?.value || 'unisex',
    base_price_inr: Number(form.base_price_inr.value),
    material: form.material.value.trim(),
    frame_fit: form.frame_fit.value.trim(),
    lens_width_mm: Number(form.lens_width_mm.value),
    bridge_width_mm: Number(form.bridge_width_mm.value),
    temple_length_mm: Number(form.temple_length_mm.value),
    frame_height_mm: form.frame_height_mm?.value ? Number(form.frame_height_mm.value) : null,
    total_width_mm: form.total_width_mm?.value ? Number(form.total_width_mm.value) : null,
    description: form.description.value.trim()
  };

  const varSku = form.initial_variant_sku?.value.trim();
  const colorName = form.initial_color_name?.value.trim();
  const colorHex = form.initial_color_hex?.value.trim();
  if (varSku || colorName) {
    if (!varSku || !colorName || !colorHex) {
      showToast('Complete Variant SKU, Colour Name, and Colour Hex for the initial colorway.', 'error');
      return;
    }
    payload.initial_variant = {
      sku: varSku,
      color_name: colorName,
      color_hex: colorHex,
      price_override_inr: form.initial_price_override?.value ? Number(form.initial_price_override.value) : null,
      stock_quantity: Number(form.initial_opening_stock?.value || 0)
    };
  }

  try {
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Saving Frame…';
    }
    const res = await apiRequest('/products', { method: 'POST', body: payload });
    if (res.success) {
      showToast(res.message || 'Master frame created successfully.', 'success');
      closeModal('modal-new-product');
      form.reset();
      loadFrameCatalog();
    }
  } catch (err) {
    showToast(err.message || 'Error creating product silhouette.', 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Create Master Frame';
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
