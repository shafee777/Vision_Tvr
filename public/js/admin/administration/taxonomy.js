/**
 * Optii Admin — Complete Optical Brands, Frame Shapes & Categories CRUD
 */

import { adminState } from '../core/state.js';
import { apiRequest } from '../core/api-client.js';
import { escapeHtml, slugifyText } from '../shared/formatters.js';
import { closeModal, openModal, requestConfirmation, showToast } from '../shared/notifications.js';
import { invalidateProductTaxonomyCache } from '../catalog/frames.js';

const SHAPE_SVG_PRESETS = {
  round: '<svg viewBox="0 0 48 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="14" cy="12" r="8"/><circle cx="34" cy="12" r="8"/><line x1="22" y1="12" x2="26" y2="12"/></svg>',
  square: '<svg viewBox="0 0 48 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="6" y="5" width="16" height="14" rx="2"/><rect x="26" y="5" width="16" height="14" rx="2"/><line x1="22" y1="12" x2="26" y2="12"/></svg>',
  rectangle: '<svg viewBox="0 0 48 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="6" y="7" width="16" height="10" rx="1.5"/><rect x="26" y="7" width="16" height="10" rx="1.5"/><line x1="22" y1="12" x2="26" y2="12"/></svg>',
  aviator: '<svg viewBox="0 0 48 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M7 6 C12 6, 21 8, 20 16 C19 19, 13 20, 8 18 Z"/><path d="M41 6 C36 6, 27 8, 28 16 C29 19, 35 20, 40 18 Z"/><line x1="20" y1="9" x2="28" y2="9"/><line x1="20" y1="13" x2="28" y2="13"/></svg>',
  'cat-eye': '<svg viewBox="0 0 48 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 7 C14 5, 21 9, 20 16 C19 19, 11 19, 8 17 Z"/><path d="M42 7 C34 5, 27 9, 28 16 C29 19, 37 19, 40 17 Z"/><line x1="20" y1="12" x2="28" y2="12"/></svg>',
  oval: '<svg viewBox="0 0 48 24" fill="none" stroke="currentColor" stroke-width="1.8"><ellipse cx="14" cy="12" rx="8" ry="6"/><ellipse cx="34" cy="12" rx="8" ry="6"/><line x1="22" y1="12" x2="26" y2="12"/></svg>',
  wayfarer: '<svg viewBox="0 0 48 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 6 L22 6 L20 18 C14 19, 8 18, 7 15 Z"/><path d="M26 6 L43 6 L41 15 C40 18, 34 19, 28 18 Z"/><line x1="22" y1="8" x2="26" y2="8"/></svg>',
  geometric: '<svg viewBox="0 0 48 24" fill="none" stroke="currentColor" stroke-width="1.8"><polygon points="14,4 21,8 21,16 14,20 7,16 7,8"/><polygon points="34,4 41,8 41,16 34,20 27,16 27,8"/><line x1="21" y1="12" x2="27" y2="12"/></svg>'
};

const taxFilters = {
  brandSearch: '',
  brandStatus: 'all',
  shapeSearch: '',
  categorySearch: ''
};

export async function loadTaxonomy() {
  try {
    const [brandsRes, shapesRes, catsRes] = await Promise.all([
      apiRequest('/brands'),
      apiRequest('/shapes'),
      apiRequest('/categories')
    ]);

    adminState.brands = brandsRes.brands || [];
    adminState.shapes = shapesRes.shapes || [];
    adminState.categories = catsRes.categories || [];
    renderTaxonomyTables();
  } catch (err) {
    showToast('Error loading brands, shapes, and categories.', 'error');
  }
}

export function filterTaxonomyList(type, value, field = 'Search') {
  if (type === 'brands' && field === 'Search') taxFilters.brandSearch = value;
  if (type === 'brands' && field === 'Status') taxFilters.brandStatus = value;
  if (type === 'shapes') taxFilters.shapeSearch = value;
  if (type === 'categories') taxFilters.categorySearch = value;
  renderTaxonomyTables();
}

