-- ═════════════════════════════════════════════════════════════════════
-- OPTII OPTICAL PLATFORM — MIGRATION 003: CHECKOUT, PROMOS & ORDER ENHANCEMENTS
-- ═════════════════════════════════════════════════════════════════════

-- 1. Promo Codes Table
CREATE TABLE IF NOT EXISTS promo_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
    discount_value INTEGER NOT NULL,
    min_order_amount_inr INTEGER DEFAULT 0,
    max_discount_inr INTEGER,
    description TEXT,
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Seed Standard Atelier Privileges & Vouchers
INSERT OR IGNORE INTO promo_codes (code, discount_type, discount_value, min_order_amount_inr, max_discount_inr, description)
VALUES 
    ('WELCOME500', 'fixed', 500, 3000, 500, 'Welcome discount for new atelier patrons on orders above ₹3,000'),
    ('OPTII10', 'percentage', 10, 0, 2000, '10% Atelier Privilege discount across entire frame & lens bundle'),
    ('FREESHIP', 'fixed', 250, 0, 250, 'Complimentary insured express courier waiver');

CREATE INDEX IF NOT EXISTS idx_promo_codes_code ON promo_codes(code);

-- 2. Extend Orders Table for Checkout Enhancements (required before Migration 006 rebuild)
ALTER TABLE orders ADD COLUMN delivery_method TEXT DEFAULT 'express';
ALTER TABLE orders ADD COLUMN promo_code TEXT;
ALTER TABLE orders ADD COLUMN estimated_delivery TEXT;
