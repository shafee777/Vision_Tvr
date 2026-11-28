/**
 * Optii Admin — Store Identity, Logo Branding, Contact & Operating Hours Settings
 */

import { adminState } from '../core/state.js';
import { apiRequest } from '../core/api-client.js';
import { escapeHtml } from '../shared/formatters.js';
import { requestConfirmation, showToast } from '../shared/notifications.js';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export async function loadSettings() {
  try {
    const res = await apiRequest('/settings');
    if (!res.success) return;

    const store = res.store || {};
    const settingsMap = res.settingsMap || {};
    adminState.store = store;

    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val ?? '';
    };

    setVal('set-store-name', store.name);
    setVal('set-store-desc', store.description);
    setVal('set-store-address', store.address);
    setVal('set-store-city', store.city);
    setVal('set-store-phone', store.phone);
    setVal('set-store-whatsapp', store.whatsapp_number || settingsMap.whatsapp_number || store.phone);
    setVal('set-store-email', store.email);
    setVal('set-store-slot-interval', store.slot_interval_minutes || 30);
    setVal('set-store-map-url', store.map_url);
    setVal('set-store-instagram', store.instagram_url);
    setVal('set-store-facebook', store.facebook_url);
    setVal('set-store-announcement', settingsMap.announcement_text || '');

    renderStoreLogoPreview(store.logo_url);
    renderStoreHoursEditor(res.hours || []);
  } catch (err) {
    showToast('Error loading store settings.', 'error');
  }
}

function renderStoreLogoPreview(logoUrl) {
  const preview = document.getElementById('set-store-logo-preview');
  const removeBtn = document.getElementById('btn-remove-store-logo');
  if (!preview) return;

  if (logoUrl) {
    const src = logoUrl.startsWith('/') || logoUrl.startsWith('http') ? logoUrl : `/${logoUrl}`;
    preview.innerHTML = `<img src="${escapeHtml(src)}" alt="Store logo" />`;
    if (removeBtn) removeBtn.style.display = 'inline-flex';
  } else {
    preview.innerHTML = '<span style="font-size:12px;color:var(--ink-secondary);">Text wordmark active (no logo uploaded)</span>';
    if (removeBtn) removeBtn.style.display = 'none';
  }
}

export function previewStoreLogoFile(input) {
  const file = input.files?.[0];
  if (!file) return;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    showToast('Logo must be JPEG, PNG, or WebP.', 'error');
    input.value = '';
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    showToast('Logo image cannot exceed 5 MB.', 'error');
    input.value = '';
    return;
  }
  const url = URL.createObjectURL(file);
  const preview = document.getElementById('set-store-logo-preview');
  if (preview) {
    preview.innerHTML = `<img src="${url}" alt="Selected logo preview" />`;
  }
}

export async function uploadStoreLogo() {
  const input = document.getElementById('set-store-logo-input');
  const file = input?.files?.[0];
  if (!file) {
    showToast('Select a logo file (JPEG, PNG, or WebP) first.', 'error');
    return;
  }

  const btn = document.getElementById('btn-upload-store-logo');
  try {
    if (btn) { btn.disabled = true; btn.textContent = 'Uploading…'; }
    const fd = new FormData();
    fd.append('logo', file);

    const res = await fetch('/api/admin/settings/logo', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminState.token}` },
      body: fd
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Logo upload failed.');
    }

    input.value = '';
    renderStoreLogoPreview(data.logo_url);
    showToast(data.message || 'Store logo saved.', 'success');
  } catch (err) {
    showToast(err.message || 'Failed to upload store logo.', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Upload Logo'; }
  }
}

export async function removeStoreLogo() {
  const confirmed = await requestConfirmation({
    title: 'Remove Store Logo',
    message: 'Remove the uploaded store logo and revert the storefront header to the text wordmark?',
    confirmLabel: 'Remove Logo',
    danger: true
  });
  if (!confirmed) return;

  try {
    const res = await apiRequest('/settings/logo', { method: 'DELETE' });
    renderStoreLogoPreview('');
    showToast(res.message || 'Store logo removed.', 'info');
  } catch (err) {
    showToast(err.message || 'Failed to remove store logo.', 'error');
  }
}

function renderStoreHoursEditor(hours) {
  const tbody = document.getElementById('set-store-hours-body');
  if (!tbody) return;

  const byDay = new Map(hours.map(h => [Number(h.day_of_week), h]));
  tbody.innerHTML = DAY_NAMES.map((dayName, idx) => {
    const row = byDay.get(idx) || { day_of_week: idx, open_time: '10:00', close_time: idx === 0 ? '14:00' : '20:00', is_closed: 0 };
    return `
      <tr data-hour-day="${idx}">
        <td><strong>${dayName}</strong></td>
        <td>
          <label style="display:inline-flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;">
            <input type="checkbox" class="hour-closed-chk" ${row.is_closed ? 'checked' : ''} /> Closed
          </label>
        </td>
        <td><input type="time" class="form-control hour-open-inp" value="${escapeHtml(row.open_time || '10:00')}" style="height:32px;font-size:12px;" /></td>
        <td><input type="time" class="form-control hour-close-inp" value="${escapeHtml(row.close_time || '20:00')}" style="height:32px;font-size:12px;" /></td>
      </tr>
    `;
  }).join('');
}

export async function handleSaveSettings(event) {
  event.preventDefault();
  const form = event.target;
  const submitBtn = form.querySelector('button[type="submit"]');

  const getVal = (id) => (document.getElementById(id)?.value || '').trim();
  const name = getVal('set-store-name');
  const address = getVal('set-store-address');
  const phone = getVal('set-store-phone');

  if (!name || !address || !phone) {
    showToast('Store name, physical address, and phone number are required.', 'error');
    return;
  }

  const hours = [];
  document.querySelectorAll('#set-store-hours-body tr[data-hour-day]').forEach(tr => {
    hours.push({
      day_of_week: Number(tr.dataset.hourDay),
      is_closed: tr.querySelector('.hour-closed-chk')?.checked ? 1 : 0,
      open_time: tr.querySelector('.hour-open-inp')?.value || '10:00',
      close_time: tr.querySelector('.hour-close-inp')?.value || '20:00'
    });
  });

  const payload = {
    name,
    address,
    city: getVal('set-store-city'),
    phone,
    whatsapp_number: getVal('set-store-whatsapp') || phone,
    email: getVal('set-store-email'),
    description: getVal('set-store-desc'),
    map_url: getVal('set-store-map-url'),
    instagram_url: getVal('set-store-instagram'),
    facebook_url: getVal('set-store-facebook'),
    announcement_text: getVal('set-store-announcement'),
    slot_interval_minutes: Number(getVal('set-store-slot-interval') || 30),
    hours
  };

  try {
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Saving Store Settings…';
    }

    const res = await apiRequest('/settings', {
      method: 'PUT',
      body: payload
    });

    if (res && res.success) {
      adminState.store = res.store;
      showToast(res.message || 'Store settings saved.', 'success');
    } else {
      throw new Error(res?.message || 'Unable to save store settings.');
    }
  } catch (err) {
    showToast(err.message || 'Failed to save store settings.', 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Save Store Settings';
    }
  }
}