function renderTaxonomyTables() {
  const isAdmin = adminState.user?.role === 'admin';

  // 1. Brands Table
  const bTable = document.getElementById('taxonomy-brands-body');
  if (bTable) {
    const term = taxFilters.brandSearch.trim().toLowerCase();
    const filteredBrands = adminState.brands.filter(b => {
      const matchText = !term || b.name.toLowerCase().includes(term) || b.slug.toLowerCase().includes(term) || (b.description || '').toLowerCase().includes(term);
      const matchStatus = taxFilters.brandStatus === 'all' ||
        (taxFilters.brandStatus === 'active' && b.is_active) ||
        (taxFilters.brandStatus === 'inactive' && !b.is_active);
      return matchText && matchStatus;
    });

    if (filteredBrands.length === 0) {
      bTable.innerHTML = '<tr><td colspan="5" class="empty-state-box">No brands match your search.</td></tr>';
    } else {
      bTable.innerHTML = filteredBrands.map(brand => `
        <tr>
          <td>
            <div style="display:flex;align-items:center;gap:10px;">
              ${brand.logo_url
                ? `<img src="${escapeHtml(brand.logo_url.startsWith('/') || brand.logo_url.startsWith('http') ? brand.logo_url : '/' + brand.logo_url)}" alt="${escapeHtml(brand.name)}" class="brand-logo-thumb" />`
                : `<div class="brand-logo-thumb" style="display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;">${escapeHtml(brand.name.slice(0, 2).toUpperCase())}</div>`}
              <div>
                <strong>${escapeHtml(brand.name)}</strong>
                ${brand.description ? `<div style="font-size:12px;color:var(--ink-secondary);max-width:220px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(brand.description)}</div>` : ''}
              </div>
            </div>
          </td>
          <td><span style="font-family:var(--font-mono);font-size:12px;">${escapeHtml(brand.slug)}</span></td>
          <td>${brand.product_count || 0} products</td>
          <td><span class="badge-status ${brand.is_active ? 'active' : 'archived'}">${brand.is_active ? 'Active' : 'Disabled'}</span></td>
          <td>
            ${isAdmin ? `
              <div style="display:flex;gap:4px;flex-wrap:wrap;">
                <button type="button" class="btn-secondary btn-sm" data-tax-action="edit-brand" data-id="${brand.id}">Edit</button>
                <button type="button" class="btn-secondary btn-sm" data-tax-action="toggle-brand" data-id="${brand.id}">${brand.is_active ? 'Disable' : 'Enable'}</button>
                <button type="button" class="btn-danger btn-sm" data-tax-action="delete-brand" data-id="${brand.id}">Delete</button>
              </div>
            ` : '—'}
          </td>
        </tr>
      `).join('');
    }
  }

  // 2. Shapes Table
  const sTable = document.getElementById('taxonomy-shapes-body');
  if (sTable) {
    const term = taxFilters.shapeSearch.trim().toLowerCase();
    const filteredShapes = adminState.shapes.filter(s =>
      !term || s.name.toLowerCase().includes(term) || s.slug.toLowerCase().includes(term)
    );

    if (filteredShapes.length === 0) {
      sTable.innerHTML = '<tr><td colspan="5" class="empty-state-box">No frame shapes match your search.</td></tr>';
    } else {
      sTable.innerHTML = filteredShapes.map(shape => `
        <tr>
          <td>
            <div style="display:flex;align-items:center;gap:8px;">
              <span class="svg-preview-box" style="width:44px;height:24px;">
                ${shape.icon_svg || SHAPE_SVG_PRESETS.round}
              </span>
              <strong>${escapeHtml(shape.name)}</strong>
            </div>
          </td>
          <td><span style="font-family:var(--font-mono);font-size:12px;">${escapeHtml(shape.slug)}</span></td>
          <td>${shape.product_count || 0} frames</td>
          <td><span class="badge-status ${shape.is_active ? 'active' : 'archived'}">${shape.is_active ? 'Active' : 'Disabled'}</span></td>
          <td>
            ${isAdmin ? `
              <div style="display:flex;gap:4px;flex-wrap:wrap;">
                <button type="button" class="btn-secondary btn-sm" data-tax-action="edit-shape" data-id="${shape.id}">Edit</button>
                <button type="button" class="btn-secondary btn-sm" data-tax-action="toggle-shape" data-id="${shape.id}">${shape.is_active ? 'Disable' : 'Enable'}</button>
                <button type="button" class="btn-danger btn-sm" data-tax-action="delete-shape" data-id="${shape.id}">Delete</button>
              </div>
            ` : '—'}
          </td>
        </tr>
      `).join('');
    }
  }

  // 3. Categories Table
  const cTable = document.getElementById('taxonomy-cats-body');
  if (cTable) {
    const term = taxFilters.categorySearch.trim().toLowerCase();
    const filteredCats = adminState.categories.filter(c =>
      !term || c.name.toLowerCase().includes(term) || c.slug.toLowerCase().includes(term) || (c.category_type || '').toLowerCase().includes(term)
    );

    if (filteredCats.length === 0) {
      cTable.innerHTML = '<tr><td colspan="5" class="empty-state-box">No categories match your search.</td></tr>';
    } else {
      cTable.innerHTML = filteredCats.map(cat => `
        <tr>
          <td>
            <strong>${escapeHtml(cat.name)}</strong>
            <div style="font-size:12px;color:var(--ink-secondary);">${escapeHtml(cat.category_type || 'glasses')} · ${escapeHtml(cat.gender || 'unisex')}</div>
          </td>
          <td><span style="font-family:var(--font-mono);font-size:12px;">${escapeHtml(cat.slug)}</span></td>
          <td>${cat.product_count || 0} items</td>
          <td><span class="badge-status ${cat.is_active ? 'active' : 'archived'}">${cat.is_active ? 'Active' : 'Disabled'}</span></td>
          <td>
            ${isAdmin ? `
              <div style="display:flex;gap:4px;flex-wrap:wrap;">
                <button type="button" class="btn-secondary btn-sm" data-tax-action="edit-category" data-id="${cat.id}">Edit</button>
                <button type="button" class="btn-secondary btn-sm" data-tax-action="toggle-category" data-id="${cat.id}">${cat.is_active ? 'Disable' : 'Enable'}</button>
                <button type="button" class="btn-danger btn-sm" data-tax-action="delete-category" data-id="${cat.id}">Delete</button>
              </div>
            ` : '—'}
          </td>
        </tr>
      `).join('');
    }
  }

  bindTaxonomyActionButtons();
}

function bindTaxonomyActionButtons() {
  document.querySelectorAll('[data-tax-action]').forEach(btn => {
    btn.onclick = () => {
      const action = btn.dataset.taxAction;
      const id = Number(btn.dataset.id);
      if (action === 'edit-brand') openBrandModal(id);
      else if (action === 'toggle-brand') toggleTaxonomyStatus('brands', id);
      else if (action === 'delete-brand') {
        const b = adminState.brands.find(x => x.id === id);
        deleteTaxonomyItem('brands', id, b?.name || 'Brand', b?.product_count || 0);
      } else if (action === 'edit-shape') openShapeModal(id);
      else if (action === 'toggle-shape') toggleTaxonomyStatus('shapes', id);
      else if (action === 'delete-shape') {
        const s = adminState.shapes.find(x => x.id === id);
        deleteTaxonomyItem('shapes', id, s?.name || 'Shape', s?.product_count || 0);
      } else if (action === 'edit-category') openCategoryModal(id);
      else if (action === 'toggle-category') toggleTaxonomyStatus('categories', id);
      else if (action === 'delete-category') {
        const c = adminState.categories.find(x => x.id === id);
        deleteTaxonomyItem('categories', id, c?.name || 'Category', c?.product_count || 0);
      }
    };
  });
}

// ─── BRAND MODAL & LOGO UPLOAD ───
export function openBrandModal(brandId = null) {
  const brand = brandId ? adminState.brands.find(b => b.id === Number(brandId)) : null;
  document.getElementById('tax-brand-modal-title').textContent = brand ? `Edit Brand: ${brand.name}` : 'Add New Optical Brand';
  document.getElementById('tax-brand-id').value = brand ? String(brand.id) : '';
  document.getElementById('tax-brand-modal-name').value = brand ? brand.name : '';
  document.getElementById('tax-brand-modal-slug').value = brand ? brand.slug : '';
  document.getElementById('tax-brand-modal-desc').value = brand ? (brand.description || '') : '';
  document.getElementById('tax-brand-modal-active').checked = brand ? !!brand.is_active : true;
  document.getElementById('tax-brand-logo-file').value = '';

  const preview = document.getElementById('tax-brand-logo-preview');
  const removeBtn = document.getElementById('btn-remove-brand-logo');
  if (preview) {
    if (brand?.logo_url) {
      const src = brand.logo_url.startsWith('/') || brand.logo_url.startsWith('http') ? brand.logo_url : `/${brand.logo_url}`;
      preview.innerHTML = `<img src="${escapeHtml(src)}" alt="${escapeHtml(brand.name)}" />`;
    } else {
      preview.innerHTML = '<span style="font-size:12px;color:var(--ink-secondary);">No logo uploaded</span>';
    }
  }
  if (removeBtn) removeBtn.style.display = brand?.logo_url ? 'inline-flex' : 'none';
  openModal('modal-tax-brand');
}

export async function saveBrandModal(event) {
  event.preventDefault();
  const idVal = document.getElementById('tax-brand-id').value;
  const name = document.getElementById('tax-brand-modal-name').value.trim();
  const slug = document.getElementById('tax-brand-modal-slug').value.trim() || slugifyText(name);
  const description = document.getElementById('tax-brand-modal-desc').value.trim();
  const is_active = document.getElementById('tax-brand-modal-active').checked ? 1 : 0;
  const logoFile = document.getElementById('tax-brand-logo-file').files?.[0];
  const btn = document.getElementById('btn-save-brand-modal');

  if (!name) {
    showToast('Brand name is required.', 'error');
    return;
  }

  try {
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    let brandId = idVal ? Number(idVal) : null;
    if (brandId) {
      await apiRequest(`/brands/${brandId}`, {
        method: 'PUT',
        body: { name, slug, description, is_active }
      });
    } else {
      const res = await apiRequest('/brands', {
        method: 'POST',
        body: { name, slug, description, is_active }
      });
      brandId = res.brand_id;
    }

    if (logoFile && brandId) {
      const fd = new FormData();
      fd.append('logo', logoFile);
      const uploadRes = await fetch(`/api/admin/brands/${brandId}/logo`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminState.token}` },
        body: fd
      });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) {
        throw new Error(uploadData.message || 'Brand saved, but logo upload failed.');
      }
    }

    invalidateProductTaxonomyCache();
    closeModal('modal-tax-brand');
    showToast(`Brand "${name}" saved.`, 'success');
    await loadTaxonomy();
  } catch (err) {
    showToast(err.message || 'Failed to save brand.', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Save Brand'; }
  }
}

