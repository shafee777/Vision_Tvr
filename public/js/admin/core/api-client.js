/**
 * Optii Admin — Centralized HTTP API Client
 */

import { adminState } from './state.js';
import { showToast } from '../shared/notifications.js';

let onSessionExpiredCallback = null;

export function setOnSessionExpired(callback) {
  onSessionExpiredCallback = callback;
}

export async function apiRequest(endpoint, options = {}) {
  const url = endpoint.startsWith('/api') ? endpoint : `/api/admin${endpoint}`;
  const headers = {
    Accept: 'application/json',
    Authorization: `Bearer ${adminState.token}`,
    ...(options.headers || {})
  };

  const fetchOptions = { ...options, headers };

  if (fetchOptions.body && typeof fetchOptions.body === 'object' && !(fetchOptions.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    fetchOptions.body = JSON.stringify(fetchOptions.body);
  }

  const response = await fetch(url, fetchOptions);
  const data = await response.json().catch(() => ({}));

  if (response.status === 401 || (response.status === 403 && data.message?.toLowerCase().includes('expired'))) {
    showToast('Session expired. Please sign in again.', 'error');
    if (onSessionExpiredCallback) onSessionExpiredCallback();
    throw new Error('Session expired');
  }

  if (!response.ok) {
    const err = new Error(data.message || `Request failed (${response.status})`);
    err.status = response.status;
    err.data = data;
    throw err;
  }

  return data;
}

export async function downloadAuthenticatedCsv(endpoint, defaultFilename) {
  const url = endpoint.startsWith('/api') ? endpoint : `/api/admin${endpoint}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${adminState.token}`
    }
  });

  if (response.status === 401) {
    showToast('Session expired. Please sign in again.', 'error');
    if (onSessionExpiredCallback) onSessionExpiredCallback();
    throw new Error('Session expired');
  }

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.message || `Download failed (${response.status})`);
  }

  const blob = await response.blob();
  const disposition = response.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="?([^"]+)"?/i);
  const filename = match ? match[1] : defaultFilename;

  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}
