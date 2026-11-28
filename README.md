# Optii — Modern Optical E-Commerce & Atelier Platform

Full-stack optical retail platform for handcrafted eyeglasses, sunglasses, custom 4-step prescription lenses, in-store eye test appointments, WhatsApp commerce, and atelier operations.

## Tech Stack
- **Frontend:** Vanilla HTML5, CSS3 (`public/css/optii.css`), ES6+ JavaScript (`public/js/optii-*.js`)
- **Backend:** Node.js, Express (`4.21.1`), Zod (`3.23.8`), JWT + `bcryptjs`, Multer + Jimp
- **Database:** SQLite (`sqlite3`, stored in `data/optii.db`)

## Quick Start

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env
   ```
   Set `JWT_SECRET` (min 32 chars in production) and `ADMIN_SEED_PASSWORD` before seeding.

3. **Run migrations and seed data**
   ```bash
   npm run migrate
   npm run seed
   ```

4. **Start the server**
   ```bash
   npm run dev   # or: npm start
   ```
   - Storefront: `http://localhost:5050/`
   - Order Tracking: `http://localhost:5050/track`
   - Admin Portal: `http://localhost:5050/admin.html`

## Verification

```bash
node scripts/test_optii_api.js
node scripts/test_admin_restructure.js
node scripts/test_admin_improvements.js
```

See [docs/ADMIN_GUIDE.md](docs/ADMIN_GUIDE.md) for the Optii Admin Operations, CSV Catalogue Import, and Bulk Stock Count workflows.
