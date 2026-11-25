-- ═════════════════════════════════════════════════════════════════════
-- OPTII OPTICAL PLATFORM — MIGRATION 002: PRESCRIPTION SECURITY & LENS UPGRADES
-- ═════════════════════════════════════════════════════════════════════

-- 1. Secure Prescriptions Table (Stored outside public webroot)
CREATE TABLE IF NOT EXISTS prescriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT UNIQUE NOT NULL,
    original_filename TEXT NOT NULL,
    stored_filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    storage_path TEXT NOT NULL,
    is_verified BOOLEAN DEFAULT 0,
    verified_by INTEGER REFERENCES users(id),
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_prescriptions_token ON prescriptions(token);
