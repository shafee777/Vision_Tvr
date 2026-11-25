# Feature Migration Matrix: Vision Opticals → Optii

> **Document Status:** Comprehensive Feature Inventory & Strategic Decision Matrix  
> **Source Projects:** Original (`vision_opticals`) & Target Platform (`optii`)  
> **Guiding Principle:** Preserve operational business capabilities, deprecate fragile or bloated patterns, and elevate user experience to match modern optical retail standards.

---

## 1. Feature Classification Framework

Every system capability is categorized into one of five strategic buckets:

1. **Retain & Migrate As-Is:** Robust, operational backend routes, database entities, and workflows that meet business needs and require zero architectural replacement.
2. **Already Implemented / Available:** Foundation components, design system tokens, database structures, and responsive fixes already present in Optii.
3. **Refactor & Improve:** Features present in Vision Opticals that require modern UX redesign, mobile optimization, or security hardening.
4. **Newly Developed (Missing Gaps):** Features absent from the original project that are mandatory under `AGENTS.md` (e.g. Progressive 4-Step Lens Configurator, Millimeter Frame Dimension Breakdowns, Ace & Tate Filter Drawer, WhatsApp Pre-filled Markdown Deep Links).
5. **Do NOT Migrate (Deprecated):** Over-engineered, fragile, or aesthetic mismatches from the original project (e.g. monolithic 10-button navigation header, Kyoto 3D tower as primary catalog, raw unvalidated string template injection).

---

## 2. Master Feature Migration Matrix

| Subsystem | Feature Description | Original Status (Vision Opticals) | Current Status (Optii) | Strategic Action | Priority | Justification & Technical Strategy |
| :--- | :--- | :---: | :---: | :---: | :---: | :--- |
| **Identity & Security** | JWT Admin Authentication | Working (`/api/auth/login`, `me`) | Implemented | **Retain & Secure** | **P0** | Stateless JWT authentication with bcrypt password hashing is robust. Add rate limiting and cookie-based storage. |
| | Role-Based Access Control (RBAC) | Partial (single 'admin' role) | Documented | **Improve** | **P1** | Expand `users` table to support 'admin', 'optometrist', and 'store_staff' roles. |
| **Catalog & Discovery** | Product Listing Grid (PLP) | Working (3-col auto-fill) | Fixed (2-col mobile, 4-col desktop) | **Refactor & Redesign**| **P0** | Transform into Ace & Tate 4-column layout on desktop, 2-column on mobile with strict 1:1 square image aspect ratio. |
| | Dual-Image Hover Swap | Partially working in CSS | Tokenized & Styled | **Improve** | **P0** | Standardize dual image slots: `studio_front` default and `model_on_face` hover swap across all product cards. |
| | Dynamic Color Swatches | Basic text chips | Extracted in Design System | **Improve** | **P0** | Upgrade to 28px touch container, 20px color dot, and 2px black active ring with instant client-side photo swapping. |
| | Wishlist State & Drawer | Missing (only cart existed) | Documented in Design System | **Newly Develop** | **P0** | Add circular 36px heart wishlist button on cards (desktop top-right, mobile bottom-right) and slide-out wishlist drawer. |
| | Faceted Filter Drawer | Basic horizontal quick-chips | Documented in Design System | **Newly Develop** | **P0** | Build Ace & Tate slide-over drawer (~530px) with SVG frame shapes, frame fit diagrams, material pills, and live count CTA. |
| | Search by Keyword | Working (`/api/products?search=`) | Implemented | **Retain & Improve** | **P1** | Search backend works well. Redesign search input into a responsive popover/modal that does not crowd the main navbar. |
| | Revolving 3D Tower & Kyoto Stand | Complex 3-sided turntable fixture | In codebase | **Deprecate / Modularize** | **P3** | Highly DOM-heavy and deviates from the minimalist European brand aesthetic. Keep as an optional luxury demo module; remove from main catalog flow. |
| **Product Details (PDP)** | Frame Millimeter Dimensions | Basic text string in DB | Documented (51-20-150mm) | **Newly Develop** | **P0** | Optical customers require precise millimeter specs (Lens width, Bridge, Temple length). Display with optical line-art schematic. |
| | Image Gallery & Fullscreen Zoom | Basic modal single image | Fixed (pinned at top) | **Refactor & Redesign**| **P0** | Multi-image scrollable gallery (Studio front, 45° angle, hinge detail, model) with fullscreen modal zoom. |
| | Progressive 4-Step Lens Customizer | Missing (only raw text input) | Documented in Architecture | **Newly Develop** | **P0** | Four-step guided wizard: 1) Usage $\rightarrow$ 2) Prescription $\rightarrow$ 3) Thickness/Index $\rightarrow$ 4) Coatings, with dynamic INR subtotal calculation. |
| | Prescription File Upload | Working in `/api/orders` | Implemented | **Retain & Harden** | **P1** | Add file validation (MIME-type check for PDF/JPG/PNG, 5MB limit, UUID sanitization). |
| **Commerce & Checkout** | Slide-out Cart Drawer | Working (`#cart-drawer`) | Fixed | **Improve** | **P0** | Elevate styling to clean monochrome; display itemized lens upgrade breakdowns alongside frame base price in INR. |
| | WhatsApp Direct Enquiry & Order | Hardcoded WhatsApp link | Documented in Architecture | **Newly Develop** | **P0** | Build prefilled markdown string generator with `encodeURIComponent` and log lead intent to `/api/enquiries/whatsapp`. |
| | Online Order Placement | Working (`/api/orders`) | Implemented | **Retain & Secure** | **P1** | Preserves order placement, subtotal calculation, and prescription linkage. |
| | Order Tracking by Number / Phone | Working (`/api/orders/track/:no`)| Implemented | **Retain** | **P1** | Working modal and backend endpoint. Retain and refine UI presentation. |
| **Clinic & Appointments** | In-Store Eye Test Booking | Working (`/api/appointments`) | Fixed (modal functional) | **Improve** | **P0** | Add multi-branch store selector, dynamic 30-minute time slots, and atomic SQL collision lock to prevent double bookings. |
| | Optometrist Schedule Management | Admin status toggle (confirm/cancel)| Implemented | **Improve** | **P1** | Provide a clean calendar view for optical staff to review appointments by day and store branch. |
| **Inventory & Auditing** | Real-Time Stock Management | Working (`/api/inventory`) | Implemented | **Retain** | **P1** | Proven inventory tracking with low-stock threshold alerts (`low_stock_threshold`). |
| | Inventory Audit Logs | Working (`/api/inventory/logs`)| Implemented | **Retain** | **P1** | Full audit history tracking stock changes, reasons, timestamps, and staff usernames. |
| **Admin Operations** | Product Master Management | Working (`admin.html`) | Implemented | **Refactor & Redesign**| **P1** | Replace legacy single-file admin UI with modular component-driven dashboard, multi-photo drag-and-drop, and variant matrix. |
| | Dynamic Categories & Brands | Working (`/api/categories`) | Implemented | **Retain & Extend** | **P1** | Admin can add new brands and categories dynamically without frontend code changes. |
| | Lens Options & Pricing Admin | Missing (hardcoded in app.js) | Documented in Architecture | **Newly Develop** | **P1** | Admin dashboard to manage lens usage types, index prices (1.50–1.74), and coating add-ons dynamically. |
| | CSV Bulk Import & Export | Working (`/api/bulk/*`) | Implemented | **Retain** | **P2** | CSV product upload, template generation, and full inventory export are working and valuable for retail operations. |
| | Modular Component CMS | Working (`/api/components`) | Implemented | **Retain** | **P2** | Homepage block manager with soft-delete and undo capabilities. |
| | Store Settings & Timings | Working (`/api/settings`) | Implemented | **Retain & Improve** | **P1** | Key-value settings store for WhatsApp phone, opening hours, address, and SEO metadata. |
| **Content & Editorial** | Eye Care Educational Articles | Missing (only promo banners) | Documented in Architecture | **Newly Develop** | **P2** | Markdown-powered blog for optometry advice, vision care articles, and contact lens care. |
| | Promotional Banners & Strip | Working (`/api/offers`) | Implemented | **Retain & Improve** | **P2** | Manage promotional cards (e.g. "50% off second pair", "Computer Vision Fest"). |

