/**
 * Optii Admin — Customer Enquiries & WhatsApp Follow-Up Module
 */

import { adminState } from '../core/state.js';
import { apiRequest } from '../core/api-client.js';
import { escapeHtml, formatDateTime } from '../shared/formatters.js';
import { showToast } from '../shared/notifications.js';

export async function loadEnquiries() {
  const tbody = document.getElementById('enquiries-table-body');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="7" class="empty-state-box">Loading customer enquiries…</td></tr>';

  try {
    const res = await apiRequest('/enquiries');
    adminState.enquiries = res.enquiries || [];

    if (adminState.enquiries.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-state-box">No customer enquiries recorded yet.</td></tr>';
      return;
    }

    tbody.innerHTML = adminState.enquiries.map(enquiry => {
      let payload = {};
      try {
        payload = JSON.parse(enquiry.enquiry_payload);
      } catch (_) {}

      const cleanPhone = (enquiry.customer_phone || '').replace(/[^0-9]/g, '');
      const productRef = payload.product_name || (payload.items ? `${payload.items.length} item(s) in bag` : 'Optical Consultation');
      const waLink = cleanPhone
        ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(`Hello! Following up from Optii Atelier regarding ${productRef}.`)}`
        : '';

      return `
        <tr>
          <td><span style="font-family:var(--font-mono);font-size:12px;">#${enquiry.id}</span></td>
          <td><strong>${escapeHtml(enquiry.customer_name || 'Customer')}</strong></td>
          <td>${escapeHtml(enquiry.customer_phone || '—')}</td>
          <td><span class="badge-status low_stock">${escapeHtml(enquiry.channel || 'whatsapp')}</span></td>
          <td><strong>${escapeHtml(productRef)}</strong></td>
          <td>${escapeHtml(formatDateTime(enquiry.created_at))}</td>
          <td>
            <select class="admin-select" style="height:30px;font-size:12px;" onchange="OptiiAdmin.updateEnquiryStatus(${enquiry.id}, this.value)" aria-label="Status for enquiry #${enquiry.id}">
              ${['new', 'in_progress', 'converted', 'closed'].map(st => `
                <option value="${st}" ${enquiry.status === st ? 'selected' : ''}>${st.replace(/_/g, ' ').toUpperCase()}</option>
              `).join('')}
            </select>
          </td>
          <td>
            ${waLink
              ? `<a href="${waLink}" target="_blank" rel="noopener noreferrer" class="btn-primary btn-sm" style="background:#065f46;">WhatsApp Follow-up</a>`
              : '—'}
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-state-box" style="color:#991b1b;">Error loading enquiries.</td></tr>';
  }
}

export async function updateEnquiryStatus(id, status) {
  try {
    await apiRequest(`/enquiries/${id}/status`, {
      method: 'PATCH',
      body: { status }
    });
    showToast(`Enquiry #${id} marked as ${status.replace(/_/g, ' ')}.`, 'success');
  } catch (err) {
    showToast(err.message || 'Failed to update enquiry status.', 'error');
    loadEnquiries();
  }
}
