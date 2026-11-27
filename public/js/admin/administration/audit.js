/**
 * Optii Admin — Administrative Activity & Audit Log Module
 */

import { adminState } from '../core/state.js';
import { apiRequest } from '../core/api-client.js';
import { escapeHtml, formatDateTime } from '../shared/formatters.js';

export async function loadAuditLogs() {
  const tbody = document.getElementById('audit-table-body');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="6" class="empty-state-box">Loading activity log…</td></tr>';

  try {
    const actionFilter = (document.getElementById('audit-filter-action')?.value || '').trim().toLowerCase();
    const res = await apiRequest('/audit-logs?limit=150');
    adminState.auditLogs = res.logs || [];

    const filtered = actionFilter
      ? adminState.auditLogs.filter(log =>
          String(log.action || '').toLowerCase().includes(actionFilter) ||
          String(log.username || '').toLowerCase().includes(actionFilter) ||
          String(log.entity || '').toLowerCase().includes(actionFilter)
        )
      : adminState.auditLogs;

    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-state-box">No activity entries match your filter.</td></tr>';
      return;
    }

    tbody.innerHTML = filtered.map(log => `
      <tr>
        <td><span style="font-family:var(--font-mono);font-size:12px;">#${log.id}</span></td>
        <td>${escapeHtml(formatDateTime(log.created_at))}</td>
        <td><strong>${escapeHtml(log.username)}</strong></td>
        <td><span class="badge-status in_stock">${escapeHtml(log.action)}</span></td>
        <td>${escapeHtml(log.entity)} (${escapeHtml(log.entity_id || '—')})</td>
        <td><span style="font-family:var(--font-mono);font-size:12px;">${escapeHtml(log.ip_address || '—')}</span></td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state-box" style="color:#991b1b;">Error loading activity log.</td></tr>';
  }
}
