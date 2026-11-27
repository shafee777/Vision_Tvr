/**
 * Optii Admin — Orders & Lab Fulfillment Module
 */

import { adminState } from '../core/state.js';
import { apiRequest } from '../core/api-client.js';
import { debounce, escapeHtml, formatDateTime, formatInr } from '../shared/formatters.js';
import { closeModal, openModal, requestConfirmation, showToast } from '../shared/notifications.js';
import { loadDashboardMetrics } from '../dashboard/dashboard.js';

export async function loadOrders() {
  const tbody = document.getElementById('orders-table-body');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="8" class="empty-state-box">Loading optical orders…</td></tr>';

  try {
    const search = (document.getElementById('orders-search-input')?.value || '').trim();
    const statusFilter = document.getElementById('orders-filter-status')?.value || '';

    const res = await apiRequest(`/orders?search=${encodeURIComponent(search)}&order_status=${encodeURIComponent(statusFilter)}`);
    adminState.orders = res.orders || [];

    if (adminState.orders.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="empty-state-box">No orders match the current filter.</td></tr>';
      return;
    }

    tbody.innerHTML = adminState.orders.map(order => `
      <tr>
        <td><span style="font-family:var(--font-mono);font-weight:700;">${escapeHtml(order.order_number)}</span></td>
        <td>
          <strong>${escapeHtml(order.customer_name)}</strong>
          <div style="font-size:12px;color:var(--ink-secondary);">${escapeHtml(order.customer_phone)}</div>
        </td>
        <td><strong>${formatInr(order.total_amount_inr)}</strong></td>
        <td>
          <span class="badge-status ${escapeHtml(order.payment_status)}">${escapeHtml(order.payment_status)} (${escapeHtml(order.payment_method.toUpperCase())})</span>
          ${order.is_simulated_payment
            ? '<span class="badge-status low_stock">Sandbox</span>'
            : '<span class="badge-status in_stock">Live</span>'}
        </td>
        <td><span class="badge-status ${escapeHtml(order.order_status)}">${escapeHtml(order.order_status.replace(/_/g, ' '))}</span></td>
        <td style="font-size:12px;font-family:var(--font-mono);">${escapeHtml(order.tracking_number || '—')}</td>
        <td>${escapeHtml(formatDateTime(order.created_at))}</td>
        <td>
          <button type="button" class="btn-primary btn-sm" onclick="OptiiAdmin.viewOrderDetail('${escapeHtml(order.order_number)}')">View & Transition</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-state-box" style="color:#991b1b;">Error loading orders.</td></tr>';
  }
}

export const debouncedOrderSearch = debounce(() => loadOrders(), 280);

export async function viewOrderDetail(orderNumber) {
  try {
    const res = await apiRequest(`/orders/${encodeURIComponent(orderNumber)}`);
    if (!res.success || !res.order) return;

    const order = res.order;
    document.getElementById('order-detail-title').textContent = `Order ${order.order_number}`;
    document.getElementById('order-detail-target-num').value = order.order_number;

    const container = document.getElementById('order-detail-content');
    container.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;background:var(--bg-subtle);padding:12px;border-radius:var(--radius-sm);margin-bottom:1rem;font-size:13px;">
        <div>
          <strong>Patron:</strong> ${escapeHtml(order.customer_name)} (${escapeHtml(order.customer_phone)})<br/>
          <strong>Email:</strong> ${escapeHtml(order.customer_email || '—')}<br/>
          <strong>Delivery Mode:</strong> ${order.delivery_method === 'pickup' ? 'Atelier Collection (Thiruvarur)' : 'Express Courier'}
        </div>
        <div>
          <strong>Destination:</strong> ${escapeHtml(order.shipping_address)}, ${escapeHtml(order.city)} — ${escapeHtml(order.pincode)}<br/>
          <strong>Payment Mode:</strong> ${order.is_simulated_payment ? '<span style="color:#92400e;font-weight:700;">Sandbox Simulation (Demo)</span>' : '<span style="color:#166534;font-weight:700;">Live Real Payment</span>'}<br/>
          <strong>Gateway Ref:</strong> <span style="font-family:var(--font-mono);font-size:12px;">${escapeHtml(order.payment_gateway_ref || order.payment_gateway_order_id || 'None')}</span><br/>
          <strong>Payment Status:</strong> <span class="badge-status ${escapeHtml(order.payment_status)}">${escapeHtml(order.payment_status.toUpperCase())}</span>
          ${order.payment_status === 'refunded' ? `<div style="color:#991b1b;font-size:12px;margin-top:2px;">Refunded: ${formatInr(order.refund_amount_inr || order.total_amount_inr)} (${escapeHtml(order.refund_reason || 'Administrative refund')})</div>` : ''}
          <br/><strong>Placed:</strong> ${escapeHtml(formatDateTime(order.created_at))}
        </div>
      </div>

      <h4 style="font-size:14px;font-weight:600;margin-bottom:8px;">Silhouettes & Prescription Lenses:</h4>
      <div style="border:1px solid var(--border-light);border-radius:var(--radius-sm);padding:10px;margin-bottom:1rem;">
        ${(order.items || []).map(item => `
          <div style="padding:8px 0;border-bottom:1px dashed var(--border-light);font-size:13px;">
            <div style="display:flex;justify-content:space-between;">
              <strong>${escapeHtml(item.product_name || item.name)}</strong> (${escapeHtml(item.color_name || 'Standard')}) × ${item.quantity || 1}
              <span>${formatInr(item.total_price_inr || item.price_inr || 0)}</span>
            </div>
            <div style="font-size:12px;color:var(--ink-secondary);margin-top:2px;">
              ${item.configured_lenses ? `${escapeHtml(item.configured_lenses.usage_name || item.configured_lenses.usage)} · ${escapeHtml(item.configured_lenses.thickness_name || item.configured_lenses.index)} · ${escapeHtml(item.configured_lenses.coating_name || item.configured_lenses.coating)}` : 'Frame Only'}
            </div>
            ${item.prescription_token ? `
              <div style="font-size:12px;background:#ecfdf5;color:#065f46;display:inline-block;padding:2px 6px;border-radius:3px;margin-top:4px;">
                Prescription Token: <strong>${escapeHtml(item.prescription_token)}</strong>
              </div>
            ` : ''}
          </div>
        `).join('')}
      </div>

      ${(order.payment_status === 'paid' && order.order_status !== 'cancelled') ? `
        <div style="background:#fef2f2;border:1px solid #fee2e2;padding:10px;border-radius:var(--radius-sm);margin-bottom:1rem;display:flex;justify-content:space-between;align-items:center;gap:10px;">
          <div>
            <strong style="color:#991b1b;font-size:13px;">Process Financial Refund</strong>
            <div style="font-size:12px;color:#7f1d1d;">Issues reverse refund to customer for ${formatInr(order.total_amount_inr)}.</div>
          </div>
          <button type="button" class="btn-danger btn-sm" onclick="OptiiAdmin.refundOrder('${escapeHtml(order.order_number)}', ${order.total_amount_inr})">Issue Full Refund</button>
        </div>
      ` : ''}

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:1rem;">
        <div class="form-group">
          <label class="form-label" for="order-transition-status">Advance Lifecycle Stage</label>
          <select id="order-transition-status" class="admin-select" style="width:100%;">
            ${['placed', 'processing', 'lab_glazing', 'shipped', 'delivered', 'cancelled'].map(st => `
              <option value="${st}" ${order.order_status === st ? 'selected' : ''}>${st.replace(/_/g, ' ').toUpperCase()}</option>
            `).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label" for="order-transition-tracking">Manual Tracking Reference (Not live courier sync)</label>
          <input type="text" id="order-transition-tracking" class="form-control" value="${escapeHtml(order.tracking_number || '')}" placeholder="BLUEDART-OPT-XXXXXX" />
        </div>
      </div>
    `;

    openModal('modal-order-detail');
  } catch (err) {
    showToast(err.message || 'Error opening order details.', 'error');
  }
}

export async function refundOrder(orderNumber, amount) {
  const confirmed = await requestConfirmation({
    title: `Refund Order #${orderNumber}`,
    message: `Process a full refund of ${formatInr(amount)} for order #${orderNumber}?`,
    confirmLabel: 'Issue Refund',
    danger: true
  });
  if (!confirmed) return;

  try {
    const res = await apiRequest(`/orders/${encodeURIComponent(orderNumber)}/payment`, {
      method: 'PATCH',
      body: { action: 'refund', amount_inr: amount, reason: 'Staff initiated refund from Atelier admin portal' }
    });
    if (res.success) {
      showToast(`Refund processed for order #${orderNumber}.`, 'success');
      closeModal('modal-order-detail');
      loadOrders();
      if (adminState.activeSection === 'dashboard') loadDashboardMetrics();
    }
  } catch (err) {
    showToast(err.message || 'Error processing refund.', 'error');
  }
}

export async function handleOrderTransition() {
  const orderNumber = document.getElementById('order-detail-target-num').value;
  const status = document.getElementById('order-transition-status').value;
  const tracking = document.getElementById('order-transition-tracking').value.trim();

  try {
    const res = await apiRequest(`/orders/${encodeURIComponent(orderNumber)}/status`, {
      method: 'PATCH',
      body: { order_status: status, tracking_number: tracking }
    });

    if (res.success) {
      showToast(res.message, 'success');
      closeModal('modal-order-detail');
      loadOrders();
    }
  } catch (err) {
    showToast(err.message || 'Error updating order status.', 'error');
  }
}
