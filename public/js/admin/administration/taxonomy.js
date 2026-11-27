/**
 * Optii Admin — Brands, Shapes & Categories Management
 */

import { adminState } from '../core/state.js';
import { apiRequest } from '../core/api-client.js';
import { escapeHtml, slugifyText } from '../shared/formatters.js';
import { requestConfirmation, showToast } from '../shared/notifications.js';

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
    const isAdmin = adminState.user?.role === 'admin';

    const bTable = document.getElementById('taxonomy-brands-body');
    if (bTable) {
      bTable.innerHTML = adminState.brands.map(brand => `
        <tr>
          <td><strong>${escapeHtml(brand.name)}</strong></td>
          <td><span style="font-family:var(--font-mono);font-size:12px;">${escapeHtml(brand.slug)}</span></td>
          <td>${brand.product_count || 0} products</td>
          <td>
            ${isAdmin ? `<button type="button" class="btn-danger btn-sm" onclick="OptiiAdmin.deleteTaxonomyItem('brands', ${brand.id}, '${escapeHtml(brand.name)}')">Delete</button>` : '—'}
          </td>
        </tr>
      `).join('');
    }

    const sTable = document.getElementById('taxonomy-shapes-body');
    if (sTable) {
      sTable.innerHTML = adminState.shapes.map(shape => `
        <tr>
          <td>
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="display:inline-flex;width:36px;height:20px;align-items:center;justify-content:center;color:var(--ink-primary);">
                ${shape.icon_svg || '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8"/></svg>'}
              </span>
              <strong>${escapeHtml(shape.name)}</strong>
            </div>
          </td>
          <td><span style="font-family:var(--font-mono);font-size:12px;">${escapeHtml(shape.slug)}</span></td>
          <td>${shape.product_count || 0} frames</td>
          <td>
            ${isAdmin ? `<button type="button" class="btn-danger btn-sm" onclick="OptiiAdmin.deleteTaxonomyItem('shapes', ${shape.id}, '${escapeHtml(shape.name)}')">Delete</button>` : '—'}
          </td>
        </tr>
      `).join('');
    }

    const cTable = document.getElementById('taxonomy-cats-body');
    if (cTable) {
      cTable.innerHTML = adminState.categories.map(cat => `
        <tr>
          <td><strong>${escapeHtml(cat.name)}</strong></td>
          <td><span style="font-family:var(--font-mono);font-size:12px;">${escapeHtml(cat.slug)}</span></td>
          <td>${cat.product_count || 0} items</td>
          <td>—</td>
        </tr>
      `).join('');
    }
  } catch (err) {
    showToast('Error loading brands, shapes, and categories.', 'error');
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
      body: { name, slug, description: form.description?.value.trim() || '' }
    });
    showToast(`Brand "${name}" created.`, 'success');
    form.reset();
    loadTaxonomy();
  } catch (err) {
    showToast(err.message || 'Failed to create brand.', 'error');
  }
}

export async function deleteTaxonomyItem(type, id, name = 'item') {
  const confirmed = await requestConfirmation({
    title: `Delete ${type.slice(0, -1)}`,
    message: `Delete "${name}"? Deletion is blocked if active products still reference it.`,
    confirmLabel: 'Delete',
    danger: true
  });
  if (!confirmed) return;

  try {
    await apiRequest(`/${type}/${id}`, { method: 'DELETE' });
    showToast(`${name} deleted.`, 'info');
    loadTaxonomy();
  } catch (err) {
    showToast(err.message || 'Cannot delete referenced item.', 'error');
  }
}
