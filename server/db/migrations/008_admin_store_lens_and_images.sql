-- ═════════════════════════════════════════════════════════════════════
-- OPTII OPTICAL PLATFORM — MIGRATION 008: STORE IDENTITY, LENS STEP 2 & FRAME TYPE
-- Extends categories, products, stores, and adds Step 2 prescription config
-- ═════════════════════════════════════════════════════════════════════

-- 1. Categories optional description
ALTER TABLE categories ADD COLUMN description TEXT;

-- 2. Products frame construction type (Full Rim, Semi-Rimless, Rimless)
ALTER TABLE products ADD COLUMN frame_type TEXT DEFAULT 'Full Rim';

-- 3. Stores storefront identity, branding logo, WhatsApp & social metadata
ALTER TABLE stores ADD COLUMN logo_url TEXT;
ALTER TABLE stores ADD COLUMN description TEXT;
ALTER TABLE stores ADD COLUMN whatsapp_number TEXT;
ALTER TABLE stores ADD COLUMN map_url TEXT;
ALTER TABLE stores ADD COLUMN instagram_url TEXT;
ALTER TABLE stores ADD COLUMN facebook_url TEXT;

UPDATE stores
SET
  whatsapp_number = COALESCE(NULLIF(whatsapp_number, ''), phone),
  description = COALESCE(
    NULLIF(description, ''),
    'Architectural optical retail store offering handcrafted bio-acetate & titanium frames, sunglasses, and computerised eye testing.'
  )
WHERE id = 1;

-- 4. Step 2 Lens Prescription Configuration Options & Ranges
CREATE TABLE IF NOT EXISTS lens_prescription_options (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    method_key TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    fee_inr INTEGER NOT NULL DEFAULT 0 CHECK (fee_inr >= 0),
    sph_min NUMERIC NOT NULL DEFAULT -12.0,
    sph_max NUMERIC NOT NULL DEFAULT 8.0,
    cyl_min NUMERIC NOT NULL DEFAULT -6.0,
    cyl_max NUMERIC NOT NULL DEFAULT 6.0,
    pd_min INTEGER NOT NULL DEFAULT 50,
    pd_max INTEGER NOT NULL DEFAULT 75,
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT 1
);

INSERT OR IGNORE INTO lens_prescription_options
  (id, method_key, name, description, fee_inr, sph_min, sph_max, cyl_min, cyl_max, pd_min, pd_max, display_order, is_active)
VALUES
  (1, 'upload', 'Upload Prescription Document (Photo / PDF)', 'Customers upload an optometrist slip (JPG, PNG, WEBP, or PDF) for clinical verification prior to glazing.', 0, -12.0, 8.0, -6.0, 6.0, 50, 75, 1, 1),
  (2, 'manual', 'Enter Prescription Manually (OD / OS / PD)', 'Customers enter right & left eye Sphere, Cylinder, Axis, ADD, and Pupillary Distance directly in the configurator.', 0, -12.0, 8.0, -6.0, 6.0, 50, 75, 2, 1),
  (3, 'later', 'Provide Prescription Later via WhatsApp / Store', 'Reserve frame inventory immediately and share prescription details via WhatsApp or during an in-store eye test.', 0, -12.0, 8.0, -6.0, 6.0, 50, 75, 3, 1);