export async function removeBrandLogo() {
  const brandId = Number(document.getElementById('tax-brand-id').value);
  if (!brandId) return;
  try {
    await apiRequest(`/brands/${brandId}/logo`, { method: 'DELETE' });
    document.getElementById('tax-brand-logo-preview').innerHTML = '<span style="font-size:12px;color:var(--ink-secondary);">No logo</span>';
    document.getElementById('btn-remove-brand-logo').style.display = 'none';
    showToast('Brand logo removed.', 'info');
    loadTaxonomy();
  } catch (err) {
    showToast(err.message || 'Failed to remove brand logo.', 'error');
  }
}

export async function handleCreateBrand(event) {
  event.preventDefault();
  const form = event.target;
  const name = form.name.value.trim();
  const slug = form.slug.value.trim() || slugifyText(name);
  if (!name) return;

  try {
    await apiRequest('/brands', {
      method: 'POST',
      body: { name, slug, description: form.description?.value.trim() || '', is_active: 1 }
    });
    invalidateProductTaxonomyCache();
    showToast(`Brand "${name}" created.`, 'success');
    form.reset();
    loadTaxonomy();
  } catch (err) {
    showToast(err.message || 'Failed to create brand.', 'error');
  }
}

// ─── SHAPE MODAL & SVG PRESETS ───
export function openShapeModal(shapeId = null) {
  const shape = shapeId ? adminState.shapes.find(s => s.id === Number(shapeId)) : null;
  document.getElementById('tax-shape-modal-title').textContent = shape ? `Edit Shape: ${shape.name}` : 'Add Frame Shape';
  document.getElementById('tax-shape-id').value = shape ? String(shape.id) : '';
  document.getElementById('tax-shape-name').value = shape ? shape.name : '';
  document.getElementById('tax-shape-slug').value = shape ? shape.slug : '';
  document.getElementById('tax-shape-order').value = shape ? String(shape.display_order || 0) : String(adminState.shapes.length + 1);
  document.getElementById('tax-shape-svg').value = shape ? (shape.icon_svg || SHAPE_SVG_PRESETS.round) : SHAPE_SVG_PRESETS.round;
  document.getElementById('tax-shape-active').checked = shape ? !!shape.is_active : true;
  updateShapeSvgPreview();
  openModal('modal-tax-shape');
}

