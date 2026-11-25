-- Optii Optical Platform: Greenfield Relational Schema
-- Database: data/optii.db
-- Strict Foreign Key Constraints Enabled

PRAGMA foreign_keys = ON;

-- 1. Administrative & Staff Users (Role-Based Access Control)
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('admin', 'optometrist', 'staff')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. Optical Brands
CREATE TABLE IF NOT EXISTS brands (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    logo_url TEXT,
    description TEXT,
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. Frame Shapes (Powers Ace & Tate Filter Drawer)
CREATE TABLE IF NOT EXISTS frame_shapes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    icon_svg TEXT NOT NULL,
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT 1
);

-- 4. Product Categories (Eyeglasses, Sunglasses, Accessories, Eye Care)
CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    category_type TEXT NOT NULL CHECK (category_type IN ('glasses', 'sunglasses', 'accessories', 'contact_lenses', 'eyecare')),
    gender TEXT DEFAULT 'unisex' CHECK (gender IN ('men', 'women', 'unisex')),
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT 1
);

-- 5. Products Master Table
CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    brand_id INTEGER NOT NULL REFERENCES brands(id) ON DELETE RESTRICT,
    shape_id INTEGER NOT NULL REFERENCES frame_shapes(id) ON DELETE RESTRICT,
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    sku TEXT UNIQUE NOT NULL,
    description TEXT,
    base_price_inr INTEGER NOT NULL CHECK (base_price_inr >= 0),
    gender TEXT NOT NULL DEFAULT 'unisex' CHECK (gender IN ('men', 'women', 'unisex')),
    material TEXT NOT NULL, -- e.g. 'Italian Bio-Acetate', 'Japanese Titanium', 'Combi'
    frame_fit TEXT NOT NULL CHECK (frame_fit IN ('Narrow', 'Medium', 'Wide')),
    lens_width_mm INTEGER NOT NULL CHECK (lens_width_mm > 0),
    bridge_width_mm INTEGER NOT NULL CHECK (bridge_width_mm > 0),
    temple_length_mm INTEGER NOT NULL CHECK (temple_length_mm > 0),
    frame_height_mm INTEGER,
    total_width_mm INTEGER,
    is_featured BOOLEAN DEFAULT 0,
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 6. Product Variants (Colorways with Dedicated SKUs & Stock)
CREATE TABLE IF NOT EXISTS product_variants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    color_name TEXT NOT NULL,
    color_hex TEXT NOT NULL,
    color_secondary_hex TEXT,
    sku TEXT UNIQUE NOT NULL,
    price_override_inr INTEGER,
    stock_quantity INTEGER NOT NULL DEFAULT 10 CHECK (stock_quantity >= 0),
    is_default BOOLEAN DEFAULT 0,
    is_active BOOLEAN DEFAULT 1
);

-- 7. Product Images (Studio Front + Model-Wearing Pairs)
CREATE TABLE IF NOT EXISTS product_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    variant_id INTEGER NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
    image_type TEXT NOT NULL CHECK (image_type IN ('studio_front', 'model_on_face', 'angle_45', 'hinge_detail', 'packaging')),
    image_url TEXT NOT NULL,
    alt_text TEXT,
    display_order INTEGER DEFAULT 0
);

-- 8. Lens Options: Usage Types (Step 1)
CREATE TABLE IF NOT EXISTS lens_usages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    base_price_inr INTEGER NOT NULL DEFAULT 0,
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT 1
);

-- 9. Lens Options: Thickness / Index Ratings (Step 3)
CREATE TABLE IF NOT EXISTS lens_thicknesses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usage_id INTEGER NOT NULL REFERENCES lens_usages(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    index_rating NUMERIC NOT NULL, -- 1.50, 1.60, 1.67, 1.74
    description TEXT,
    price_inr INTEGER NOT NULL DEFAULT 0,
    recommended_sph_range TEXT,
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT 1
);

-- 10. Lens Options: Coatings & Treatments (Step 4)
CREATE TABLE IF NOT EXISTS lens_coatings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    price_inr INTEGER NOT NULL DEFAULT 0,
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT 1
);

-- 11. Optical Stores / Physical Branches
CREATE TABLE IF NOT EXISTS stores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    address TEXT NOT NULL,
    city TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    slot_interval_minutes INTEGER DEFAULT 30,
    is_active BOOLEAN DEFAULT 1
);

-- 12. Store Operating Hours
CREATE TABLE IF NOT EXISTS store_hours (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    open_time TEXT NOT NULL,
    close_time TEXT NOT NULL,
    is_closed BOOLEAN DEFAULT 0
);

-- 13. Eye Test Appointments (With Atomic Overlap Prevention)
CREATE TABLE IF NOT EXISTS appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    appointment_number TEXT UNIQUE NOT NULL,
    store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    customer_email TEXT,
    appointment_date TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed')),
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_appointment_slot 
ON appointments(store_id, appointment_date, start_time) 
WHERE status != 'cancelled';

-- 14. Customer Enquiries & WhatsApp Commerce Leads
CREATE TABLE IF NOT EXISTS customer_enquiries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel TEXT NOT NULL DEFAULT 'whatsapp' CHECK (channel IN ('whatsapp', 'web_form', 'call')),
    customer_name TEXT,
    customer_phone TEXT,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    variant_id INTEGER REFERENCES product_variants(id) ON DELETE SET NULL,
    enquiry_payload TEXT NOT NULL,
    status TEXT DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'converted', 'closed')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 15. Orders Master Table
CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_number TEXT UNIQUE NOT NULL,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    customer_email TEXT,
    shipping_address TEXT NOT NULL,
    city TEXT,
    state TEXT,
    pincode TEXT,
    subtotal_inr INTEGER NOT NULL,
    discount_inr INTEGER DEFAULT 0,
    total_amount_inr INTEGER NOT NULL,
    payment_method TEXT NOT NULL CHECK (payment_method IN ('online', 'cod', 'in_store')),
    payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed')),
    order_status TEXT NOT NULL DEFAULT 'placed' CHECK (order_status IN ('placed', 'processing', 'lab_glazing', 'shipped', 'delivered', 'cancelled')),
    items_json TEXT NOT NULL,
    prescription_file_url TEXT,
    prescription_data TEXT,
    tracking_number TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 16. Eye Care Editorial Articles
CREATE TABLE IF NOT EXISTS eyecare_articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    excerpt TEXT,
    content_markdown TEXT NOT NULL,
    cover_image_url TEXT,
    author TEXT DEFAULT 'Senior Optometrist',
    is_published BOOLEAN DEFAULT 1,
    published_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 17. Store Settings & Site Configuration
CREATE TABLE IF NOT EXISTS site_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
