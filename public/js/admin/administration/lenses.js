/**
 * Optii Admin — Lens Pricing & Tiers Module
 */

import { adminState } from '../core/state.js';
import { apiRequest } from '../core/api-client.js';
import { escapeHtml, formatInr } from '../shared/formatters.js';
import { closeModal, openModal, showToast } from '../shared/notifications.js';

export async function loadLenses() {
  try {
    const res = await apiRequest('/lenses');
    adminState.lenses = res;

    const usagesBody = document.getElementById('lenses-usages-body');
    if (usagesBody) {
      usagesBody.innerHTML = (res.usages || []).map(usage => `
        <tr>
          <td><strong>${escapeHtml(usage.name)}</strong></td>
          <td style="font-size:12px;color:var(--ink-secondary);">${escapeHtml(usage.description || '—')}</td>
          <td><strong>${formatInr(usage.base_price_inr)}</strong></td>
          <td><span class="badge-status ${usage.is_active ? 'active' : 'archived'}">${usage.is_active ? 'Active' : 'Disabled'}</span></td>
          <td>
            <button type="button" class="btn-secondary btn-sm" onclick="OptiiAdmin.editLensPrice('usage', ${usage.id}, '${escapeHtml(usage.name)}', ${usage.base_price_inr})">Edit Fee</button>
          </td>
        </tr>
      `).join('');
    }

    const thickBody = document.getElementById('lenses-thicknesses-body');
    if (thickBody) {
      thickBody.innerHTML = (res.thicknesses || []).map(thickness => `
        <tr>
          <td><strong>${escapeHtml(thickness.name)}</strong> (${thickness.index_rating})</td>
          <td style="font-size:12px;color:var(--ink-secondary);">${escapeHtml(thickness.recommended_sph_range || '—')}</td>
          <td><strong>+${formatInr(thickness.price_inr)}</strong></td>
          <td><span class="badge-status ${thickness.is_active ? 'active' : 'archived'}">${thickness.is_active ? 'Active' : 'Disabled'}</span></td>
          <td>
            <button type="button" class="btn-secondary btn-sm" onclick="OptiiAdmin.editLensPrice('thickness', ${thickness.id}, '${escapeHtml(thickness.name)}', ${thickness.price_inr})">Edit Fee</button>
          </td>
        </tr>
      `).join('');
    }

    const coatBody = document.getElementById('lenses-coatings-body');
    if (coatBody) {
      coatBody.innerHTML = (res.coatings || []).map(coating => `
        <tr>
          <td><strong>${escapeHtml(coating.name)}</strong></td>
          <td style="font-size:12px;color:var(--ink-secondary);">${escapeHtml(coating.description || '—')}</td>
          <td><strong>+${formatInr(coating.price_inr)}</strong></td>
          <td><span class="badge-status ${coating.is_active ? 'active' : 'archived'}">${coating.is_active ? 'Active' : 'Disabled'}</span></td>
          <td>
            <button type="button" class="btn-secondary btn-sm" onclick="OptiiAdmin.editLensPrice('coating', ${coating.id}, '${escapeHtml(coating.name)}', ${coating.price_inr})">Edit Fee</button>
          </td>
        </tr>
      `).join('');
    }
  } catch (err) {
    showToast('Error loading lens configuration options.', 'error');
  }
}

export function editLensPrice(category, id, name, currentPrice) {
  document.getElementById('lens-price-category').value = category;
  document.getElementById('lens-price-id').value = id;
  document.getElementById('lens-price-name').value = name;
  document.getElementById('lens-price-label').textContent = name;
  document.getElementById('lens-price-input').value = currentPrice;
  openModal('modal-edit-lens-price');
}

export async function handleSaveLensPrice(event) {
  event.preventDefault();
  const category = document.getElementById('lens-price-category').value;
  const id = Number(document.getElementById('lens-price-id').value);
  const name = document.getElementById('lens-price-name').value;
  const newPrice = Number(document.getElementById('lens-price-input').value);

  if (Number.isNaN(newPrice) || newPrice < 0) {
    showToast('Please enter a valid non-negative INR amount.', 'error');
    return;
  }

  let endpoint = '';
  let payload = {};
  if (category === 'usage') {
    endpoint = `/lenses/usages/${id}`;
    payload = { base_price_inr: newPrice };
  } else if (category === 'thickness') {
    endpoint = `/lenses/thicknesses/${id}`;
    payload = { price_inr: newPrice };
  } else if (category === 'coating') {
    endpoint = `/lenses/coatings/${id}`;
    payload = { price_inr: newPrice };
  }

  try {
    await apiRequest(endpoint, { method: 'PUT', body: payload });
    showToast(`Updated ${name} price to ${formatInr(newPrice)}`, 'success');
    closeModal('modal-edit-lens-price');
    loadLenses();
  } catch (err) {
    showToast(err.message || 'Error updating lens price.', 'error');
  }
}
