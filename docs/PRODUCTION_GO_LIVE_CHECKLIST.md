# Optii Platform — Production Go-Live Checklist & Runbook

**Document Version:** 1.0.0  
**Effective Date:** 2026-11-22  
**Target Platform:** Optii Greenfield Optical Retail E-Commerce Platform  
**Target Domain:** `https://optii.in` / `https://www.optii.in`  
**Hosting Architecture:** Linux (Ubuntu 22.04 LTS), Node.js v20+ LTS, SQLite 3 (WAL Mode), Nginx Reverse Proxy, PM2  

---

## 1. Pre-Deployment Configuration & Secrets Checklist

- [ ] **Generate Production `JWT_SECRET`:**
  - Execute `openssl rand -hex 32` to produce a unique 64-character secret.
  - Set `JWT_SECRET` in `/var/www/optii/.env`.
  - Verify that `NODE_ENV=production` is set; ensure server fails to start if secret is fewer than 32 characters.
- [ ] **Configure Environment Variables (`.env`):**
  - `NODE_ENV=production`
  - `PORT=5050`
  - `DB_PATH=./data/optii_prod.db`
  - `WHATSAPP_PHONE=919486552324` (Official Atelier Business Line in E.164 format)
  - `CORS_ORIGIN=https://optii.in,https://www.optii.in`
  - `PUBLIC_URL=https://optii.in`
  - `STORE_NAME=Optii Atelier & Optical Clinic`
  - `STORE_ADDRESS=12 Kamalalayam West, Thiruvarur, Tamil Nadu 610001`
- [ ] **File Permissions & Storage Security:**
  - `chmod 700 /var/www/optii/data/prescriptions` (Private medical upload directory)
  - `chmod 750 /var/www/optii/data`
  - `chown -R optii:optii /var/www/optii`

---

## 2. Infrastructure & Server Provisioning Checklist

- [ ] **Provision Compute:** 2 vCPU, 2GB–4GB RAM, NVMe storage on AWS EC2, DigitalOcean, or Hetzner.
- [ ] **Install Runtime Dependencies:**
  - Node.js 20 LTS (`node -v` $\ge$ 20.10.0).
  - Nginx (`nginx -v` $\ge$ 1.18.0).
  - PM2 globally (`npm install -g pm2`).
  - Certbot (`apt install certbot python3-certbot-nginx`).
- [ ] **Firewall Hardening (UFW):**
  - Allow SSH (Port 22).
  - Allow HTTP (Port 80) and HTTPS (Port 443).
  - Block internal port 5050 from external access (accessible only via `127.0.0.1` reverse proxy).

---

## 3. Database Initialization & Migration Checklist

- [ ] **Apply Migrations to Production Database:**
  ```bash
  NODE_ENV=production node server/db/migrate.js
  ```
  Verify all 5 SQL migrations apply cleanly (`001_initial_schema.sql` through `005_performance_indexes.sql`).
- [ ] **Seed Base Production Taxonomy:**
  ```bash
  NODE_ENV=production node server/db/seed.js
  ```
  Populates master brands, frame shapes with SVG line art, 4-step optical lens tiers, and clinic operating hours.
- [ ] **Verify SQLite Production PRAGMAs:**
  - `PRAGMA foreign_keys = ON;`
  - `PRAGMA journal_mode = WAL;`
  - `PRAGMA busy_timeout = 5000;`
  - `PRAGMA synchronous = NORMAL;`
- [ ] **Immediate Staff Password Rotation:**
  - Log in to `/admin` using default seed credentials (`admin` / `optii123`).
  - Navigate to **Staff & Security**.
  - Update admin, optometrist, and staff passwords to unique 16+ character passphrases.

---

## 4. Payment Gateway Integration Requirements

Before opening the storefront to public customer orders, live payment processing must be enabled:

- [ ] **Merchant Account Onboarding:**
  - Complete business KYC on Razorpay or Cashfree.
  - Activate domestic UPI, RuPay, Credit/Debit Cards, and Net Banking rails.
- [ ] **API Keys & Webhook Secret:**
  - Obtain `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`.
  - Add to `/var/www/optii/.env`.
- [ ] **Implement Webhook Endpoint (`/api/payments/webhook`):**
  - Verify HMAC-SHA256 signature on incoming payment events (`payment.captured`, `order.paid`).
  - Transition order `payment_status` from `pending` to `paid` upon verified signature.
  - Automatically log webhook transaction reference in `audit_logs`.
- [ ] **Refund Handling:**
  - Enable administrative refund initiation via Razorpay API from `/admin` order cancellation workflow.