---

## 3. Features That Should NOT Be Migrated (Deprecated Anti-Patterns)

1. **Unconstrained Horizontal Header Navigation:**  
   The original navbar crammed 10 action buttons into a fixed row with no wrapping, blowing out viewports under 1440px and causing severe horizontal overflow on mobile (920px body blowout). This is deprecated in favor of a clean 60px header with a responsive drawer.
2. **Hardcoded Monolithic JavaScript Architecture:**  
   `public/js/app.js` (~1700 lines) and `public/js/admin.js` (~1500 lines) mix DOM rendering, event handling, network fetching, and global state in single massive files. This pattern is deprecated in favor of modular, decoupled components.
3. **Over-Engineered 3D Revolving Tower in Primary Catalog:**  
   The Kyoto-inspired 3D stand with 3-sided 120° indexing and Kelvin lighting turntable was visually novel but caused heavy DOM bloat, high CPU usage on mobile, and cluttered the product discovery feed. It will be moved to an optional showcase module rather than dominating the main storefront.
4. **Unvalidated Form Input Handling:**  
   The original appointment and order placement forms accepted raw text inputs without strict client-side step validation or server-side schema constraints. This is replaced with structured Zod validation.

---

## 4. Prioritized Feature Implementation Sequence

```
+-----------------------------------------------------------------------------------------+
| PHASE 1: CORE CATALOG & DESIGN SYSTEM (P0)                                              |
| • Ace & Tate 4-column PLP (2-column mobile)                                             |
| • Dual-image studio/model hover transition                                              |
| • Left slide-over Filter Drawer (Shapes SVG, Fit diagrams, Material, Price)             |
| • Millimeter frame dimensions & sticky PDP gallery                                      |
| • Progressive 4-Step Lens Configurator                                                  |
+-----------------------------------------------------------------------------------------+
                                            │
                                            ▼
+-----------------------------------------------------------------------------------------+
| PHASE 2: COMMERCE & CONCURRENCY WORKFLOWS (P0 - P1)                                     |
| • Slide-out Cart Drawer with itemized lens upgrades in INR                             |
| • WhatsApp Prefilled Order Inquiry generator (with lead logging)                        |
| • In-Store Eye Test Booking Engine with atomic slot concurrency locks                   |
| • Order Tracking modal & customer lookup                                                |
+-----------------------------------------------------------------------------------------+
                                            │
                                            ▼
+-----------------------------------------------------------------------------------------+
| PHASE 3: ADMIN MANAGEMENT & OPERATIONAL CONTROLS (P1 - P2)                              |
| • Modern Admin Dashboard layout (separated from customer bundle)                        |
| • Product & Variant Matrix Editor (millimeter measurements + multi-image upload)        |
| • Dynamic Lens Pricing & Coating Management                                             |
| • Appointment Calendar & Store Hours Manager                                            |
| • Inventory Audit Logs & CSV Bulk Operations                                            |
+-----------------------------------------------------------------------------------------+
```
