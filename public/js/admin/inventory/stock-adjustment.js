/**
 * Optii Admin — Single SKU Stock Adjustment Modal with Live Preview
 */

import { adminState } from '../core/state.js';
import { apiRequest } from '../core/api-client.js';
import { closeModal, openModal, showToast } from '../shared/notifications.js';
import { loadInventoryItems } from './inventory.js';
import { loadDashboardMetrics } from '../dashboard/dashboard.js';

let currentPreviousStock = 0;

export function openStockAdjustModal(variantId, sku, productName, currentStock) {
  currentPreviousStock = Number(currentStock || 0);
  document.getElementById('adj-variant-id').value = variantId;
  document.getElementById('adj-item-title').textContent = `${productName} (${sku})`;
  document.getElementById('adj-current-stock').textContent = `${currentPreviousStock} units currently in atelier stock`;
  document.getElementById('adj-delta').value = '1';
  document.getElementById('adj-reason').value = '';
  updateAdjustedStockPreview();
  openModal('modal-adjust-stock');
}

export function updateAdjustedStockPreview() {
  const deltaInput = document.getElementById('adj-delta');
  const previewEl = document.getElementById('adj-new-stock-preview');
  const submitBtn = document.getElementById('btn-commit-stock-adjust');
  if (!deltaInput || !previewEl) return;

  const delta = Number(deltaInput.value);
  if (Number.isNaN(delta) || delta === 0 || !Number.isInteger(delta)) {
    previewEl.textContent = 'Enter a non-zero integer';
    previewEl.style.color = '#991b1b';
    if (submitBtn) submitBtn.disabled = true;
    return;
  }

  const nextQty = currentPreviousStock + delta;
  if (nextQty < 0) {
    previewEl.textContent = `${nextQty} (Invalid — cannot go below 0)`;
    previewEl.style.color = '#991b1b';
    if (submitBtn) submitBtn.disabled = true;
  } else {
    previewEl.textContent = `${nextQty} units (${delta > 0 ? '+' : ''}${delta})`;
    previewEl.style.color = '#065f46';
    if (submitBtn) submitBtn.disabled = false;
  }
}

export async function submitStockAdjustment(event) {
  event.preventDefault();
  const form = event.target;
  const variantId = Number(document.getElementById('adj-variant-id').value);
  const delta = Number(form.change_quantity.value);
  const movementType = form.movement_type.value;
  const reason = form.reason.value.trim();

  if (!Number.isInteger(delta) || delta === 0) {
    showToast('Adjustment delta must be a non-zero whole number.', 'error');
    return;
  }
  if (currentPreviousStock + delta < 0) {
    showToast(`Cannot reduce stock below 0 (current stock: ${currentPreviousStock}).`, 'error');
    return;
  }
  if (reason.length < 5) {
    showToast('Please provide a clear operational reason (min 5 characters).', 'error');
    return;
  }

  try {
    const res = await apiRequest('/inventory/adjust', {
      method: 'POST',
      body: {
        variant_id: variantId,
        change_quantity: delta,
        movement_type: movementType,
        reason
      }
    });

    if (res.success) {
      showToast(res.message, 'success');
      closeModal('modal-adjust-stock');
      if (adminState.activeSection === 'inventory') {
        loadInventoryItems();
      } else if (adminState.activeSection === 'dashboard') {
        loadDashboardMetrics();
      }
    }
  } catch (err) {
    showToast(err.message || 'Failed to adjust stock.', 'error');
  }
}
