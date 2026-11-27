# Optii (`Vision_Tvr`) — Product Design, UX & Engineering Audit

**Audit Date:** 2026-11-25  
**Scope:** Full-repository read-only audit (`public/`, `server/`, `docs/`, `scripts/`) + deterministic UI scan via `impeccable detect`.  
**Working Assumptions:**
1. The active product is **Optii**, an optical retail e-commerce & in-store clinic platform for a physical store in **Thiruvarur, Tamil Nadu, India**, targeting Indian eyewear shoppers (pricing in INR `₹`, WhatsApp commerce) and store staff/optometrists.
2. `public/css/optii.css`, `public/js/optii-*.js`, `public/index.html`, `public/product.html`, `public/track.html`, and `public/admin.html` represent the active application; `public/css/styles.css`, `public/js/app.js`, `public/js/api.js`, and `server/db/seed.js` ("Vision Opticals") are legacy artifacts left in the repo.
3. The primary visual benchmark is Ace & Tate (`aceandtate.com`) as specified in `AGENTS.md` and `docs/DESIGN_SYSTEM.md`.

---

## Phase 0 — Discover (10-Line Summary)

1. **What it is:** **Optii** is an optical retail e-commerce storefront and clinic operations platform for handcrafted eyeglasses, sunglasses, custom prescription lenses, and in-store eye test appointments in Thiruvarur, India.
2. **Users:** (a) Retail eyewear customers browsing frames, configuring 4-step prescription lenses, booking eye tests, ordering via checkout/WhatsApp, and tracking orders; (b) Store staff, optometrists, and admins managing catalog, inventory, glazing orders, appointments, and enquiries.
3. **Tech stack:** Vanilla HTML/CSS/ES6+ frontend (no bundler, no framework, no TypeScript) + Node.js/Express (`4.21.1`) backend + SQLite (`sqlite3`, with `pg` dependency present) + Zod (`3.23.8`) validation + JWT/bcryptjs auth + Multer/Jimp media handling.
4. **Entry points:** Backend starts at `server/index.js` (default port `5050`); API test script at `scripts/test_optii_api.js`; DB migrations at `server/db/migrate.js`; seeders at `server/db/seeds/optii_seed.js`.
5. **Surface 1 — Storefront (`public/index.html`):** Editorial hero, shape strip, faceted filter drawer, 4-col/2-col product grid, search modal, quick-view modal, eye-test booking modal, wishlist & cart drawers, and checkout modal.
6. **Surface 2 — Product Detail & Lens Configurator (`public/product.html`):** Multi-image gallery with fullscreen zoom, mm frame schematic, colorway swatches, 4-step progressive lens configurator modal, and WhatsApp enquiry.
7. **Surface 3 — Order Tracking (`public/track.html`):** Standalone order lookup page showing glazing-to-delivery timeline stages and configured eyewear summary.
8. **Surface 4 — Admin Portal (`public/admin.html`):** Role-gated operations dashboard (Admin, Optometrist, Staff) for products, variants/photos, inventory adjustments, lens pricing, appointments, orders/refunds, WhatsApp leads, taxonomy, audit logs, users, and clinic settings.
9. **Legacy surfaces still in repo:** Unused "Vision Opticals" stylesheet (`public/css/styles.css`, 2,526 lines) and scripts (`public/js/app.js`, `public/js/api.js`, 2,075 lines) sit alongside active Optii assets.
10. **Automated scan baseline:** `impeccable detect` flagged contrast failures (`2.4:1–4.2:1`), `<img src="">` placeholders, `10px–11px` undersized UI text, cramped table containers, skipped heading levels (`h1` → `h3`), and banned kicker labels.

---

## Phase 1 — User-Friendliness Audit

### 1. Onboarding & First-Time Experience
- **[P0 | S] Admin Portal completely fails to load due to syntax error** — `public/js/admin.js:963-964` has a duplicate closing brace `},` right after `refundOrder()`. A browser throws `Uncaught SyntaxError: Unexpected token '}'`, preventing `OptiiAdmin` from initializing at all. Staff/admins see a non-functional login screen where clicking role tabs or submitting the form does nothing.
- **[P1 | M] First-time shoppers cannot see Accessories, Contact Lenses, Eye Care, or Account/Login** — `public/index.html` header navigation only exposes `Glasses`, `Sunglasses`, `Lens Guide`, and `Eye Test`, omitting `Accessories`, `Contact Lenses`, `Eye Care`, and `Account/Login` required in `AGENTS.md`. Returning users have no account/order-history entry point from the main nav.
- **[P1 | S] Storefront reloads lose all browsing context** — `public/js/optii-storefront.js` filters and switches categories in memory via `onclick` handlers (`OptiiApp.loadProducts()`) without updating URL query params or `history.pushState`. Sharing a filtered URL, refreshing, or pressing the browser Back button resets the user to the unfiltered homepage.

