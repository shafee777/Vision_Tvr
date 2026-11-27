/**
 * Optii Admin — Overview Dashboard Controller (Real KPIs, SVG Charts & Attention Queues)
 */

import { adminState } from '../core/state.js';
import { apiRequest } from '../core/api-client.js';
import { switchSection } from '../core/navigation.js';
import { escapeHtml, formatDateShort, formatInr, formatMovementType } from '../shared/formatters.js';
import { showToast } from '../shared/notifications.js';

export async function loadDashboardMetrics(daysParam = adminState.analyticsDays) {
  adminState.analyticsDays = Number(daysParam) || 30;
  updateWelcomeBanner();
  updateRangeButtons();

  try {
    const [summaryRes, analyticsRes] = await Promise.all([
      apiRequest('/summary'),
      apiRequest(`/dashboard/analytics?days=${adminState.analyticsDays}`)
    ]);

    if (summaryRes.success && summaryRes.metrics) {
      renderKpiCards(summaryRes.metrics);
    }

    if (analyticsRes.success && analyticsRes.analytics) {
      const analytics = analyticsRes.analytics;
      renderSalesChart(analytics.sales_trend);
      renderInventoryHealth(analytics.inventory_health);
      renderNeedsAttention(analytics.needs_attention);
      renderTodayAppointments(analytics.today_appointments);
      renderRecentMovements(analytics.recent_movements);
    }
  } catch (err) {
    showToast(err.message || 'Unable to load store overview metrics.', 'error');
  }
}

function updateWelcomeBanner() {
  const name = adminState.user?.full_name || adminState.user?.name || adminState.user?.username || 'Administrator';
  const welcomeTitleEl = document.getElementById('dashboard-welcome-title');
  const welcomeDateEl = document.getElementById('dashboard-welcome-date');

  if (welcomeTitleEl) {
    welcomeTitleEl.textContent = `Welcome back, ${name}`;
  }
  if (welcomeDateEl) {
    const todayFormatted = new Date().toLocaleDateString('en-IN', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    welcomeDateEl.textContent = `${todayFormatted} · Vision Opticals Operations`;
  }
}

function updateRangeButtons() {
  document.querySelectorAll('[data-analytics-days]').forEach(btn => {
    const isActive = Number(btn.dataset.analyticsDays) === adminState.analyticsDays;
    btn.classList.toggle('active', isActive);
  });
}

function renderKpiCards(metrics) {
  const setText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };

  setText('metric-products', metrics.active_products || 0);
  setText('metric-variants', metrics.active_variants || 0);
  setText('metric-low-stock', metrics.low_stock_variants || 0);
  setText('metric-out-stock', metrics.out_of_stock_variants || 0);
  setText('metric-pending-orders', metrics.pending_orders || 0);
  setText('metric-appts-today', metrics.appointments_today || 0);
  setText('metric-enquiries', metrics.new_enquiries || 0);
  setText('metric-real-revenue', formatInr(metrics.real_revenue_inr || 0));
  setText(
    'metric-orders-sub',
    `${metrics.real_orders_count || 0} live · ${metrics.simulated_orders_count || 0} sandbox`
  );
}

