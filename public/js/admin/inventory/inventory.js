/**
 * Optii Admin — Inventory Control, Stock Distribution, Movements & Export
 */

import { adminState } from '../core/state.js';
import { apiRequest, downloadAuthenticatedCsv } from '../core/api-client.js';
import { debounce, escapeHtml, formatDateShort, formatDateTime, formatInr, formatMovementType } from '../shared/formatters.js';
import { openModal, showToast } from '../shared/notifications.js';

let inventoryTaxonomyLoaded = false;

async function ensureInventoryFiltersLoaded() {
  if (!inventoryTaxonomyLoaded || !adminState.brands.length || !adminState.categories.length) {
    try {
      const [brandsRes, catsRes] = await Promise.all([
        apiRequest('/brands'),
        apiRequest('/categories')
      ]);
      adminState.brands = brandsRes.brands || [];
      adminState.categories = catsRes.categories || [];
      inventoryTaxonomyLoaded = true;
    } catch (_) {}
  }

  const brandSel = document.getElementById('inv-filter-brand');
  const catSel = document.getElementById('inv-filter-category');
  const statusSel = document.getElementById('inv-filter-status');

  if (brandSel) {
    brandSel.innerHTML = `<option value="">All Brands</option>` +
      adminState.brands.map(b => `<option value="${b.id}">${escapeHtml(b.name)}</option>`).join('');
    brandSel.value = adminState.inventoryFilters.brand_id || '';
  }
  if (catSel) {
    catSel.innerHTML = `<option value="">All Categories</option>` +
      adminState.categories.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
    catSel.value = adminState.inventoryFilters.category_id || '';
  }
  if (statusSel) {
    statusSel.value = adminState.inventoryFilters.stock_status || 'all';
  }
}

