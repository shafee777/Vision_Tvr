# Optii Admin Operations & Bulk Import Guide

## 1. Admin Navigation Structure
The Optii Atelier Admin (`/admin`) is organized into four operational groups:
1. **Overview** — Store health KPIs, 7D/30D/90D live revenue chart, stock distribution bar, Needs Attention queues, Today's Appointments, and Recent Stock Movements.
2. **Catalog**
   - **Frames & Variants** (`products`): Searchable, filterable, paginated master frame catalog, variant & photo gallery editor, guided single-frame form, and 4-step Bulk Frame Import wizard.
   - **Inventory** (`inventory`): Variant-SKU stock control, quick low/out filters, single-SKU adjustment with live preview, CSV export, movement history, and Bulk Stock Count upload with stale-stock protection.
   - **Lens Pricing** (`lenses`): Step 1 Lens Usage, Step 3 Refractive Index Thickness, Step 4 Coatings.
   - **Brands & Shapes** (`taxonomy`): Optical brands, frame shape SVG silhouettes, and categories.
3. **Operations**
   - **Orders & Lab** (`orders`): Lifecycle management (`placed` → `processing` → `lab_glazing` → `shipped` → `delivered` / `cancelled`), refunds, and manual tracking references.
   - **Appointments** (`appointments`): In-store eye tests with Today/Upcoming/Status filters and slot-collision prevention.
   - **Customer Enquiries** (`enquiries`): WhatsApp and web inquiries with status tracking.
4. **Administration**
   - **Team & Roles** (`users`): Admin, Optometrist, Staff accounts.
   - **Activity Log** (`audit`): Immutable administrative & inventory audit trail.
   - **Store Settings** (`settings`): Clinic name, physical address, and WhatsApp business number.

## 2. Role Permissions (Backend & UI Enforced)
| Capability | Admin | Optometrist | Staff |
| :--- | :---: | :---: | :---: |
| Overview, Frames View, Orders, Enquiries | Yes | Yes | Yes |
| Create/Edit Frames, Variants, Photos, Catalogue Bulk Import | Yes | No | No |
| Stock Adjustments, Stock Count Bulk Import, Export CSV | Yes | Yes | Yes |
| Lens Pricing & Appointments Queue | Yes | Yes | No |
| Team & Roles, Activity Log, Store Settings | Yes | No | No |

## 3. Product Code (`prod_code`) vs. Internal Variant SKUs
- **Frame (`products`)** holds shared specifications: `prod_code` (stored internally in `products.sku`), `product_name`, `brand_name`, `shape_name`, `category_name`, `base_price_inr`, `gender`, `material`, `frame_fit`, `frame_type`, `lens_width_mm`, `bridge_width_mm`, `temple_length_mm`, `frame_height_mm`, and `total_width_mm`.
- **Colour Variant (`product_variants`)** holds per-colourway data (`color_name`, `price_override_inr`, `stock_quantity`) and internal identifiers (`sku`, `color_hex`, `is_active`) which are automatically generated/managed by the server when omitted by staff.
- In both the **4-Step Single Frame Wizard** (`+ Add Single Frame`) and **Bulk Frame Import**, staff only enter `prod_code` and `color_name` — rows sharing the same `prod_code` automatically group into **one frame** with **multiple colour variants**.

## 4. Catalogue Bulk Import CSV Template & Single Frame Wizard
Supports UTF-8 (with or without BOM), CRLF/LF, quoted commas, and direct copy-paste from Excel / Google Sheets (TSV). Downloading the Blank Catalogue Template (`GET /api/admin/imports/catalogue/template`) returns a genuinely blank CSV with header row only (0 prepopulated sample rows).

**Blank Template Headers:**
```text
prod_code,product_name,brand_name,category_name,shape_name,material,frame_type,frame_fit,gender,base_price_inr,description,color_name,price_override_inr,opening_stock,lens_width_mm,bridge_width_mm,temple_length_mm,frame_height_mm,total_width_mm
```

**Single Frame Creation Wizard (`+ Add Single Frame`):**
1. **Step 1 — Frame Info:** Name, `prod_code`, Brand, Category, Shape, Frame Type, Material, Fit, Gender, Base Price (₹), Description.
2. **Step 2 — Measurements (mm):** `lens_width_mm` (30–75), `bridge_width_mm` (10–35), `temple_length_mm` (100–180), `frame_height_mm` (20–90, optional), `total_width_mm` (90–200, optional) with inline optical measurement diagram.
3. **Step 3 — Colour & Stock:** `color_name`, `opening_stock`, `price_override_inr` (optional).
4. **Step 4 — Photos (1–5):** Drag-and-drop or file picker for up to 5 JPEG/PNG/WebP images (max 5 MB each), live previews, image type selector, arrow reordering, `Primary` selection, removal, and atomic creation + server-side magic-byte/Jimp validation.

**Validation Rules:**
- Existing `prod_code` or derived `product_slug` values are rejected (Create New Frames only — no silent overwrites).
- `brand_name`, `shape_name`, `category_name` must match existing active taxonomy records.
- Rows sharing a `prod_code` must have identical master specifications.
- Valid `opening_stock > 0` writes an `inventory_movements` entry with `movement_type = 'replenishment'`.

## 5. Inventory Stock Count Import Workflow
1. Click **Download Stock Count Sheet** (`GET /api/admin/imports/inventory/template`) to export active SKUs with live `expected_current_quantity`.
2. Fill `counted_quantity` and `reason` in Excel/Google Sheets, then upload CSV or paste rows.
3. Backend validates `expected_current_quantity` against live SQLite `stock_quantity` inside an `IMMEDIATE` transaction:
   - If another user/order changed stock concurrently, the API returns `409 STALE_STOCK_CONFLICT` and **rolls back the entire batch**.
   - Unchanged counts (`counted_quantity === database_quantity`) are recorded as unchanged without creating fake movement logs.
4. Failed batches record row-level diagnostics downloadable from **Import History** (`GET /api/admin/imports/:batchId/report`).

## 6. Key Admin & Import API Endpoints
- `GET /api/admin/dashboard/analytics?days=7|30|90`
- `GET /api/admin/imports/catalogue/template`
- `POST /api/admin/imports/catalogue/validate` & `/commit`
- `GET /api/admin/imports/inventory/template`
- `POST /api/admin/imports/inventory/validate` & `/commit`
- `GET /api/admin/imports/history` & `GET /api/admin/imports/:batchId/report`
- `GET /api/admin/inventory/export`

## 7. Migrations & Test Commands
```bash
npm run migrate
node scripts/test_admin_restructure.js
node scripts/test_admin_improvements.js
node scripts/test_optii_api.js
```
