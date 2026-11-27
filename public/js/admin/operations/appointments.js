/**
 * Optii Admin — Eye Test Appointments Queue Controller
 */

import { adminState } from '../core/state.js';
import { apiRequest } from '../core/api-client.js';
import { escapeHtml } from '../shared/formatters.js';
import { closeModal, openModal, requestConfirmation, showToast } from '../shared/notifications.js';

export async function loadAppointments() {
  const tbody = document.getElementById('appointments-table-body');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="8" class="empty-state-box">Loading patient consultations…</td></tr>';

  try {
    const statusFilter = document.getElementById('appt-filter-status')?.value || '';
    const scopeFilter = document.getElementById('appt-filter-scope')?.value || '';
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    if (scopeFilter) params.set('scope', scopeFilter);

    const res = await apiRequest(`/appointments?${params.toString()}`);
    adminState.appointments = res.appointments || [];

    if (adminState.appointments.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="empty-state-box">No appointments match the selected filter.</td></tr>';
      return;
    }

    tbody.innerHTML = adminState.appointments.map(appt => `
      <tr>
        <td><span style="font-family:var(--font-mono);font-weight:700;">${escapeHtml(appt.appointment_number)}</span></td>
        <td><strong>${escapeHtml(appt.customer_name)}</strong></td>
        <td>${escapeHtml(appt.customer_phone)}</td>
        <td>${escapeHtml(appt.appointment_date)}</td>
        <td><strong>${escapeHtml(appt.start_time)} – ${escapeHtml(appt.end_time)}</strong></td>
        <td>${escapeHtml(appt.store_name || 'Flagship Clinic')}</td>
        <td><span class="badge-status ${escapeHtml(appt.status)}">${escapeHtml(appt.status)}</span></td>
        <td>
          <div style="display:flex;gap:4px;flex-wrap:wrap;">
            ${appt.status !== 'completed' && appt.status !== 'cancelled' ? `
              <button type="button" class="btn-primary btn-sm" onclick="OptiiAdmin.updateApptStatus(${appt.id}, 'completed')">Complete</button>
              <button type="button" class="btn-secondary btn-sm" onclick="OptiiAdmin.openRescheduleModal(${appt.id}, '${escapeHtml(appt.appointment_number)}', '${escapeHtml(appt.appointment_date)}', '${escapeHtml(appt.start_time)}')">Reschedule</button>
              <button type="button" class="btn-danger btn-sm" onclick="OptiiAdmin.updateApptStatus(${appt.id}, 'cancelled')">Cancel</button>
            ` : '<span style="font-size:12px;color:var(--ink-secondary);">Finalized</span>'}
          </div>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-state-box" style="color:#991b1b;">Error loading appointments.</td></tr>';
  }
}

export async function updateApptStatus(id, newStatus) {
  if (newStatus === 'cancelled') {
    const confirmed = await requestConfirmation({
      title: 'Cancel Appointment',
      message: 'Cancel this eye test appointment and release its time slot?',
      confirmLabel: 'Cancel Appointment',
      danger: true
    });
    if (!confirmed) return;
  }

  try {
    await apiRequest(`/appointments/${id}/status`, {
      method: 'PATCH',
      body: { status: newStatus }
    });
    showToast(`Appointment marked as ${newStatus}.`, 'success');
    loadAppointments();
  } catch (err) {
    showToast(err.message || 'Error updating appointment.', 'error');
  }
}

export function openRescheduleModal(id, apptNumber, currentDate, currentTime) {
  document.getElementById('resched-appt-id').value = id;
  document.getElementById('resched-title').textContent = `Reschedule ${apptNumber}`;
  document.getElementById('resched-date').value = currentDate;
  document.getElementById('resched-time').value = currentTime;
  openModal('modal-reschedule-appt');
}

export async function handleReschedule(event) {
  event.preventDefault();
  const id = Number(document.getElementById('resched-appt-id').value);
  const date = document.getElementById('resched-date').value;
  const time = document.getElementById('resched-time').value;

  try {
    const res = await apiRequest(`/appointments/${id}/reschedule`, {
      method: 'PATCH',
      body: { appointment_date: date, start_time: time }
    });
    if (res.success) {
      showToast(res.message, 'success');
      closeModal('modal-reschedule-appt');
      loadAppointments();
    }
  } catch (err) {
    showToast(err.message || 'Error rescheduling appointment.', 'error');
  }
}