export async function loadInventoryItems() {
  const tbody = document.getElementById('inventory-table-body');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="9" class="empty-state-box">Loading variant inventory…</td></tr>';
  await ensureInventoryFiltersLoaded();
  syncQuickChips();

  try {
    const f = adminState.inventoryFilters;
    const params = new URLSearchParams({
      search: f.search || '',
      brand_id: f.brand_id || '',
      category_id: f.category_id || '',
      stock_status: f.stock_status || 'all',
      sort: f.sort || 'stock_asc',
      limit: String(f.limit),
      offset: String(f.offset)
    });

    const apiResponse = await apiRequest(`/inventory?${params.toString()}`);
    adminState.inventory = apiResponse.inventory || [];
    adminState.inventoryTotal = Number(apiResponse.total ?? adminState.inventory.length);
    adminState.inventorySummary = apiResponse.summary || null;

    renderInventorySummaryCards();
    renderInventoryPagination();

    if (adminState.inventory.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" class="empty-state-box">No inventory variants matched your filter.</td></tr>';
      return;
    }

    tbody.innerHTML = adminState.inventory.map(inventoryItem => {
      let statusBadge = '<span class="badge-status in_stock">Healthy</span>';
      if (inventoryItem.stock_quantity === 0) {
        statusBadge = '<span class="badge-status out_of_stock">Out of Stock</span>';
      } else if (inventoryItem.stock_quantity <= 5) {
        statusBadge = '<span class="badge-status low_stock">Low Stock (≤5)</span>';
      }

      const lastMoveText = inventoryItem.last_movement_at
        ? `${inventoryItem.last_change_quantity > 0 ? '+' : ''}${inventoryItem.last_change_quantity} (${formatDateShort(inventoryItem.last_movement_at)})`
        : '—';

      return `
        <tr>
          <td><span style="font-family:var(--font-mono);font-weight:700;">${escapeHtml(inventoryItem.sku)}</span></td>
          <td><strong>${escapeHtml(inventoryItem.product_name)}</strong></td>
          <td>${escapeHtml(inventoryItem.brand_name)}</td>
          <td>
            <span style="display:inline-flex;align-items:center;gap:6px;">
              <span style="width:12px;height:12px;border-radius:50%;background:${escapeHtml(inventoryItem.color_hex)};border:1px solid rgba(0,0,0,0.15);"></span>
              ${escapeHtml(inventoryItem.color_name)}
            </span>
          </td>
          <td><strong>${formatInr(inventoryItem.effective_price_inr || inventoryItem.base_price_inr)}</strong></td>
          <td style="font-size:15px;font-weight:700;">${inventoryItem.stock_quantity}</td>
          <td>${statusBadge}</td>
          <td style="font-size:12px;color:var(--ink-secondary);">${escapeHtml(lastMoveText)}</td>
          <td>
            <div style="display:flex;gap:4px;">
              <button type="button" class="btn-primary btn-sm"
                onclick="OptiiAdmin.openStockAdjustModal(${inventoryItem.variant_id}, '${escapeHtml(inventoryItem.sku)}', '${escapeHtml(inventoryItem.product_name)}', ${inventoryItem.stock_quantity})">
                Adjust
              </button>
              <button type="button" class="btn-secondary btn-sm"
                onclick="OptiiAdmin.viewVariantMovements(${inventoryItem.variant_id}, '${escapeHtml(inventoryItem.sku)}')">
                History
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-state-box" style="color:#991b1b;">Error loading inventory.</td></tr>';
    showToast(err.message || 'Failed to load inventory.', 'error');
  }
}

function renderInventorySummaryCards() {
  const summary = adminState.inventorySummary;
  if (!summary) return;

  const setText = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };
  setText('inv-kpi-total-variants', summary.total_variants);
  setText('inv-kpi-healthy', summary.healthy_variants);
  setText('inv-kpi-low', summary.low_stock_variants);
  setText('inv-kpi-out', summary.out_of_stock_variants);
  setText('inv-kpi-total-units', summary.total_units.toLocaleString('en-IN'));

  const barEl = document.getElementById('inv-health-bar');
  if (barEl && summary.total_variants > 0) {
    const pct = (n) => Math.round((n / summary.total_variants) * 1000) / 10;
    barEl.innerHTML = `
      <div class="health-bar-track">
        <div class="health-seg-healthy" style="width:${pct(summary.healthy_variants)}%"></div>
        <div class="health-seg-low" style="width:${pct(summary.low_stock_variants)}%"></div>
        <div class="health-seg-out" style="width:${pct(summary.out_of_stock_variants)}%"></div>
      </div>
    `;
  }
}

function renderInventoryPagination() {
  const el = document.getElementById('inv-pagination-bar');
  if (!el) return;
  const { limit, offset } = adminState.inventoryFilters;
  const total = adminState.inventoryTotal;
  const start = total === 0 ? 0 : offset + 1;
  const end = Math.min(offset + limit, total);

  el.innerHTML = `
    <span>Showing <strong>${start}–${end}</strong> of <strong>${total}</strong> active variant SKUs</span>
    <div style="display:flex;gap:6px;">
      <button type="button" class="btn-secondary btn-sm" id="btn-inv-prev" ${offset <= 0 ? 'disabled' : ''}>Previous</button>
      <button type="button" class="btn-secondary btn-sm" id="btn-inv-next" ${end >= total ? 'disabled' : ''}>Next</button>
    </div>
  `;

  document.getElementById('btn-inv-prev')?.addEventListener('click', () => {
    adminState.inventoryFilters.offset = Math.max(0, offset - limit);
    loadInventoryItems();
  });
  document.getElementById('btn-inv-next')?.addEventListener('click', () => {
    if (end < total) {
      adminState.inventoryFilters.offset = offset + limit;
      loadInventoryItems();
    }
  });
}

function syncQuickChips() {
  const current = adminState.inventoryFilters.stock_status || 'all';
  document.querySelectorAll('[data-inv-quick]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.invQuick === current);
  });
}

export const debouncedInventorySearch = debounce((value) => {
  adminState.inventoryFilters.search = value;
  adminState.inventoryFilters.offset = 0;
  loadInventoryItems();
}, 280);

export function updateInventoryFilter(key, value) {
  adminState.inventoryFilters[key] = value;
  adminState.inventoryFilters.offset = 0;
  loadInventoryItems();
}

export async function exportFilteredInventoryCsv() {
  const f = adminState.inventoryFilters;
  const params = new URLSearchParams({
    search: f.search || '',
    brand_id: f.brand_id || '',
    category_id: f.category_id || '',
    stock_status: f.stock_status || 'all'
  });
  try {
    await downloadAuthenticatedCsv(`/inventory/export?${params.toString()}`, 'optii_inventory_export.csv');
    showToast('Inventory CSV exported.', 'success');
  } catch (err) {
    showToast(err.message || 'Failed to export inventory CSV.', 'error');
  }
}

export async function loadAllStockMovements(variantId = null, skuLabel = null) {
  const tbody = document.getElementById('inv-movements-table-body');
  const titleEl = document.getElementById('movements-filter-badge');
  if (titleEl) {
    titleEl.textContent = skuLabel ? `Filtered to SKU: ${skuLabel}` : 'Showing latest 100 inventory movements';
  }
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="7" class="empty-state-box">Loading stock movements…</td></tr>';
  try {
    const query = variantId ? `?variant_id=${variantId}&limit=100` : '?limit=100';
    const res = await apiRequest(`/inventory/movements${query}`);
    const movements = res.movements || [];
    if (movements.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-state-box">No stock movements recorded yet.</td></tr>';
      return;
    }

    tbody.innerHTML = movements.map(m => `
      <tr>
        <td>${escapeHtml(formatDateTime(m.created_at))}</td>
        <td><span style="font-family:var(--font-mono);font-weight:700;">${escapeHtml(m.sku)}</span></td>
        <td><strong>${escapeHtml(m.product_name)}</strong> (${escapeHtml(m.color_name)})</td>
        <td>${m.previous_quantity} → <strong>${m.new_quantity}</strong></td>
        <td style="font-weight:700;color:${m.change_quantity >= 0 ? '#166534' : '#991b1b'};">
          ${m.change_quantity > 0 ? '+' : ''}${m.change_quantity}
        </td>
        <td><span class="badge-status low_stock">${escapeHtml(formatMovementType(m.movement_type))}</span></td>
        <td style="color:var(--ink-secondary);">${escapeHtml(m.username)} · ${escapeHtml(m.reason)}</td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state-box" style="color:#991b1b;">Error loading movement log.</td></tr>';
  }
}

export async function viewVariantMovements(variantId, skuLabel) {
  switchInventorySubtab('movements');
  await loadAllStockMovements(variantId, skuLabel);
}

export function switchInventorySubtab(tabName) {
  document.querySelectorAll('[data-inv-tab]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.invTab === tabName);
  });
  document.querySelectorAll('[data-inv-pane]').forEach(pane => {
    pane.style.display = pane.dataset.invPane === tabName ? 'block' : 'none';
  });
  if (tabName === 'movements') {
    loadAllStockMovements();
  }
}

export { openModal };
