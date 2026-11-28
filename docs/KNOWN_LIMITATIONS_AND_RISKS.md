# Optii Platform — Known Architectural Limitations, Trade-Offs & Risk Register

**Document Version:** 1.0.0  
**Effective Date:** 2026-11-22  
**Target Platform:** Optii Greenfield Optical Retail E-Commerce Platform  
**Scope:** Architectural boundaries, capacity ceilings, technology trade-offs, and operational risk mitigation  

---

## 1. Architectural Trade-Offs & Boundaries

### 1.1 Single-File Relational Storage (SQLite WAL Mode)
- **Design Decision:** The Optii platform utilizes an embedded SQLite 3 database operating in Write-Ahead Logging (WAL) mode with foreign key constraints enforced on connection.
- **Advantages:**
  - Zero external database daemon overhead or maintenance.
  - Microsecond read query latency on local NVMe disk.
  - Atomic hot backups via native `VACUUM INTO` without interrupting reads or writes.
  - Complete portability during recovery drills ($< 500\text{ ms}$ restoration).
- **Known Boundaries:**
  - SQLite supports multiple concurrent readers simultaneously, but restricts write operations to **one writer at a time** via file-level locking.
  - While `PRAGMA busy_timeout = 5000;` prevents immediate busy crashes by queueing concurrent writers, sustained write volume exceeding ~800 to 1,200 writes per second will introduce connection queue delays.
- **Operational Reality:**
  - For a boutique luxury optical retail brand processing hundreds to thousands of customized eyewear orders and appointments per day, SQLite's write capacity is orders of magnitude above required load.
- **Migration Trigger:**
  - If the business expands into a national high-frequency marketplace requiring multiple geographically distributed server nodes, the database layer should be migrated to PostgreSQL using an ORM or pg client, preserving the existing REST API contracts.

---

### 1.2 Single-Instance Node.js Deployment vs Multi-Process Clustering
- **Design Decision:** PM2 is configured to run a single Node.js server instance (`instances: 1` in [ecosystem.config.js](file:///c:/Users/shafe/Desktop/Projects/optii/ecosystem.config.js)).
- **Rationale:**
  - **In-Memory Rate Limiting:** The sliding-window rate limiters ([server/middleware/rateLimiter.js](file:///c:/Users/shafe/Desktop/Projects/optii/server/middleware/rateLimiter.js)) maintain request timestamp maps in Node.js process memory. In a multi-process cluster without Redis, rate limit counters would be fragmented across processes, diluting protection against brute-force attacks.
  - **Lock Serializer:** The in-memory transaction queue (`db.transaction`) serializes write operations before they hit the SQLite file lock, eliminating lock contention within the process.
- **Capacity Ceiling:**
  - A single modern Node.js process on a 2 vCPU server handles 2,500+ lightweight HTTP requests per second. With Nginx serving static assets and caching images, the single-instance topology comfortably sustains 50,000+ daily active storefront shoppers.
- **Horizontal Scaling Path:**
  - If multi-instance clustering becomes necessary, replace in-memory rate limiting with Redis-backed `rate-limiter-flexible` and implement an external lock manager.

---

### 1.3 In-Memory Session & Rate Limit State
- **Limitation:** Sliding-window rate limit counters are held in server RAM and reset upon process restarts.
- **Risk:** An attacker could theoretically reset their rate limit budget if the server reboots during a burst.
- **Mitigation:**
  - JWT tokens are stateless and cryptographically signed; user revocation is validated against the active database `users` table on every request.
  - Nginx reverse proxy configuration ([docs/DEPLOYMENT_GUIDE.md](file:///c:/Users/shafe/Desktop/Projects/optii/docs/DEPLOYMENT_GUIDE.md)) implements a secondary IP-based connection and request rate limit (`limit_req_zone $binary_remote_addr zone=optii_api_limit:10m rate=10r/s`), protecting the application layer even during restarts.

---

### 1.4 Local Prescription Storage vs Cloud Object Store
- **Limitation:** Prescription files and product images are stored on the server's local filesystem (`data/prescriptions/` and `public/images/products/`).
- **Risk:** Local storage is bound to server disk volume size and requires regular monitoring.
- **Mitigation:**
  - Prescriptions are isolated with `chmod 700` outside the webroot.
  - [docs/BACKUP_AND_RECOVERY_GUIDE.md](file:///c:/Users/shafe/Desktop/Projects/optii/docs/BACKUP_AND_RECOVERY_GUIDE.md) documents automated daily replication of `data/prescriptions` and database backups to Cloudflare R2 / AWS S3 via cron.

---

## 2. Operational Risk Register

| Risk ID | Category | Risk Description | Severity | Probability | Existing Mitigation | Residual Risk |
|---|---|---|---|---|---|---|
| **RSK-001** | Commercial | Premature Public Orders in Sandbox Mode | **HIGH** | Medium | Checkouts clearly labeled with `is_simulated_payment: true`; live payment gateway onboarding required before DNS launch. | **LOW** |
| **RSK-002** | Operations | Staff Default Password Exposure | **HIGH** | Low | Documented mandatory password rotation in Go-Live runbook; role-based permissions prevent unauthorized actions. | **LOW** |
| **RSK-003** | Infrastructure | Unmonitored Disk Fill from Backups & Uploads | **MEDIUM** | Medium | Automated 24-hour backup rotation script prunes stale local snapshots; upload size capped at 5MB by Multer (`admin.routes.js` & `prescriptions.routes.js`) and 2MB JSON payload limit in Express. | **LOW** |
| **RSK-004** | Medical Privacy | Accidental Prescription Leakage in Order Tracking | **HIGH** | Low | SQL projection in `orders.routes.js` explicitly strips internal file paths and medical tokens from public queries. | **ZERO** |
| **RSK-005** | Inventory | Overlapping Concurrent Checkout Race Condition | **MEDIUM** | Low | `db.transaction()` queue with `BEGIN IMMEDIATE` exclusive locking re-checks stock inside write lock, rejecting competing orders with 400. | **ZERO** |
| **RSK-006** | Appointments | Double-Booking of In-Store Optometry Slots | **MEDIUM** | Low | Unique constraint on `(appointment_date, start_time)` and server-side collision validation rejects concurrent bookings with HTTP 409. | **ZERO** |

---

## 3. Recommended Future Roadmap Enhancements (Post-Launch Phase)

1. **Integrated Payment Gateway:** Implement Razorpay / Cashfree webhook listeners with HMAC-SHA256 signature verification and automated refund webhooks.
2. **Automated SMS & Email Notifications:** Connect MSG91 / Twilio for automated SMS dispatch alerts and SendGrid for order receipts and appointment calendar invites.
3. **Optometrist Clinical EHR Integration:** Expand prescription management with digital visual acuity charts, keratometry readings, and lensometry records.
4. **Virtual 3D Try-On:** Integrate WebGL / WebAssembly facial landmark tracking for real-time virtual frame try-on on the product detail page.
