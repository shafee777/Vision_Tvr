/**
 * Optii Admin — Shared Formatting & Escaping Utilities
 */

export function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatInr(amount) {
  const numeric = Number(amount || 0);
  return `₹${numeric.toLocaleString('en-IN')}`;
}

export function formatDateShort(dateString) {
  if (!dateString) return '—';
  const parsed = new Date(dateString);
  if (Number.isNaN(parsed.getTime())) return String(dateString);
  return parsed.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDateTime(dateString) {
  if (!dateString) return '—';
  const parsed = new Date(dateString);
  if (Number.isNaN(parsed.getTime())) return String(dateString);
  return parsed.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatTimeOnly(dateString) {
  if (!dateString) return '—';
  const parsed = new Date(dateString);
  if (Number.isNaN(parsed.getTime())) return String(dateString);
  return parsed.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

export function formatMovementType(type) {
  const labels = {
    manual_adjustment: 'Manual Adjustment',
    replenishment: 'Replenishment',
    order_sale: 'Order Sale',
    order_cancellation: 'Order Restock',
    damage_writeoff: 'Damage Write-off'
  };
  return labels[type] || String(type || '').replace(/_/g, ' ');
}

export function slugifyText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

export function debounce(fn, delayMs = 280) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delayMs);
  };
}
