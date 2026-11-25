-- ═════════════════════════════════════════════════════════════════════
-- OPTII OPTICAL PLATFORM — MIGRATION 006: PAYMENT STATE INTEGRITY & WEBHOOK IDEMPOTENCY
-- ═════════════════════════════════════════════════════════════════════

-- 1. Webhooks Idempotency Ledger Table
CREATE TABLE IF NOT EXISTS payment_webhooks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gateway TEXT NOT NULL,
    event_id TEXT NOT NULL UNIQUE,
    event_type TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    signature TEXT,
    order_number TEXT,
    status TEXT DEFAULT 'processed',
    processed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payment_webhooks_event_id ON payment_webhooks(event_id);
CREATE INDEX IF NOT EXISTS idx_payment_webhooks_gateway ON payment_webhooks(gateway);
CREATE INDEX IF NOT EXISTS idx_payment_webhooks_order ON payment_webhooks(order_number);

-- 2. Upgrade Orders Table Schema with Payment Integrity Columns & Expanded CHECK Constraints
PRAGMA foreign_keys=OFF;

CREATE TABLE IF NOT EXISTS orders_v2 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_number TEXT UNIQUE NOT NULL,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    customer_email TEXT,
    shipping_address TEXT NOT NULL,
    city TEXT,
    state TEXT,
    pincode TEXT,
    delivery_method TEXT DEFAULT 'express',
    subtotal_inr INTEGER NOT NULL,
    discount_inr INTEGER DEFAULT 0,
    promo_code TEXT,
    total_amount_inr INTEGER NOT NULL,
    payment_method TEXT NOT NULL,
    payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded', 'partially_refunded')),
    order_status TEXT NOT NULL DEFAULT 'placed' CHECK (order_status IN ('placed', 'processing', 'lab_glazing', 'shipped', 'delivered', 'cancelled')),
    is_simulated_payment INTEGER NOT NULL DEFAULT 1 CHECK (is_simulated_payment IN (0, 1)),
    payment_gateway_name TEXT DEFAULT 'simulated_sandbox',
    payment_gateway_ref TEXT DEFAULT NULL,
    payment_gateway_order_id TEXT DEFAULT NULL,
    refund_amount_inr REAL DEFAULT 0,
    refund_reason TEXT DEFAULT NULL,
    refund_gateway_ref TEXT DEFAULT NULL,
    items_json TEXT NOT NULL,
    prescription_file_url TEXT,
    prescription_data TEXT,
    tracking_number TEXT,
    estimated_delivery TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO orders_v2 (
    id, order_number, customer_name, customer_phone, customer_email,
    shipping_address, city, state, pincode, delivery_method,
    subtotal_inr, discount_inr, promo_code, total_amount_inr,
    payment_method, payment_status, order_status,
    is_simulated_payment, payment_gateway_name, payment_gateway_ref, payment_gateway_order_id,
    refund_amount_inr, refund_reason, refund_gateway_ref,
    items_json, prescription_file_url, prescription_data,
    tracking_number, estimated_delivery, created_at, updated_at
)
SELECT 
    id, order_number, customer_name, customer_phone, customer_email,
    shipping_address, city, state, pincode, COALESCE(delivery_method, 'express'),
    subtotal_inr, discount_inr, promo_code, total_amount_inr,
    payment_method,
    CASE 
      WHEN order_status = 'cancelled' AND payment_status = 'paid' THEN 'refunded'
      ELSE payment_status
    END,
    order_status,
    1, 'simulated_sandbox', NULL, NULL,
    CASE 
      WHEN order_status = 'cancelled' AND payment_status = 'paid' THEN total_amount_inr
      ELSE 0
    END,
    CASE 
      WHEN order_status = 'cancelled' AND payment_status = 'paid' THEN 'Automated refund on cancellation'
      ELSE NULL
    END,
    NULL,
    items_json, prescription_file_url, prescription_data,
    tracking_number, estimated_delivery, created_at, updated_at
FROM orders;

DROP TABLE orders;
ALTER TABLE orders_v2 RENAME TO orders;

CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_customer_phone ON orders(customer_phone);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_is_simulated ON orders(is_simulated_payment);
CREATE INDEX IF NOT EXISTS idx_orders_order_status ON orders(order_status);

PRAGMA foreign_keys=ON;