### 2. Core Flows (Dead Ends, Confusing Labels, Missing Feedback)
- **[P0 | S] Clinic Settings form in Admin fakes saving** — `public/js/admin.js:1236-1239` (`handleSaveSettings`) calls `e.preventDefault()` and displays `this.toast('Clinic settings updated.', 'success')` without sending any `PUT`/`POST` request to the backend. Staff believe store address/hours/WhatsApp number were saved, only to lose changes on refresh.
- **[P1 | S] Lens price editing uses native browser `prompt()`** — `public/js/admin.js:707-708` (`editLensPrice`) uses `window.prompt()` instead of an inline form or modal, giving no currency formatting, no validation feedback before submit, and a jarring OS dialog.
- **[P1 | S] Filter drawer "Apply" button shows hardcoded `(6)` count** — `public/index.html:347` hardcodes `<button class="btn-filter-apply" id="btn-filter-apply">(6) Apply</button>`. Before interaction (or if filters match 0 or 24 frames), users are misled into thinking 6 products match.
- **[P1 | M] New Product modal in Admin uses hardcoded dropdown options** — `public/admin.html:718-744` hardcodes brands, categories, and shapes in `<select>` elements rather than populating them from `/api/admin/brands`, `/api/admin/categories`, and `/api/admin/shapes`. Newly added taxonomy items cannot be assigned to new products without editing HTML.
- **[P2 | S] PDP Prescription manual entry range is overly narrow** — `public/product.html` / `optii-pdp.js` restricts SPH inputs compared to real-world optical prescriptions (which span up to `±20.00 D` in `0.25` steps), forcing high-power customers to abandon manual entry or upload a file.
- **[P2 | S] Fake social proof on PDP** — `public/product.html:133-136` hardcodes `4.9 · 42 verified wearer reviews` for every single product regardless of actual reviews or catalog item.

### 3. Loading, Empty, Error & Success States
- **[P1 | S] PDP flashes "Loading Silhouette…" and `₹0` before data arrives** — `public/product.html:126-129` renders literal `"Loading Silhouette…"` and `"₹0"` with no skeleton state; if `/api/products/:slug` fails or is slow, the user sees `₹0` and broken empty `<img src="">` (`public/product.html:271`).
- **[P2 | S] Quick-view modal initializes with empty `<img src="">`** — `public/index.html:500` has `<img id="pdp-modal-main-img" src="" alt="Frame Studio Shot" />`, which triggers a broken-image icon if the modal opens before JS sets `src` or if a product lacks imagery.
- **[P2 | S] Order tracking and Checkout lack inline field-level error summaries** — `public/track.html:50-55` and `public/js/optii-cart.js` rely on browser native tooltips or generic red text; server validation errors from Zod (`middleware/validate.js`) aren't mapped back to the specific offending input.

### 4. Input Handling & Destructive Actions
- **[P2 | S] Destructive admin actions use `window.confirm()`** — `public/js/admin.js:540, 946, 1102, 1206` (`deleteProductImage`, `refundOrder`, `deleteTaxonomyItem`, `deleteUser`) rely on native `confirm()`, which cannot show rich context (e.g., refund amount breakdown or affected product count) and breaks keyboard/screen-reader modal consistency.
- **[P2 | S] No undo or archive confirmation for product archiving** — `public/js/admin.js:364` (`toggleProductActive`) immediately archives an active storefront product on single click with no confirmation or undo toast.