export function selectShapePreset(presetKey) {
  const svg = SHAPE_SVG_PRESETS[presetKey];
  if (!svg) return;
  const svgInput = document.getElementById('tax-shape-svg');
  if (svgInput) svgInput.value = svg;
  updateShapeSvgPreview();
}

export function updateShapeSvgPreview() {
  const box = document.getElementById('tax-shape-svg-preview');
  const raw = document.getElementById('tax-shape-svg')?.value || '';
  if (box) {
    box.innerHTML = raw.toLowerCase().includes('<svg') && !/<script|on\w+\s*=/i.test(raw)
      ? raw
      : '<span style="font-size:11px;color:#991b1b;">Invalid SVG</span>';
  }
}

export async function saveShapeModal(event) {
  event.preventDefault();
  const idVal = document.getElementById('tax-shape-id').value;
  const name = document.getElementById('tax-shape-name').value.trim();
  const slug = document.getElementById('tax-shape-slug').value.trim() || slugifyText(name);
  const display_order = Number(document.getElementById('tax-shape-order').value || 0);
  const icon_svg = document.getElementById('tax-shape-svg').value.trim();
  const is_active = document.getElementById('tax-shape-active').checked ? 1 : 0;

  if (!name) {
    showToast('Shape name is required.', 'error');
    return;
  }

  try {
    if (idVal) {
      await apiRequest(`/shapes/${idVal}`, {
        method: 'PUT',
        body: { name, slug, icon_svg, display_order, is_active }
      });
    } else {
      await apiRequest('/shapes', {
        method: 'POST',
        body: { name, slug, icon_svg, display_order, is_active }
      });
    }
    invalidateProductTaxonomyCache();
    closeModal('modal-tax-shape');
    showToast(`Frame shape "${name}" saved.`, 'success');
    await loadTaxonomy();
  } catch (err) {
    showToast(err.message || 'Failed to save frame shape.', 'error');
  }
}

