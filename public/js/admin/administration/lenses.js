/**
 * Optii Admin — Complete 4-Step Lens Pricing & Optical Tiers Module
 */

import { adminState } from '../core/state.js';
import { apiRequest } from '../core/api-client.js';
import { escapeHtml, formatInr } from '../shared/formatters.js';
import { closeModal, openModal, showToast } from '../shared/notifications.js';

export async function loadLenses() {
  try {
    const res = await apiRequest('/lenses');
    adminState.lenses = res;

    // Step 1: Lens Usages
    const usagesBody = document.getElementById('lenses-usages-body');
    if (usagesBody) {
      usagesBody.innerHTML = (res.usages || []).map(usage => `
        <tr>
          <td><strong>${escapeHtml(usage.name)}</strong></td>
          <td style="font-size:12px;color:var(--ink-secondary);">${escapeHtml(usage.description || '—')}</td>
          <td><strong>${formatInr(usage.base_price_inr)}</strong></td>
          <td><span class="badge-status ${usage.is_active ? 'active' : 'archived'}">${usage.is_active ? 'Active' : 'Disabled'}</span></td>
          <td>
            <button type="button" class="btn-secondary btn-sm" onclick="OptiiAdmin.openLensModal('usage', ${usage.id})">Edit Option</button>
          </td>
        </tr>
      `).join('') || '<tr><td colspan="5" class="empty-state-box">No usage options configured.</td></tr>';
    }

    // Step 2: Prescription Verification & Input Rules
    const rxBody = document.getElementById('lenses-rx-body');
    if (rxBody) {
      rxBody.innerHTML = (res.prescription_options || []).map(opt => `
        <tr>
          <td>
            <strong>${escapeHtml(opt.name)}</strong>
            <div style="font-size:12px;color:var(--ink-secondary);">${escapeHtml(opt.description || '—')}</div>
          </td>
          <td style="font-family:var(--font-mono);font-size:12px;">SPH ${opt.sph_min} to +${opt.sph_max} · CYL ${opt.cyl_min} to +${opt.cyl_max} · PD ${opt.pd_min}–${opt.pd_max}mm</td>
          <td><strong>${formatInr(opt.fee_inr)}</strong></td>
          <td><span class="badge-status ${opt.is_active ? 'active' : 'archived'}">${opt.is_active ? 'Active' : 'Disabled'}</span></td>
          <td>
            <button type="button" class="btn-secondary btn-sm" onclick="OptiiAdmin.editStep2Option(${opt.id})">Configure</button>
          </td>
        </tr>
      `).join('') || '<tr><td colspan="5" class="empty-state-box">Step 2 prescription options not configured.</td></tr>';
    }

    // Step 3: Lens Thicknesses
    const thickBody = document.getElementById('lenses-thicknesses-body');
    if (thickBody) {
      thickBody.innerHTML = (res.thicknesses || []).map(thickness => `
        <tr>
          <td><strong>${escapeHtml(thickness.name)}</strong> (${thickness.index_rating})</td>
          <td style="font-size:12px;color:var(--ink-secondary);">${escapeHtml(thickness.recommended_sph_range || '—')}</td>
          <td><strong>+${formatInr(thickness.price_inr)}</strong></td>
          <td><span class="badge-status ${thickness.is_active ? 'active' : 'archived'}">${thickness.is_active ? 'Active' : 'Disabled'}</span></td>
          <td>
            <button type="button" class="btn-secondary btn-sm" onclick="OptiiAdmin.openLensModal('thickness', ${thickness.id})">Edit Option</button>
          </td>
        </tr>
      `).join('') || '<tr><td colspan="5" class="empty-state-box">No lens thickness profiles configured.</td></tr>';
    }

    // Step 4: Coatings
    const coatBody = document.getElementById('lenses-coatings-body');
    if (coatBody) {
      coatBody.innerHTML = (res.coatings || []).map(coating => `
        <tr>
          <td><strong>${escapeHtml(coating.name)}</strong></td>
          <td style="font-size:12px;color:var(--ink-secondary);">${escapeHtml(coating.description || '—')}</td>
          <td><strong>+${formatInr(coating.price_inr)}</strong></td>
          <td><span class="badge-status ${coating.is_active ? 'active' : 'archived'}">${coating.is_active ? 'Active' : 'Disabled'}</span></td>
          <td>
            <button type="button" class="btn-secondary btn-sm" onclick="OptiiAdmin.openLensModal('coating', ${coating.id})">Edit Option</button>
          </td>
        </tr>
      `).join('') || '<tr><td colspan="5" class="empty-state-box">No coatings configured.</td></tr>';
    }
  } catch (err) {
    showToast('Error loading lens configuration options.', 'error');
    ['lenses-usages-body', 'lenses-rx-body', 'lenses-thicknesses-body', 'lenses-coatings-body'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = '<tr><td colspan="5" class="empty-state-box" style="color:#991b1b;">Unable to load lens options. Please refresh or check server migrations.</td></tr>';
    });
  }
}