### 5. Accessibility (WCAG 2.2 AA)
- **[P0 | S] Severe low-contrast muted text in Admin Portal** — `public/css/admin.css:20` sets `--ink-muted: #9ca3af` on `#ffffff` (**2.5:1** contrast ratio, failing WCAG AA 4.5:1) and **2.4:1** on `#fafafa` hover states (`impeccable detect` on `public/admin.html:66, 247`).
- **[P1 | S] Low-contrast muted text on Storefront & PDP** — `public/css/optii.css` uses `--color-ink-muted: #757575` on `#f5f5f5` (**4.2:1** contrast ratio, failing WCAG AA 4.5:1 — `impeccable detect` on `public/index.html:377` and `public/product.html:158`).
- **[P1 | S] Undersized functional UI text (`10px–11px`)** — `impeccable detect` flagged `10px` functional labels (`admin.html:66, 74, 96, 113, 139`) and `11px` body/meta text across `index.html:121, 418`, `product.html:53, 521`, and `admin.html:49, 50, 182-227, 870`.
- **[P1 | S] Touch targets below 44×44px on mobile** — `public/css/optii.css:834-836` sets `.swatch-touch-container` to `26px × 26px`, and `optii.css:1309-1312` sets `.header-action-btn` to `36px × 36px` at `<=768px`, violating both `AGENTS.md` ("Minimum touch targets around 44px") and comfortable mobile ergonomics.
- **[P1 | S] Skipped heading hierarchy on PDP** — `public/product.html:126, 259` jumps from `<h1>` ("Loading Silhouette…") directly to `<h3>` ("Handcrafted in our Atelier") with no `<h2>`, breaking screen-reader outline navigation.
- **[P2 | S] Drawers and modals lack focus trapping & `aria-modal`** — `public/index.html` and `public/product.html` modals/drawers close on `Escape` (`optii-pdp.js:880`, `admin.js:1275`) but do not trap `Tab` focus or return focus to the trigger button on close.

### 6. Language, Tone & Brand Consistency
- **[P0 | S] Wrong brand name on Admin Portal** — `public/admin.html:23` renders `Vision` `OPERATIONS` and `public/admin.html:66` renders `Vision` `Optical` instead of **Optii**.
- **[P1 | S] Conflicting store addresses across customer touchpoints** — `public/index.html:37` (JSON-LD) states `42 North Street, Near South Temple Arch, Thiruvarur`, while `public/index.html:451` (Appointment modal) states `12 Kamalalayam West Bank, Thiruvarur`. Customers booking an eye test get two different physical addresses.
- **[P1 | S] Hardcoded WhatsApp number on PDP** — `public/product.html:196` hardcodes `+91 94865 52324` in the button label instead of reading the admin-configured WhatsApp number from `/api/settings` or `/api/stores`.

---

## Phase 2 — Design Audit

### 1. Overall Feel (Blunt Assessment)
The storefront (`index.html`, `optii.css`) has a **genuinely strong structural foundation** inspired by Ace & Tate: sharp `0px` product cards, 1:1 studio-to-model hover swaps, clean 4-col/2-col responsive density, and a focused monochrome palette. However, it is undermined by **incomplete polish and leftover template seams**: inline `<style>` blocks in `index.html:59-115`, inline `style="..."` attributes scattered across HTML, hardcoded `11px` kickers above headings, emoji icons (`📅`, `💬`, `👁️`) mixed with crisp Feather-style SVG icons, and an Admin Portal (`admin.html`) that looks like a mismatched generic SaaS dashboard still branded "Vision Optical".

### 2. Visual Hierarchy, Layout & Spacing
- **[P1 | S] Cramped table wrappers in Admin & accordion on PDP** — `impeccable detect` flagged `.card-table-wrap` (`admin.html:512, 607, 638`) and `.pdp-accordion-group` (`product.html:221`) for children sitting flush against borders/backgrounds with zero inset padding.
- **[P2 | S] Broken footer layout on Order Tracking page** — `public/track.html:79` uses `<div class="footer-container">`, whereas `public/css/optii.css:1177` styles `.footer-top-grid`. As a result, the track page footer loses its multi-column grid and renders differently from `index.html` and `product.html`.
- **[P2 | S] Kicker-above-heading pattern** — `impeccable detect` flagged 4 instances (`index.html` "Optical Craftsmanship" / "In-Store Optometry"; `product.html` "OPTII ATELIER" / "Explore More Silhouettes") of tiny tracked uppercase kickers sitting above headings, adding visual noise without earning space.

