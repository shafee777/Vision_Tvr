-- ═════════════════════════════════════════════════════════════════════
-- OPTII OPTICAL PLATFORM — MIGRATION 007: ADMIN BULK IMPORT HISTORY
-- Persistent import batch audit trail & downloadable row-level error log
-- ═════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS admin_import_batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_number TEXT UNIQUE NOT NULL,
    idempotency_key TEXT UNIQUE,
    import_type TEXT NOT NULL CHECK (import_type IN ('catalogue', 'stock_count')),
    source_type TEXT NOT NULL CHECK (source_type IN ('csv', 'paste')),
    source_name TEXT,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    username TEXT NOT NULL,
    total_rows INTEGER NOT NULL DEFAULT 0,
    frames_created INTEGER NOT NULL DEFAULT 0,
    variants_created INTEGER NOT NULL DEFAULT 0,
    records_updated INTEGER NOT NULL DEFAULT 0,
    records_unchanged INTEGER NOT NULL DEFAULT 0,
    failed_rows INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL CHECK (status IN ('completed', 'completed_with_errors', 'failed')),
    summary_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admin_import_errors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id INTEGER NOT NULL REFERENCES admin_import_batches(id) ON DELETE CASCADE,
    row_number INTEGER NOT NULL,
    sku TEXT,
    field_name TEXT,
    submitted_value TEXT,
    error_message TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_import_batches_type ON admin_import_batches(import_type);
CREATE INDEX IF NOT EXISTS idx_import_batches_created ON admin_import_batches(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_import_errors_batch ON admin_import_errors(batch_id);
