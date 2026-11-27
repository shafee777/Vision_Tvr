/**
 * ═════════════════════════════════════════════════════════════════════
 * OPTII OPTICAL PLATFORM — DASHBOARD ANALYTICS SERVICE
 * Strictly queries genuine SQLite business records (never fabricates data)
 * ═════════════════════════════════════════════════════════════════════
 */

const db = require('../db/database');

const LOW_STOCK_THRESHOLD = 5;

async function getDashboardAnalytics(daysParam = 30) {
  const allowedDays = [7, 30, 90];
  const parsedDays = Number(daysParam);
  const rangeDays = allowedDays.includes(parsedDays) ? parsedDays : 30;
  const sqlWindow = `-${rangeDays - 1} days`;

  const [
    salesSeriesRows,
    salesTotalsRow,
    inventoryHealthRow,
    attentionStockRows,
    attentionOrdersRows,
    todayAppointmentsRows,
    recentMovementsRows
  ] = await Promise.all([
    // Daily real revenue & order activity (excluding simulated sandbox & cancelled orders from real revenue)
    db.all(
      `SELECT DATE(created_at) AS day,
              COUNT(*) AS total_orders,
              SUM(CASE WHEN is_simulated_payment = 0 AND order_status != 'cancelled' THEN 1 ELSE 0 END) AS real_orders,
              COALESCE(SUM(CASE
                WHEN is_simulated_payment = 0
                 AND order_status != 'cancelled'
                 AND (payment_status = 'paid' OR order_status = 'delivered')
                THEN total_amount_inr - COALESCE(refund_amount_inr, 0)
                ELSE 0
              END), 0) AS real_revenue_inr
       FROM orders
       WHERE DATE(created_at) >= DATE('now', ?)
       GROUP BY DATE(created_at)
       ORDER BY day ASC`,
      [sqlWindow]
    ),
    db.get(
      `SELECT COUNT(*) AS total_orders,
              SUM(CASE WHEN is_simulated_payment = 0 AND order_status != 'cancelled' THEN 1 ELSE 0 END) AS real_orders,
              COALESCE(SUM(CASE
                WHEN is_simulated_payment = 0
                 AND order_status != 'cancelled'
                 AND (payment_status = 'paid' OR order_status = 'delivered')
                THEN total_amount_inr - COALESCE(refund_amount_inr, 0)
                ELSE 0
              END), 0) AS real_revenue_inr
       FROM orders
       WHERE DATE(created_at) >= DATE('now', ?)`,
      [sqlWindow]
    ),
    // Inventory health distribution across active variants of active products
    db.get(
      `SELECT COUNT(*) AS total_variants,
              COALESCE(SUM(v.stock_quantity), 0) AS total_units,
              SUM(CASE WHEN v.stock_quantity > ? THEN 1 ELSE 0 END) AS healthy_variants,
              SUM(CASE WHEN v.stock_quantity > 0 AND v.stock_quantity <= ? THEN 1 ELSE 0 END) AS low_stock_variants,
              SUM(CASE WHEN v.stock_quantity = 0 THEN 1 ELSE 0 END) AS out_of_stock_variants
       FROM product_variants v
       JOIN products p ON p.id = v.product_id
       WHERE v.is_active = 1 AND p.is_active = 1`,
      [LOW_STOCK_THRESHOLD, LOW_STOCK_THRESHOLD]
    ),
    // Urgent low-stock and out-of-stock variants
    db.all(
      `SELECT v.id AS variant_id, v.sku, v.color_name, v.color_hex, v.stock_quantity,
              p.id AS product_id, p.name AS product_name
       FROM product_variants v
       JOIN products p ON p.id = v.product_id
       WHERE v.is_active = 1 AND p.is_active = 1 AND v.stock_quantity <= ?
       ORDER BY v.stock_quantity ASC, p.name ASC
       LIMIT 10`,
      [LOW_STOCK_THRESHOLD]
    ),
    // Orders needing fulfillment attention
    db.all(
      `SELECT order_number, customer_name, total_amount_inr, order_status, payment_status,
              is_simulated_payment, created_at
       FROM orders
       WHERE order_status IN ('placed', 'processing', 'lab_glazing')
       ORDER BY created_at ASC
       LIMIT 8`
    ),
    // Today's non-cancelled appointments (no clinical/Rx fields)
    db.all(
      `SELECT a.id, a.appointment_number, a.customer_name, a.customer_phone,
              a.appointment_date, a.start_time, a.end_time, a.status,
              s.name AS store_name
       FROM appointments a
       JOIN stores s ON s.id = a.store_id
       WHERE a.appointment_date = DATE('now') AND a.status != 'cancelled'
       ORDER BY a.start_time ASC
       LIMIT 10`
    ),
    // Latest inventory movements with full delta details
    db.all(
      `SELECT m.id, m.variant_id, m.product_id, m.username, m.change_quantity,
              m.previous_quantity, m.new_quantity, m.movement_type, m.reason, m.created_at,
              p.name AS product_name, v.sku, v.color_name
       FROM inventory_movements m
       JOIN products p ON p.id = m.product_id
       JOIN product_variants v ON v.id = m.variant_id
       ORDER BY m.created_at DESC, m.id DESC
       LIMIT 10`
    )
  ]);

  const totalVariants = Number(inventoryHealthRow?.total_variants || 0);
  const healthyCount = Number(inventoryHealthRow?.healthy_variants || 0);
  const lowCount = Number(inventoryHealthRow?.low_stock_variants || 0);
  const outCount = Number(inventoryHealthRow?.out_of_stock_variants || 0);
  const totalUnits = Number(inventoryHealthRow?.total_units || 0);

  const pct = (count) => (totalVariants > 0 ? Math.round((count / totalVariants) * 1000) / 10 : 0);

  return {
    range_days: rangeDays,
    low_stock_threshold: LOW_STOCK_THRESHOLD,
    sales_trend: {
      series: salesSeriesRows || [],
      totals: {
        total_orders: Number(salesTotalsRow?.total_orders || 0),
        real_orders: Number(salesTotalsRow?.real_orders || 0),
        real_revenue_inr: Number(salesTotalsRow?.real_revenue_inr || 0)
      }
    },
    inventory_health: {
      total_variants: totalVariants,
      total_units: totalUnits,
      healthy: { count: healthyCount, percent: pct(healthyCount) },
      low_stock: { count: lowCount, percent: pct(lowCount) },
      out_of_stock: { count: outCount, percent: pct(outCount) }
    },
    needs_attention: {
      stock_alerts: attentionStockRows || [],
      pending_orders: attentionOrdersRows || []
    },
    today_appointments: todayAppointmentsRows || [],
    recent_movements: recentMovementsRows || []
  };
}

module.exports = {
  LOW_STOCK_THRESHOLD,
  getDashboardAnalytics
};