### 3. Typography & Color
- **[P1 | S] System font stack vs. documented/admin font mismatch** — `optii.css` and `admin.css` use system UI sans (`-apple-system, BlinkMacSystemFont...`), while `public/css/styles.css` loads `DM Serif Display` + `DM Sans` and `admin.html` loads Google Fonts separately. Without a deliberate primary typeface (e.g. `Inter` or `Plus Jakarta Sans` + `JetBrains Mono` for mm specs/SKUs), headings at `54px` (`optii.css`) look slightly generic on Windows (`Segoe UI`).
- **[P2 | M] No dark mode support** — Neither `optii.css` nor `admin.css` defines `prefers-color-scheme: dark` or `[data-theme="dark"]` tokens; all surfaces are hardcoded `#ffffff` / `#f5f5f5`.

### 4. Components, Motion & Feedback
- **[P2 | M] Inline styles override design tokens** — `public/index.html` (e.g., L374, L448-520), `public/product.html` (L128, L177-181, L257-259), and `public/track.html` (L14, L43-60) contain dozens of inline `style="..."` rules with hardcoded `#fff`, `#dc2626`, and ad-hoc padding/radii (`12px` vs `6px` vs `4px`), bypassing `optii.css` tokens.
- **[P2 | S] Emoji icons in primary CTAs** — `📅 Book Eye Test`, `💬 Inquire & Order on WhatsApp`, and `👁️` in cart/admin (`index.html:382, 520`, `product.html:196`, `track.html:37`, `optii-pdp.js:816`) clash with the minimalist European optical aesthetic and render inconsistently across OSes.
- **[P2 | S] Reduced-motion rule destroys all state transitions** — `public/css/optii.css:1430-1437` uses `transition-duration: 0.01ms !important` on `*`, which kills helpful opacity/focus feedback rather than selectively disabling transform/slide animations.

---

## Phase 3 — Everything Else (Architecture, Security, Maintainability)

1. **[P0 | S] Client-controlled item pricing in Order Creation (`server/routes/orders.routes.js:160-171`)**:
   - **Evidence:** `let price = Number(it.total_price_inr || it.price_inr || it.item_price_inr || 0);` only queries `db.get` if `price <= 0`.
   - **Impact:** A malicious client can POST `total_price_inr: 1` for a ₹12,000 frame and the server will record and charge ₹1. Server must always compute frame + lens + coating prices from DB records.
2. **[P0 | S] Plaintext staff credentials & fallback secrets in repo (`public/admin.html:49-53`, `public/js/admin.js:175`, `server/config/index.js:13, 62-70`)**:
   - **Evidence:** `admin.html` displays `admin / optii123`, `optometrist / optii123`, `staff / optii123` and `admin.js` auto-fills `'optii123'` in non-production mode; `server/config/index.js` ships hardcoded fallback secrets (`DEV_FALLBACK_JWT_SECRET`, `BACKUP_ENCRYPTION_KEY`, Razorpay/Cashfree sandbox keys).
   - **Impact:** Any accidental deployment without `NODE_ENV=production` exposes working admin credentials on the login page.
3. **[P1 | M] Massive dead/legacy codebase still in `public/` & `server/db/`**:
   - **Evidence:** `public/css/styles.css` (2,526 lines), `public/js/app.js` (1,718 lines), `public/js/api.js` (357 lines), and `server/db/seed.js` (895 lines, using `vision123` and "Vision Opticals") are unused by `index.html`/`product.html`/`admin.html`.
   - **Impact:** Confuses contributors, bloats repo, and causes contradictory brand/address/password references.
4. **[P1 | S] Missing `README.md`**:
   - **Evidence:** `README.md` does not exist at repo root. New developers have no quickstart, env setup, migration/seed order, or test instructions without reading `package.json` and `docs/ARCHITECTURE.md`.
5. **[P2 | S] Unused `pg` dependency & lack of frontend/E2E tests**:
   - **Evidence:** `package.json` lists `pg: ^8.13.1`, and `scripts/test_optii_api.js` only covers backend API endpoints; there are zero frontend unit/DOM tests or Playwright visual/E2E checks.
6. **[P2 | S] `console.log` debug statements in production frontend**:
   - **Evidence:** `optii-storefront.js:32`, `admin.js:32` log initialization messages unconditionally.

---

## Phase 4 — Deliverables

### 1. Prioritized Backlog Table

