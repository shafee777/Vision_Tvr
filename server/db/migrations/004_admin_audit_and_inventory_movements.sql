-- ═════════════════════════════════════════════════════════════════════
-- OPTII OPTICAL PLATFORM — MIGRATION 004: AUDIT LOGS, INVENTORY MOVEMENTS & STAFF RBAC
-- ═════════════════════════════════════════════════════════════════════

-- 1. Administrative Audit Logs Table
CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    username TEXT NOT NULL,
    action TEXT NOT NULL,
    entity TEXT NOT NULL,
    entity_id TEXT,
    details_json TEXT,
    ip_address TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);

-- 2. Inventory Movements History Table (Mandatory movement reasons & staff attribution)
CREATE TABLE IF NOT EXISTS inventory_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    variant_id INTEGER NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    username TEXT NOT NULL,
    change_quantity INTEGER NOT NULL,
    previous_quantity INTEGER NOT NULL,
    new_quantity INTEGER NOT NULL,
    movement_type TEXT NOT NULL CHECK (movement_type IN ('manual_adjustment', 'replenishment', 'order_sale', 'order_cancellation', 'damage_writeoff')),
    reason TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_inv_movements_variant ON inventory_movements(variant_id);
CREATE INDEX IF NOT EXISTS idx_inv_movements_product ON inventory_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_inv_movements_created ON inventory_movements(created_at DESC);

-- 3. Seed Optometrist and Staff Accounts for RBAC Verification
INSERT OR IGNORE INTO users (id, username, password_hash, full_name, role)
VALUES 
    (2, 'optometrist', '$2a$10$IfoTZcC821zXkEJhjU52WOAlUrTOyr8wP3cYQC0tOLgk7n74mnyPK', 'Dr. K. Swaminathan (Optometrist)', 'optometrist'),
    (3, 'staff', '$2a$10$IfoTZcC821zXkEJhjU52WOAlUrTOyr8wP3cYQC0tOLgk7n74mnyPK', 'Ananya Sharma (Atelier Staff)', 'staff');