export function openLensModal(category, id = null) {
  const data = adminState.lenses || {};
  let item = null;
  if (id) {
    const list = category === 'usage' ? data.usages : (category === 'thickness' ? data.thicknesses : data.coatings);
    item = (list || []).find(x => x.id === Number(id));
  }

  document.getElementById('lens-price-category').value = category;
  document.getElementById('lens-price-id').value = item ? String(item.id) : '';
  document.getElementById('lens-price-modal-title').textContent = item
    ? `Edit ${category === 'usage' ? 'Usage' : (category === 'thickness' ? 'Thickness' : 'Coating')}`
    : `Add ${category === 'usage' ? 'Lens Usage' : (category === 'thickness' ? 'Lens Thickness' : 'Lens Coating')}`;

  document.getElementById('lens-edit-name').value = item ? item.name : '';
  document.getElementById('lens-edit-desc').value = item ? (item.description || '') : '';
  document.getElementById('lens-price-input').value = item
    ? (category === 'usage' ? item.base_price_inr : item.price_inr)
    : 0;
  document.getElementById('lens-edit-active').checked = item ? !!item.is_active : true;

  const thicknessExtra = document.getElementById('lens-thickness-extra-fields');
  if (thicknessExtra) {
    thicknessExtra.style.display = category === 'thickness' ? 'grid' : 'none';
    if (category === 'thickness') {
      document.getElementById('lens-edit-index').value = item ? item.index_rating : '1.60';
      document.getElementById('lens-edit-sph-range').value = item ? (item.recommended_sph_range || '') : '';
    }
  }

  openModal('modal-edit-lens-price');
}

// Keep compatibility alias
export function editLensPrice(category, id) {
  openLensModal(category, id);
}

export async function handleSaveLensPrice(event) {
  event.preventDefault();
  const category = document.getElementById('lens-price-category').value;
  const idVal = document.getElementById('lens-price-id').value;
  const name = document.getElementById('lens-edit-name').value.trim();
  const description = document.getElementById('lens-edit-desc').value.trim();
  const newPrice = Number(document.getElementById('lens-price-input').value);
  const is_active = document.getElementById('lens-edit-active').checked ? 1 : 0;

  if (!name) {
    showToast('Option name is required.', 'error');
    return;
  }
  if (Number.isNaN(newPrice) || newPrice < 0) {
    showToast('Please enter a valid non-negative INR amount.', 'error');
    return;
  }

  const isCreate = !idVal;
  let endpoint = '';
  const payload = { name, description, is_active };

  if (category === 'usage') {
    endpoint = isCreate ? '/lenses/usages' : `/lenses/usages/${idVal}`;
    payload.base_price_inr = newPrice;
  } else if (category === 'thickness') {
    endpoint = isCreate ? '/lenses/thicknesses' : `/lenses/thicknesses/${idVal}`;
    payload.price_inr = newPrice;
    payload.index_rating = Number(document.getElementById('lens-edit-index').value || 1.5);
    payload.recommended_sph_range = document.getElementById('lens-edit-sph-range').value.trim();
  } else if (category === 'coating') {
    endpoint = isCreate ? '/lenses/coatings' : `/lenses/coatings/${idVal}`;
    payload.price_inr = newPrice;
  }

  try {
    await apiRequest(endpoint, { method: isCreate ? 'POST' : 'PUT', body: payload });
    showToast(`Saved ${name} (${formatInr(newPrice)})`, 'success');
    closeModal('modal-edit-lens-price');
    loadLenses();
  } catch (err) {
    showToast(err.message || 'Error saving lens option.', 'error');
  }
}

export function editStep2Option(optionId) {
  const opt = (adminState.lenses?.prescription_options || []).find(o => o.id === Number(optionId));
  if (!opt) return;

  document.getElementById('rx-opt-id').value = opt.id;
  document.getElementById('rx-opt-name').value = opt.name || '';
  document.getElementById('rx-opt-desc').value = opt.description || '';
  document.getElementById('rx-opt-fee').value = opt.fee_inr ?? 0;
  document.getElementById('rx-opt-sph-min').value = opt.sph_min ?? -12;
  document.getElementById('rx-opt-sph-max').value = opt.sph_max ?? 8;
  document.getElementById('rx-opt-cyl-min').value = opt.cyl_min ?? -6;
  document.getElementById('rx-opt-cyl-max').value = opt.cyl_max ?? 6;
  document.getElementById('rx-opt-pd-min').value = opt.pd_min ?? 50;
  document.getElementById('rx-opt-pd-max').value = opt.pd_max ?? 75;
  document.getElementById('rx-opt-active').checked = !!opt.is_active;
  openModal('modal-edit-rx-option');
}

export async function saveStep2Option(event) {
  event.preventDefault();
  const id = Number(document.getElementById('rx-opt-id').value);
  const fee_inr = Number(document.getElementById('rx-opt-fee').value);
  if (Number.isNaN(fee_inr) || fee_inr < 0) {
    showToast('Verification fee must be 0 or positive.', 'error');
    return;
  }

  try {
    await apiRequest(`/lenses/prescription-options/${id}`, {
      method: 'PUT',
      body: {
        name: document.getElementById('rx-opt-name').value.trim(),
        description: document.getElementById('rx-opt-desc').value.trim(),
        fee_inr,
        sph_min: Number(document.getElementById('rx-opt-sph-min').value),
        sph_max: Number(document.getElementById('rx-opt-sph-max').value),
        cyl_min: Number(document.getElementById('rx-opt-cyl-min').value),
        cyl_max: Number(document.getElementById('rx-opt-cyl-max').value),
        pd_min: Number(document.getElementById('rx-opt-pd-min').value),
        pd_max: Number(document.getElementById('rx-opt-pd-max').value),
        is_active: document.getElementById('rx-opt-active').checked ? 1 : 0
      }
    });
    showToast('Step 2 prescription rule updated.', 'success');
    closeModal('modal-edit-rx-option');
    loadLenses();
  } catch (err) {
    showToast(err.message || 'Failed to update Step 2 rule.', 'error');
  }
}