| ID | Finding | Severity | Effort | Fix |
| :--- | :--- | :--- | :--- | :--- |
| **AUD-01** | SyntaxError (`},`) in `public/js/admin.js:963-964` breaks entire Admin Portal | **P0** | **S** | Remove stray `},` on line 964 and verify `node --check public/js/admin.js` |
| **AUD-02** | Client-supplied item prices trusted in `server/routes/orders.routes.js:160-171` | **P0** | **M** | Always look up `base_price_inr`/`price_override_inr` + lens usage/thickness/coating prices from DB |
| **AUD-03** | `handleSaveSettings` in `public/js/admin.js:1236` fakes save with toast only | **P0** | **S** | Wire `PUT /api/admin/settings` and persist store name, address, phone, WhatsApp, hours |
| **AUD-04** | Admin Portal branded "Vision OPERATIONS" / "Vision Optical" (`admin.html:23, 66`) | **P0** | **S** | Rebrand to `Optii OPERATIONS` / `Optii Atelier` and remove plaintext password hints |
| **AUD-05** | Admin `--ink-muted: #9ca3af` fails WCAG AA contrast (2.4–2.5:1) (`admin.css:20`) | **P0** | **S** | Darken `--ink-muted` to `#6b7280` (≥4.8:1 on `#fff`) and `#4b5563` on `#fafafa` |
| **AUD-06** | Storefront `--color-ink-muted: #757575` fails AA on `#f5f5f5` (4.2:1) (`optii.css`) | **P1** | **S** | Darken `--color-ink-muted` to `#595959` (6.3:1 on `#f5f5f5`, 7.0:1 on `#fff`) |
| **AUD-07** | Undersized `10px–11px` UI text across all 4 HTML pages | **P1** | **S** | Raise minimum functional/label text to `12px` (`0.75rem`) and body text to `14px–16px` |
| **AUD-08** | Missing URL/History state for storefront filters & categories (`optii-storefront.js`) | **P1** | **M** | Sync `state.category` & `state.filters` with `URLSearchParams` + `popstate` |
| **AUD-09** | Hardcoded `(6) Apply` in filter drawer (`index.html:347`) | **P1** | **S** | Dynamically update count from live filtered product total before apply |
| **AUD-10** | Hardcoded brand/category/shape `<select>` in Admin New Product modal (`admin.html:718-744`) | **P1** | **S** | Populate selects dynamically from `/api/admin/brands`, `/categories`, `/shapes` |
| **AUD-11** | Mobile touch targets `< 44px` (`.swatch-touch-container` 26px, `.header-action-btn` 36px) | **P1** | **S** | Increase mobile touch target hitboxes to `44px × 44px` (keeping inner dot 16–20px) |
| **AUD-12** | Conflicting store addresses (`42 North Street` vs `12 Kamalalayam West Bank`) | **P1** | **S** | Unify address in DB seed, JSON-LD, and appointment modal from `/api/stores` |
| **AUD-13** | Hardcoded WhatsApp number on PDP (`product.html:196`) & fake reviews (`product.html:135`) | **P1** | **S** | Load WhatsApp number from `/api/settings`; remove/replace hardcoded `4.9 · 42 reviews` |
| **AUD-14** | Skipped heading level (`h1` → `h3`) on PDP (`product.html:126, 259`) | **P1** | **S** | Change `<h3>` to `<h2>` for "Handcrafted in our Atelier" |
| **AUD-15** | Cramped padding on `.card-table-wrap` (`admin.html`) & `.pdp-accordion-group` (`product.html`) | **P1** | **S** | Add `padding: 0 12px` / `padding: 12px 0` inset spacing inside bordered containers |
| **AUD-16** | Legacy dead code (`styles.css`, `app.js`, `api.js`, `seed.js`) + missing `README.md` | **P1** | **M** | Archive/remove unused Vision Opticals assets and add concise `README.md` |
| **AUD-17** | Missing nav items (`Accessories`, `Contact Lenses`, `Eye Care`, `Account`) per `AGENTS.md` | **P1** | **L** | Add dynamic category nav items & customer order-lookup/account drawer |
| **AUD-18** | PDP loads with `"Loading Silhouette…"`, `₹0`, and empty `<img src="">` (`product.html`, `index.html:500`) | **P2** | **S** | Add clean skeleton shimmer and omit/hide `<img>` until `src` is populated |
| **AUD-19** | `track.html:79` uses `.footer-container` instead of `.footer-top-grid` | **P2** | **S** | Align `track.html` footer markup with `index.html`/`product.html` |
| **AUD-20** | Emoji icons (`📅`, `💬`, `👁️`) & `window.prompt()`/`confirm()` dialogs | **P2** | **M** | Replace emojis with monochrome SVGs; replace `prompt`/`confirm` with styled modals |
| **AUD-21** | Kicker-above-heading labels (`index.html`, `product.html`) | **P2** | **S** | Remove decorative uppercase kickers; let headings carry hierarchy |
| **AUD-22** | Inline `<style>` and `style="..."` attributes bypassing tokens | **P2** | **M** | Extract modal/utility styles into `optii.css` / `optii-pdp.css` |
| **AUD-23** | Focus trapping & `aria-modal="true"` missing on drawers/modals | **P2** | **M** | Add focus trap + `aria-modal="true"` + restore focus on close |
| **AUD-24** | Narrow manual SPH range in lens configurator (`optii-pdp.js`) | **P2** | **S** | Expand SPH options to `-20.00` to `+12.00` in `0.25` increments |

