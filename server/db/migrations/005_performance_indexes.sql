-- ═════════════════════════════════════════════════════════════════════
-- OPTII MIGRATION 005: PRODUCTION PERFORMANCE INDEXES
-- Optimizes query latencies for PDP, PLP, Tracking, and Appointments
-- ═════════════════════════════════════════════════════════════════════

-- 1. Product Slugs for Instant PDP Resolution (O(log n) vs Full Table Scan)
CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug);

-- 2. Product Catalog Filter Matrix (Brand, Shape, Category, Active status)
CREATE INDEX IF NOT EXISTS idx_products_catalog ON products(brand_id, shape_id, category_id, is_active);

-- 3. Product Variants by Product ID & SKU
CREATE INDEX IF NOT EXISTS idx_product_variants_product ON product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_product_variants_sku ON product_variants(sku);

-- 4. Optical Orders Resolution by Order Number & Phone
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_customer_phone ON orders(customer_phone);

-- 5. Appointments Query Optimization by Date & Slot
CREATE INDEX IF NOT EXISTS idx_appointments_date_time ON appointments(appointment_date, start_time);