// ─── CATEGORY MODAL ───
export function openCategoryModal(categoryId = null) {
  const cat = categoryId ? adminState.categories.find(c => c.id === Number(categoryId)) : null;
  document.getElementById('tax-cat-modal-title').textContent = cat ? `Edit Category: ${cat.name}` : 'Add Frame Category';
  document.getElementById('tax-cat-id').value = cat ? String(cat.id) : '';
  document.getElementById('tax-cat-name').value = cat ? cat.name : '';
  document.getElementById('tax-cat-slug').value = cat ? cat.slug : '';
  document.getElementById('tax-cat-type').value = cat ? (cat.category_type || 'glasses') : 'glasses';
  document.getElementById('tax-cat-gender').value = cat ? (cat.gender || 'unisex') : 'unisex';
  document.getElementById('tax-cat-desc').value = cat ? (cat.description || '') : '';
  document.getElementById('tax-cat-order').value = cat ? String(cat.display_order || 0) : String(adminState.categories.length + 1);
  document.getElementById('tax-cat-active').checked = cat ? !!cat.is_active : true;
  openModal('modal-tax-category');
}

export async function saveCategoryModal(event) {
  event.preventDefault();
  const idVal = document.getElementById('tax-cat-id').value;
  const name = document.getElementById('tax-cat-name').value.trim();
  const slug = document.getElementById('tax-cat-slug').value.trim() || slugifyText(name);
  const category_type = document.getElementById('tax-cat-type').value;
  const gender = document.getElementById('tax-cat-gender').value;
  const description = document.getElementById('tax-cat-desc').value.trim();
  const display_order = Number(document.getElementById('tax-cat-order').value || 0);
  const is_active = document.getElementById('tax-cat-active').checked ? 1 : 0;

  if (!name) {
    showToast('Category name is required.', 'error');
    return;
  }

  try {
    if (idVal) {
      await apiRequest(`/categories/${idVal}`, {
        method: 'PUT',
        body: { name, slug, category_type, gender, description, display_order, is_active }
      });
    } else {
      await apiRequest('/categories', {
        method: 'POST',
        body: { name, slug, category_type, gender, description, display_order, is_active }
      });
    }
    invalidateProductTaxonomyCache();
    closeModal('modal-tax-category');
    showToast(`Category "${name}" saved.`, 'success');
    await loadTaxonomy();
  } catch (err) {
    showToast(err.message || 'Failed to save category.', 'error');
  }
}