---

### 2. Proposed Unified Design System (CSS Variables)

Ready to drop into `public/css/tokens.css` and share across Storefront, PDP, Tracking, and Admin:

```css
:root {
  /* ── Brand & Neutral Surfaces ── */
  --surface-page: #ffffff;
  --surface-subtle: #f5f5f5;
  --surface-elevated: #fbfbfb;
  --surface-inverted: #0a0a0a;

  /* ── Ink & Contrast-Safe Text (WCAG AA >= 4.5:1 on white & #f5f5f5) ── */
  --ink-primary: #0a0a0a;       /* 19.8:1 on #fff */
  --ink-secondary: #4a4a4a;     /* 8.9:1 on #fff, 8.1:1 on #f5f5f5 */
  --ink-muted: #595959;         /* 7.0:1 on #fff, 6.3:1 on #f5f5f5 */
  --ink-inverted: #ffffff;

  /* ── Borders ── */
  --border-subtle: #e5e5e5;
  --border-strong: #d4d4d4;
  --border-focus: #0a0a0a;

  /* ── Semantic & Brand Accents ── */
  --accent-whatsapp: #128c7e;   /* Accessible dark teal-green (>= 4.5:1 with white text) */
  --accent-whatsapp-bg: #25d366;
  --status-success: #065f46;
  --status-success-bg: #ecfdf5;
  --status-warning: #92400e;
  --status-warning-bg: #fffbeb;
  --status-danger: #991b1b;
  --status-danger-bg: #fef2f2;

  /* ── Typography ── */
  --font-sans: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;

  /* Type Scale (12px minimum for functional UI text) */
  --text-xs: 0.75rem;    /* 12px - badges, captions, mm specs */
  --text-sm: 0.875rem;   /* 14px - body, inputs, table cells */
  --text-base: 1rem;     /* 16px - product titles, primary body */
  --text-lg: 1.25rem;    /* 20px - card/drawer headers */
  --text-xl: 1.5rem;     /* 24px - section headings */
  --text-2xl: 2rem;      /* 32px - PDP title, feature banners */
  --text-3xl: 3rem;      /* 48px - editorial hero */

  /* ── Spacing Scale (4px base) ── */
  --space-1: 0.25rem;   /* 4px */
  --space-2: 0.5rem;    /* 8px */
  --space-3: 0.75rem;   /* 12px */
  --space-4: 1rem;      /* 16px */
  --space-6: 1.5rem;    /* 24px */
  --space-8: 2rem;      /* 32px */
  --space-12: 3rem;     /* 48px */
  --space-16: 4rem;     /* 64px */

  /* ── Radii & Layout ── */
  --radius-none: 0px;       /* Product imagery */
  --radius-sm: 4px;         /* Inputs, admin cards */
  --radius-md: 8px;         /* Modals, drawers */
  --radius-pill: 9999px;    /* Primary CTAs, filter chips */
  --container-max: 1440px;
  --header-h: 60px;
  --touch-min: 44px;
}
```