function renderSalesChart(salesTrend) {
  const container = document.getElementById('dashboard-sales-chart');
  const summaryEl = document.getElementById('dashboard-sales-summary');
  if (!container) return;

  const series = salesTrend?.series || [];
  const totals = salesTrend?.totals || { total_orders: 0, real_orders: 0, real_revenue_inr: 0 };

  if (summaryEl) {
    summaryEl.innerHTML = `
      <div><strong>Real Revenue (${adminState.analyticsDays}d):</strong> ${formatInr(totals.real_revenue_inr)}</div>
      <div><strong>Live Orders:</strong> ${totals.real_orders}</div>
      <div><strong>Total Orders Placed:</strong> ${totals.total_orders}</div>
    `;
  }

  if (series.length === 0) {
    container.innerHTML = `
      <div class="empty-state-box" style="border:1px dashed var(--border-light);border-radius:var(--radius-sm);">
        No recorded order activity in the last ${adminState.analyticsDays} days. Genuine verified orders will appear here automatically.
      </div>
    `;
    return;
  }

  const width = 620;
  const height = 210;
  const padLeft = 56;
  const padRight = 18;
  const padTop = 20;
  const padBottom = 34;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const rawMaxRev = Math.max(...series.map(d => Number(d.real_revenue_inr || 0)), 0);
  const maxRev = rawMaxRev > 0 ? rawMaxRev : 1000;
  const barWidth = Math.max(10, Math.min(36, Math.floor(plotW / series.length) - 6));
  const stepX = plotW / series.length;

  const gridLines = [0, 0.5, 1].map(ratio => {
    const y = padTop + plotH - ratio * plotH;
    const label = formatInr(Math.round(maxRev * ratio));
    return `
      <line x1="${padLeft}" y1="${y}" x2="${width - padRight}" y2="${y}" stroke="#e5e7eb" stroke-dasharray="3,3" />
      <text x="${padLeft - 8}" y="${y + 4}" text-anchor="end" font-size="11" fill="#595959">${escapeHtml(label)}</text>
    `;
  }).join('');

  const bars = series.map((point, idx) => {
    const rev = Number(point.real_revenue_inr || 0);
    const barH = rev > 0 ? Math.max(4, Math.round((rev / maxRev) * plotH)) : 2;
    const x = Math.round(padLeft + idx * stepX + (stepX - barWidth) / 2);
    const y = padTop + plotH - barH;
    const shortDate = String(point.day || '').slice(5);
    const tooltip = `${point.day}: ${formatInr(rev)} (${point.real_orders} live / ${point.total_orders} total orders)`;

    return `
      <g>
        <title>${escapeHtml(tooltip)}</title>
        <rect x="${x}" y="${y}" width="${barWidth}" height="${barH}" rx="2" fill="${rev > 0 ? '#111827' : '#d1d5db'}" />
        ${(series.length <= 12 || idx % Math.ceil(series.length / 8) === 0) ? `
          <text x="${x + barWidth / 2}" y="${height - 10}" text-anchor="middle" font-size="11" fill="#595959">${escapeHtml(shortDate)}</text>
        ` : ''}
      </g>
    `;
  }).join('');

  container.innerHTML = `
    <svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Real revenue and order activity chart">
      ${gridLines}
      <line x1="${padLeft}" y1="${padTop + plotH}" x2="${width - padRight}" y2="${padTop + plotH}" stroke="#d1d5db" />
      ${bars}
    </svg>
  `;
}

function renderInventoryHealth(health) {
  const container = document.getElementById('dashboard-inventory-health');
  if (!container || !health) return;

  const total = health.total_variants || 0;
  if (total === 0) {
    container.innerHTML = `<div class="empty-state-box">No active variants in catalogue yet.</div>`;
    return;
  }

  container.innerHTML = `
    <div style="font-size:13px;color:var(--ink-secondary);">
      <strong>${total}</strong> active SKUs across <strong>${health.total_units}</strong> total units in atelier stock.
    </div>
    <div class="health-bar-track" role="img" aria-label="Stock health: ${health.healthy.percent}% healthy, ${health.low_stock.percent}% low, ${health.out_of_stock.percent}% out of stock">
      <div class="health-seg-healthy" style="width:${health.healthy.percent}%"></div>
      <div class="health-seg-low" style="width:${health.low_stock.percent}%"></div>
      <div class="health-seg-out" style="width:${health.out_of_stock.percent}%"></div>
    </div>
    <div class="health-legend-list">
      <button type="button" class="health-legend-row" data-jump-inv="in">
        <span><span class="health-dot" style="background:#166534;"></span>Healthy Stock (&gt; 5 units)</span>
        <span><strong>${health.healthy.count}</strong> SKUs (${health.healthy.percent}%)</span>
      </button>
      <button type="button" class="health-legend-row" data-jump-inv="low">
        <span><span class="health-dot" style="background:#d97706;"></span>Low Stock (1–5 units)</span>
        <span><strong>${health.low_stock.count}</strong> SKUs (${health.low_stock.percent}%)</span>
      </button>
      <button type="button" class="health-legend-row" data-jump-inv="out">
        <span><span class="health-dot" style="background:#b91c1c;"></span>Out of Stock (0 units)</span>
        <span><strong>${health.out_of_stock.count}</strong> SKUs (${health.out_of_stock.percent}%)</span>
      </button>
    </div>
  `;

  container.querySelectorAll('[data-jump-inv]').forEach(btn => {
    btn.addEventListener('click', () => {
      adminState.inventoryFilters.stock_status = btn.dataset.jumpInv;
      adminState.inventoryFilters.offset = 0;
      switchSection('inventory');
    });
  });
}

