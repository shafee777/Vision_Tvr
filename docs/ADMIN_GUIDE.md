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

## 3. Master SKU vs. Variant SKU
- **Master Frame (`products`)** holds shared specifications: `master_sku`, `product_name`, `brand_name`, `shape_name`, `category_name`, `base_price_inr`, `gender`, `material`, `frame_fit`, `lens_width_mm`, `bridge_width_mm`, `temple_length_mm`.
- **Colour Variant (`product_variants`)** holds per-colourway data: `variant_sku`, `color_name`, `color_hex`, `price_override_inr`, and canonical `stock_quantity`.
- In Bulk Frame Import, multiple rows sharing the same `master_sku` automatically group into **one master frame** with **multiple colour variants**.

## 4. Catalogue Bulk Import CSV Template
Supports UTF-8 (with or without BOM), CRLF/LF, quoted commas, and direct copy-paste from Excel / Google Sheets (TSV).

**Headers:**
```text
master_sku,product_name,product_slug,description,brand_name,shape_name,category_name,base_price_inr,gender,material,frame_fit,lens_width_mm,bridge_width_mm,temple_length_mm,frame_height_mm,total_width_mm,variant_sku,color_name,color_hex,color_secondary_hex,price_override_inr,opening_stock,is_default
```

**Demonstration Sample (do not insert demo rows into production DB):**
```csv
master_sku,product_name,product_slug,brand_name,shape_name,category_name,base_price_inr,gender,material,frame_fit,lens_width_mm,bridge_width_mm,temple_length_mm,variant_sku,color_name,color_hex,opening_stock,is_default
OP-MIRA-01,Mira Round,mira-round,Optii Atelier,Round,Eyeglasses,4290,unisex,Acetate,Medium,49,20,145,OP-MIRA-BLK,Matte Black,#222222,12,1
OP-MIRA-01,Mira Round,mira-round,Optii Atelier,Round,Eyeglasses,4290,unisex,Acetate,Medium,49,20,145,OP-MIRA-TOR,Tortoise,#70513B,6,0
```

**Validation Rules:**
- Existing `master_sku`, `product_slug`, or `variant_sku` values are rejected (Create New Frames only — no silent overwrites).
- `brand_name`, `shape_name`, `category_name` must match existing active taxonomy records.
- Rows sharing a `master_sku` must have identical master specifications.
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
- `GET /api/admin/imports/catalogue/template` & `/sample`
- `POST /api/admin/imports/catalogue/validate` & `/commit`
- `GET /api/admin/imports/inventory/template`
- `POST /api/admin/imports/inventory/validate` & `/commit`
- `GET /api/admin/imports/history` & `GET /api/admin/imports/:batchId/report`
- `GET /api/admin/inventory/export`

## 7. Migrations & Test Commands
```bash
npm run migrate
node scripts/test_admin_restructure.js
node scripts/test_optii_api.js
```