// ─── ENABLE / DISABLE & DELETE SAFEGUARDS ───
export async function toggleTaxonomyStatus(type, id) {
  const list = type === 'brands' ? adminState.brands : (type === 'shapes' ? adminState.shapes : adminState.categories);
  const item = list.find(x => x.id === Number(id));
  if (!item) return;

  const nextStatus = item.is_active ? 0 : 1;
  try {
    const body = { name: item.name, slug: item.slug, is_active: nextStatus };
    if (type === 'categories') {
      body.category_type = item.category_type || 'glasses';
      body.gender = item.gender || 'unisex';
      body.display_order = item.display_order || 0;
    } else if (type === 'shapes') {
      body.display_order = item.display_order || 0;
      body.icon_svg = item.icon_svg || '';
    } else {
      body.description = item.description || '';
    }

    await apiRequest(`/${type}/${id}`, { method: 'PUT', body });
    invalidateProductTaxonomyCache();
    showToast(`"${item.name}" ${nextStatus ? 'enabled' : 'disabled'}.`, 'success');
    loadTaxonomy();
  } catch (err) {
    showToast(err.message || 'Failed to toggle status.', 'error');
  }
}

export async function deleteTaxonomyItem(type, id, name = 'item', productCount = 0) {
  const singular = type === 'categories' ? 'Category' : (type === 'shapes' ? 'Frame Shape' : 'Optical Brand');
  const refWarning = productCount > 0
    ? ` Warning: ${productCount} frame(s) currently reference "${name}". Deletion will be blocked to protect catalogue integrity unless you reassign them or disable this ${singular.toLowerCase()} instead.`
    : '';

  const confirmed = await requestConfirmation({
    title: `Delete ${singular}`,
    message: `Are you sure you want to permanently delete "${name}"?${refWarning}`,
    confirmLabel: 'Delete',
    danger: true
  });
  if (!confirmed) return;

  try {
    await apiRequest(`/${type}/${id}`, { method: 'DELETE' });
    invalidateProductTaxonomyCache();
    showToast(`${name} deleted.`, 'info');
    loadTaxonomy();
  } catch (err) {
    showToast(err.message || 'Cannot delete referenced item.', 'error');
  }
}
