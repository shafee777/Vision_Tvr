/**
 * Optii Admin — Clinic & Store Settings Module
 */

import { adminState } from '../core/state.js';
import { apiRequest } from '../core/api-client.js';
import { showToast } from '../shared/notifications.js';

export async function loadSettings() {
  try {
    const res = await apiRequest('/settings');
    if (!res.success) return;

    const store = res.store || {};
    adminState.store = store;
    const nameEl = document.getElementById('set-store-name');
    const addrEl = document.getElementById('set-store-address');
    const phoneEl = document.getElementById('set-store-phone');
    if (nameEl) nameEl.value = store.name || '';
    if (addrEl) addrEl.value = store.address || '';
    if (phoneEl) phoneEl.value = store.phone || '';
  } catch (err) {
    showToast('Error loading clinic settings.', 'error');
  }
}

export async function handleSaveSettings(event) {
  event.preventDefault();
  const form = event.target;
  const submitBtn = form.querySelector('button[type="submit"]');
  const name = (document.getElementById('set-store-name')?.value || '').trim();
  const address = (document.getElementById('set-store-address')?.value || '').trim();
  const phone = (document.getElementById('set-store-phone')?.value || '').trim();

  if (!name || !address || !phone) {
    showToast('Atelier name, address, and WhatsApp number are required.', 'error');
    return;
  }

  try {
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Saving…';
    }

    const res = await apiRequest('/settings', {
      method: 'PUT',
      body: { name, address, phone }
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
      submitBtn.textContent = 'Save Atelier Settings';
    }
  }
}