---

## 5. Nginx Reverse Proxy & SSL Checklist

- [ ] **Deploy Nginx Site Configuration (`/etc/nginx/sites-available/optii.conf`):**
  - HTTP $\rightarrow$ HTTPS permanent redirect (301).
  - TLS 1.3 / TLS 1.2 with secure cipher suites.
  - Enable Gzip / Brotli compression for text, CSS, JS, and JSON.
  - Static caching (`Cache-Control: public, max-age=2592000`) for images, fonts, and stylesheets.
  - Rate-limit zone (`limit_req_zone $binary_remote_addr zone=optii_api_limit:10m rate=10r/s`).
  - Max upload size set to `client_max_body_size 12M;`.
- [ ] **Generate SSL Certificate via Let's Encrypt:**
  ```bash
  sudo certbot --nginx -d optii.in -d www.optii.in
  ```
  Verify automated renewal timer: `sudo systemctl status certbot.timer`.

---

## 6. Process Management & Auto-Boot Checklist

- [ ] **Deploy PM2 Ecosystem Config ([ecosystem.config.js](file:///c:/Users/shafe/Desktop/Projects/optii/ecosystem.config.js)):**
  - Set `instances: 1` (single instance required for SQLite WAL serialized transactions and in-memory rate limiting).
  - Set `max_memory_restart: '1G'`.
  - Start process: `pm2 start ecosystem.config.js --env production`.
  - Save process list: `pm2 save`.
  - Configure systemd startup: `sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u optii --hp /var/www`.

---

## 7. Automated Backup & Disaster Recovery Checklist

- [ ] **Configure Crontab for Automated Hourly Backups:**
  ```cron
  # /etc/cron.d/optii-backup
  0 * * * * optii cd /var/www/optii && /usr/bin/node scripts/backup_db.js >> /var/log/optii/backup.log 2>&1
  ```
- [ ] **Configure Off-Site Cloud Storage Sync (AWS S3 / Cloudflare R2):**
  ```cron
  0 3 * * * optii aws s3 sync /var/www/optii/data/backups s3://optii-production-backups/sqlite/ >> /var/log/optii/s3-sync.log 2>&1
  ```
- [ ] **Test Drill Verification:**
  - Execute `node scripts/drill_disaster_recovery.js` to ensure the live environment reproduces the verified $< 2.5\text{s}$ RTO.

---

## 8. Launch Day Post-Deployment Smoke Test (Live Verification)

Execute within 15 minutes of DNS propagation:

- [ ] **Health Check:** `curl -f https://optii.in/api/health` returns HTTP 200 with `status: "ok"`.
- [ ] **Security Headers:** Inspect response headers for `Content-Security-Policy`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`.
- [ ] **Storefront Visual Smoke Test:** Verify hero banner, silhouette pill filters, and product cards load with sharp rectangular imagery.
- [ ] **PDP & Configurator:** Open `/product/henry-round-acetate`, verify millimeter specs (`51-20-150 mm`), step through 4-step lens configurator.
- [ ] **End-to-End Live Test Purchase:** Place a real ₹1 test order with staff credit card / UPI to verify payment gateway webhook and stock decrement.
- [ ] **WhatsApp Routing:** Click WhatsApp inquiry button; verify chat opens with prefilled encoded message.
- [ ] **Appointment Scheduling:** Book a test eye exam slot at Thiruvarur branch; confirm appointment appears in `/admin` queue.
- [ ] **Order Fulfillment Transition:** Move test order to `lab_glazing`, assign Blue Dart tracking code, verify public tracking view at `/track`.
- [ ] **Cancel & Restock:** Cancel test order, verify automated refund in payment gateway, verify stock increments back to original count.

---

## 9. Rollback & Incident Response Plan

If catastrophic errors occur during go-live (e.g. database corruption, critical payment failure, unresolvable 500 errors):

1. **Activate Maintenance Splash:**
   ```bash
   sudo cp /var/www/optii/public/maintenance.html /var/www/html/index.html
   sudo systemctl reload nginx
   ```
2. **Execute Hot Database Restore:**
   ```bash
   node scripts/restore_db.js data/backups/latest_backup.db data/optii_prod.db
   ```
3. **Roll Back Application Code:**
   ```bash
   git checkout HEAD@{1}
   pm2 reload optii-server
   ```
4. **Verify Health & Resume Traffic:**
   ```bash
   curl -f http://localhost:5050/api/health
   sudo rm /var/www/html/index.html
   sudo systemctl reload nginx
   ```