function renderNeedsAttention(needsAttention) {
  const stockBody = document.getElementById('dashboard-attention-stock-body');
  const ordersBody = document.getElementById('dashboard-attention-orders-body');

  const stockAlerts = needsAttention?.stock_alerts || [];
  if (stockBody) {
    if (stockAlerts.length === 0) {
      stockBody.innerHTML = '<tr><td colspan="5" class="empty-state-box">All active frame variants are above low-stock threshold (5 units).</td></tr>';
    } else {
      stockBody.innerHTML = stockAlerts.map(item => `
        <tr>
          <td><span style="font-family:var(--font-mono);font-weight:700;">${escapeHtml(item.sku)}</span></td>
          <td><strong>${escapeHtml(item.product_name)}</strong></td>
          <td>
            <span style="display:inline-flex;align-items:center;gap:6px;">
              <span style="width:10px;height:10px;border-radius:50%;background:${escapeHtml(item.color_hex)};border:1px solid rgba(0,0,0,0.15);"></span>
              ${escapeHtml(item.color_name)}
            </span>
          </td>
          <td style="font-weight:700;color:${item.stock_quantity === 0 ? '#991b1b' : '#92400e'};">${item.stock_quantity}</td>
          <td>
            <button type="button" class="btn-secondary btn-sm"
              onclick="OptiiAdmin.openStockAdjustModal(${item.variant_id}, '${escapeHtml(item.sku)}', '${escapeHtml(item.product_name)}', ${item.stock_quantity})">
              ${item.stock_quantity === 0 ? 'Restock' : 'Adjust'}
            </button>
          </td>
        </tr>
      `).join('');
    }
  }

  const pendingOrders = needsAttention?.pending_orders || [];
  if (ordersBody) {
    if (pendingOrders.length === 0) {
      ordersBody.innerHTML = '<tr><td colspan="4" class="empty-state-box">No orders currently awaiting processing or lab glazing.</td></tr>';
    } else {
      ordersBody.innerHTML = pendingOrders.map(order => `
        <tr>
          <td><span style="font-family:var(--font-mono);font-weight:700;">${escapeHtml(order.order_number)}</span></td>
          <td>${escapeHtml(order.customer_name)}</td>
          <td>
            <span class="badge-status ${escapeHtml(order.order_status)}">${escapeHtml(order.order_status.replace(/_/g, ' '))}</span>
            ${order.is_simulated_payment ? '<span class="badge-status low_stock">Sandbox</span>' : ''}
          </td>
          <td>
            <button type="button" class="btn-secondary btn-sm" onclick="OptiiAdmin.viewOrderDetail('${escapeHtml(order.order_number)}')">Manage</button>
          </td>
        </tr>
      `).join('');
    }
  }
}

function renderTodayAppointments(appointments) {
  const tbody = document.getElementById('dashboard-today-appts-body');
  if (!tbody) return;

  if (!appointments || appointments.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state-box">No eye test appointments scheduled for today.</td></tr>';
    return;
  }

  tbody.innerHTML = appointments.map(appt => `
    <tr>
      <td><strong>${escapeHtml(appt.start_time)} – ${escapeHtml(appt.end_time)}</strong></td>
      <td>${escapeHtml(appt.customer_name)}</td>
      <td><span style="font-family:var(--font-mono);font-size:12px;">${escapeHtml(appt.appointment_number)}</span></td>
      <td><span class="badge-status ${escapeHtml(appt.status)}">${escapeHtml(appt.status)}</span></td>
      <td><button type="button" class="btn-secondary btn-sm" onclick="OptiiAdmin.switchSection('appointments')">View Queue</button></td>
    </tr>
  `).join('');
}

function renderRecentMovements(movements) {
  const tbody = document.getElementById('dashboard-movements-table');
  if (!tbody) return;

  if (!movements || movements.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state-box">No stock movements logged yet.</td></tr>';
    return;
  }

  tbody.innerHTML = movements.map(movement => `
    <tr>
      <td>${escapeHtml(formatDateShort(movement.created_at))}</td>
      <td>
        <strong>${escapeHtml(movement.product_name)}</strong>
        <div style="font-family:var(--font-mono);font-size:12px;color:var(--ink-secondary);">${escapeHtml(movement.sku)}</div>
      </td>
      <td>${movement.previous_quantity} → <strong>${movement.new_quantity}</strong></td>
      <td style="font-weight:700;color:${movement.change_quantity >= 0 ? '#166534' : '#991b1b'};">
        ${movement.change_quantity > 0 ? '+' : ''}${movement.change_quantity}
      </td>
      <td><span class="badge-status low_stock">${escapeHtml(formatMovementType(movement.movement_type))}</span></td>
      <td style="color:var(--ink-secondary);">${escapeHtml(movement.username)} · ${escapeHtml(movement.reason)}</td>
    </tr>
  `).join('');
}