**Core Component List:**
1. `AnnouncementBar` (36px, `#0a0a0a`, ≥12px text)
2. `SiteHeader` (60px sticky, responsive drawer trigger, 44px icon hitboxes)
3. `ProductCard` (1:1 sharp image + hover model swap, 44px wishlist hitbox, 44px swatch hitboxes, INR price)
4. `SlideDrawer` (left filter/nav, right cart/wishlist, focus-trapped, dynamic apply count)
5. `OpticalSpecGrid` (Lens Width / Bridge / Temple in mm + Fit badge)
6. `LensConfiguratorModal` (4-step stepper, live price bar, wide SPH range)
7. `AdminDataTable` (padded `.card-table-wrap`, semantic status pills, inline edit modal)

---

### 3. Redesign Plan for 3 Highest-Impact Screens

1. **Admin Portal (`public/admin.html` + `public/js/admin.js`)**
   - **What changes:** Fix the `SyntaxError` at line 964; rebrand "Vision OPERATIONS / Optical" to **Optii Atelier**; remove plaintext credentials from production/login UI; darken `--ink-muted` to `#6b7280`; replace `window.prompt()`/`confirm()` with a shared `AdminConfirmModal`; dynamically populate Brands/Categories/Shapes in the New Product modal; wire `handleSaveSettings` to `PUT /api/admin/settings`; add inset padding to `.card-table-wrap`.
   - **Why:** Currently the Admin Portal does not parse in JS (P0 blocker), leaks default credentials, fakes saving settings, and fails WCAG AA contrast across 20+ labels.

2. **Product Detail Page & 4-Step Lens Configurator (`public/product.html` + `public/js/optii-pdp.js`)**
   - **What changes:** Replace `"Loading Silhouette…" / ₹0` with a clean skeleton state; remove fake `4.9 · 42 verified wearer reviews`; fix `h1` → `h2` heading order; load WhatsApp number dynamically; swap emoji icons for crisp SVGs; expand manual SPH range (`-20.00` to `+12.00`); omit empty `<img src="">` on fullscreen zoom until opened.
   - **Why:** The PDP is the highest-intent conversion surface; fake reviews, `₹0` flash, and narrow prescription ranges directly erode clinical trust.

3. **Storefront Catalog & Filter Drawer (`public/index.html` + `public/js/optii-storefront.js`)**
   - **What changes:** Sync category/filter/sort state to URL query params; dynamically update the filter drawer's `(n) Apply` button count; darken `--color-ink-muted` to `#595959`; raise `11px` copy to `12px+`; expand mobile swatch & header icon hitboxes to `44px × 44px`; remove kicker labels and empty `<img src="">` in quick-view modal.
   - **Why:** Fixes mobile tap-target frustration, preserves browser Back/shareable URLs, and brings contrast & typography to WCAG AA.

---

### 4. Top-10 Quick Wins (Finishable in One Day)

1. **Fix `admin.js:964` SyntaxError** — delete the stray `},` so the Admin Portal boots. *(5 mins)*
2. **Fix `admin.html` branding & remove plaintext passwords** — replace `Vision` with `Optii` and hide credential hints behind `NODE_ENV === 'development'`. *(15 mins)*
3. **Wire `handleSaveSettings` in `admin.js:1236`** — call `PUT /api/admin/settings` instead of faking a success toast. *(20 mins)*
4. **Fix WCAG AA contrast tokens** — update `--ink-muted` in `admin.css` (`#6b7280`) and `--color-ink-muted` in `optii.css` (`#595959`). *(10 mins)*
5. **Enforce server-side price calculation in `orders.routes.js:160`** — ignore client-submitted `total_price_inr` and compute from DB. *(30 mins)*
6. **Dynamic filter count in `index.html:347`** — replace hardcoded `(6) Apply` with live count from `OptiiApp`. *(20 mins)*
7. **Fix PDP `h1` → `h2` & remove fake reviews** — `product.html:133-136, 259`. *(10 mins)*
8. **Unify Thiruvarur store address & dynamic WhatsApp number** — align `index.html:37` with `index.html:451` and `product.html:196`. *(20 mins)*
9. **Fix `track.html:79` footer class** — change `.footer-container` to `.footer-top-grid` to match `optii.css`. *(10 mins)*
10. **Increase mobile touch targets to 44px & remove empty `<img src="">`** — `optii.css:834, 1309`, `index.html:500`, `product.html:271`. *(30 mins)*
