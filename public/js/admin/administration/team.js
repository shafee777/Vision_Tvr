/**
 * Optii Admin — Team Accounts & RBAC Management
 */

import { adminState } from '../core/state.js';
import { apiRequest } from '../core/api-client.js';
import { escapeHtml } from '../shared/formatters.js';
import { closeModal, openModal, requestConfirmation, showToast } from '../shared/notifications.js';

export async function loadUsers() {
  const tbody = document.getElementById('users-table-body');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="5" class="empty-state-box">Loading staff directory…</td></tr>';

  try {
    const res = await apiRequest('/users');
    adminState.users = res.users || [];

    tbody.innerHTML = adminState.users.map(user => `
      <tr>
        <td><span style="font-family:var(--font-mono);font-weight:700;">#${user.id}</span></td>
        <td><strong>${escapeHtml(user.full_name)}</strong></td>
        <td><span style="font-family:var(--font-mono);font-size:12px;">${escapeHtml(user.username)}</span></td>
        <td><span class="badge-status ${user.role === 'admin' ? 'in_stock' : (user.role === 'optometrist' ? 'shipped' : 'low_stock')}">${escapeHtml(user.role.toUpperCase())}</span></td>
        <td>
          ${user.id !== adminState.user?.id
            ? `<button type="button" class="btn-danger btn-sm" onclick="OptiiAdmin.deleteUser(${user.id}, '${escapeHtml(user.username)}')">Remove</button>`
            : '<span style="font-size:12px;color:var(--ink-secondary);">Active Session</span>'}
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state-box" style="color:#991b1b;">Error loading staff accounts.</td></tr>';
  }
}

export function openNewUserModal() {
  openModal('modal-new-user');
}

export async function handleCreateUser(event) {
  event.preventDefault();
  const form = event.target;
  const payload = {
    username: form.username.value.trim(),
    password: form.password.value.trim(),
    full_name: form.full_name.value.trim(),
    role: form.role.value
  };

  try {
    const res = await apiRequest('/users', { method: 'POST', body: payload });
    if (res.success) {
      showToast(`Staff member ${payload.username} created.`, 'success');
      closeModal('modal-new-user');
      form.reset();
      loadUsers();
    }
  } catch (err) {
    showToast(err.message || 'Error creating user.', 'error');
  }
}

export async function deleteUser(id, username) {
  const confirmed = await requestConfirmation({
    title: 'Revoke Staff Access',
    message: `Are you sure you want to remove account "${username}"? This action takes effect immediately.`,
    confirmLabel: 'Revoke Account',
    danger: true
  });
  if (!confirmed) return;

  try {
    await apiRequest(`/users/${id}`, { method: 'DELETE' });
    showToast(`User ${username} removed.`, 'info');
    loadUsers();
  } catch (err) {
    showToast(err.message || 'Error deleting user.', 'error');
  }
}
