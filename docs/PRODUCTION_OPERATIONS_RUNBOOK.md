# Optii Platform — Production Operations Runbook

**Document Version:** 1.0.0  
**Effective Date:** 2026-11-22  
**Target Platform:** Optii Greenfield Optical Retail Platform (`c:\Users\shafe\Desktop\Projects\optii`)  
**Target Host Operating System:** Ubuntu Linux 22.04 LTS (x86_64)  
**Process Topology:** PM2 Single-Instance Mode (`instances: 1`), Node.js v20+ LTS  
**Database Topology:** Embedded SQLite 3 (WAL Mode, `PRAGMA busy_timeout = 5000;`)  
**Web Server:** Nginx Reverse Proxy (`127.0.0.1:5050`) with Let's Encrypt TLS 1.3  

---

## 1. System Architecture & Topology

```
 Internet (HTTPS 443 / HTTP 80)
                │
                ▼
┌─────────────────────────────────────────────────────────────┐
│                 NGINX REVERSE PROXY                         │
│  - SSL Termination (Let's Encrypt TLS 1.3 / ECDHE)          │
│  - Security Headers (CSP, X-Frame-Options: DENY, HSTS)      │
│  - Static Asset Caching (public/images/, public/css/)       │
│  - Rate Limiting Zone: 10 req/s per client IP               │
│  - Max Upload Body Size: 12MB                               │
└──────────────────────────────┬──────────────────────────────┘
                               │ Proxy Pass: http://127.0.0.1:5050
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 PM2 PROCESS MANAGER                         │
│  - Process Name: optii-server (instances: 1)                │
│  - Max Memory Restart: 1024MB                               │
│  - Auto-Restart on Failure                                  │
│  - Graceful Shutdown Listeners (SIGINT / SIGTERM)           │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│              NODE.JS APPLICATION LAYER                      │
│  - REST API Routes (/api/products, /api/orders, /api/admin) │
│  - Zod Runtime Schema Validation                            │
│  - In-Memory Sliding-Window Rate Limiters                   │
│  - Magic-Byte Binary Upload Verification                    │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 PERSISTENT STORAGE LAYER                    │
│  - Database: data/optii.db (SQLite WAL Mode)                │
│  - Clinical Rx: data/prescriptions/ (chmod 700 Private)     │
│  - Hourly Snapshots: data/backups/ (AES-256-CBC Encrypted)  │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Standard Operating Procedures by Staff Role

The Optii Atelier portal (`/admin`) provides role-based access control (RBAC) across three distinct optical retail profiles. Staff members must execute daily workflows exclusively through web controls without CLI or raw database intervention.

### 2.1 Optical Retail Staff / Sales Concierge (`role: staff`)

| Frequency | Task | Operational Procedure |
|---|---|---|
| **Continuous** | **Order Processing & Picking** | 1. Navigate to **Orders** queue at `/admin`.<br/>2. Open new orders with status `placed`.<br/>3. Inspect frame silhouette, colourway, and optical prescription measurements.<br/>4. Pick physical frame from atelier shelf.<br/>5. Transition status to `processing` (marks frame reserved for optical glazing). |
| **Daily** | **Consignment Dispatch** | 1. Collect glazed eyewear from optical laboratory.<br/>2. Verify frame alignment, 4-step lens coatings, and optical centration.<br/>3. Pack inside custom Optii hardshell case and insured shipping box.<br/>4. Book courier with Blue Dart Express; copy consignment AWB.<br/>5. Open order modal, paste tracking code (e.g. `BLUEDART-OPT-482190`), advance status to `shipped`. |
| **As Needed** | **Physical Stock Adjustments** | 1. Navigate to **Inventory** at `/admin`.<br/>2. Locate target colourway variant.<br/>3. Click **Adjust Stock**.<br/>4. Enter delta quantity (e.g. `+10` new delivery, `-1` shop-floor display damage).<br/>5. **Mandatory:** Select movement reason (`restock_delivery`, `damaged_writeoff`, `store_transfer`). Free-text notes are required. |

### 2.2 Store Manager / Atelier Administrator (`role: admin`)

| Frequency | Task | Operational Procedure |
|---|---|---|
| **Daily (Morning)** | **Operational Health Inspection** | 1. Log in to `/admin` dashboard.<br/>2. Review **Active Silhouettes**, **Low Stock Alert (≤5)**, and **Depleted Stock** cards.<br/>3. Review **Net Real Revenue (Live)** vs **Sandbox Test Volume**.<br/>4. Verify zero unhandled WhatsApp pre-order inquiries. |
| **Weekly** | **Taxonomy & Silhouettes** | 1. Under **Products**, add new master frame silhouettes.<br/>2. Attach colorway variants with hexagonal color codes (`#HEX`).<br/>3. Upload verified studio imagery (`studio_front`, `angle_45`).<br/>4. Manage brand directory and frame shapes with SVG line art. |
| **As Needed** | **Staff Access Management** | 1. Under **Staff & Security**, manage authorized accounts.<br/>2. Provision new accounts with strict least-privilege roles (`optometrist`, `staff`).<br/>3. Enforce immediate deactivation or password resets upon staff departure. |
| **As Needed** | **Financial Refunds** | 1. Open customer order modal.<br/>2. Click **Issue Full Refund**.<br/>3. Confirm refund total; system transitions status to `refunded`, restocks inventory, and writes immutable audit log. |

### 2.3 Optometrist / Clinical Practitioner (`role: optometrist`)

| Frequency | Task | Operational Procedure |
|---|---|---|
| **Daily (Continuous)** | **Consultation Queue** | 1. Access **Eye Tests** queue at `/admin`.<br/>2. Review today's appointment appointments.<br/>3. Click **Confirm** on pending customer bookings.<br/>4. If scheduling conflict arises, click **Reschedule** and pick alternative 30-min available slot. |
| **Post-Exam** | **Prescription Record** | 1. Complete clinical refraction exam in consultation room.<br/>2. Upload patient prescription slip or record spherical, cylindrical, axis, and pupillary distance (PD) measurements.<br/>3. Mark consultation status as `completed`. |
| **Monthly** | **Lens Configurator Pricing** | 1. Access **Lens Configurator** tab.<br/>2. Adjust pricing for optical lens usage tiers (Single Vision, Blue Light, Progressive), index thickness options, and anti-reflective/scratch coatings.<br/>3. Updates apply immediately to storefront 4-step lens configurator. |

---

## 3. Server Maintenance & Process Management

### 3.1 PM2 Process Operations
The application runs as a managed PM2 daemon using the single-instance configuration defined in [ecosystem.config.js](file:///c:/Users/shafe/Desktop/Projects/optii/ecosystem.config.js):

```bash
# Check service health and uptime
pm2 status optii-server

# View live streaming application logs
pm2 logs optii-server --lines 100

# Perform zero-downtime reload
pm2 reload optii-server

# Hard restart process
pm2 restart optii-server

# Save active process list across server reboots
pm2 save
```

### 3.2 Nginx Web Server Operations
```bash
# Test Nginx configuration syntax
sudo nginx -t

# Reload configuration without dropping live connections
sudo systemctl reload nginx

# Inspect Nginx access and error logs
sudo tail -f /var/log/nginx/optii_access.log
sudo tail -f /var/log/nginx/optii_error.log
```

### 3.3 SSL Certificate Maintenance (Let's Encrypt)
Certificates are automatically managed via Certbot systemd timers:
```bash
# Check renewal timer status
sudo systemctl status certbot.timer

# Perform dry-run certificate renewal drill
sudo certbot renew --dry-run
```

---

## 4. Log Management & Log Rotation

To prevent unmonitored disk filling on production servers:

### 4.1 PM2 Log Rotation Module
Install `pm2-logrotate` globally:
```bash
pm2 install pm2-logrotate

# Configure rotation policies
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 14
pm2 set pm2-logrotate:compress true
```

### 4.2 System Logrotate Configuration
Deploy `/etc/logrotate.d/optii`:
```
/var/log/optii/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 optii optii
    sharedscripts
    postrotate
        pm2 reloadLogs
    endscript
}
```

---

## 5. Automated Encrypted Backup Schedule & Off-Site Sync

The platform uses native SQLite `VACUUM INTO` combined with AES-256-CBC encryption ([scripts/backup_encrypted.js](file:///c:/Users/shafe/Desktop/Projects/optii/scripts/backup_encrypted.js)) to achieve zero read/write downtime during snapshots.

### 5.1 Backup Schedule (Crontab)
Configure the `optii` service user crontab (`crontab -e`):

```cron
# 1. Generate hot AES-256-CBC encrypted SQLite snapshot every hour
0 * * * * cd /var/www/optii && /usr/bin/node scripts/backup_encrypted.js >> /var/log/optii/backup.log 2>&1

# 2. Daily off-site cloud replication (Cloudflare R2 / AWS S3) at 03:00 AM UTC
0 3 * * * cd /var/www/optii && aws s3 sync data/backups/ s3://optii-production-backups/snapshots/ --exclude "*.db" --include "*.enc" --include "*.json" >> /var/log/optii/s3-sync.log 2>&1

# 3. Daily sync of private prescription medical uploads at 03:30 AM UTC
30 3 * * * cd /var/www/optii && aws s3 sync data/prescriptions/ s3://optii-production-backups/prescriptions/ >> /var/log/optii/s3-rx.log 2>&1

# 4. Prune local unencrypted scratch snapshots older than 48 hours at 04:00 AM UTC
0 4 * * * find /var/www/optii/data/backups/ -name "optii_backup_*.db" -type f -mtime +2 -delete
```

### 5.2 Automated Backup Failure Alerting
If disk capacity exhaustion or file lock prevents snapshot generation:
1. `scripts/backup_encrypted.js` catches the fatal error.
2. Writes an alert payload to `data/backups/backup_failure_alert.json`.
3. An external monitor (DataDog / Prometheus / Uptime Kuma) checks for the existence of this file via HTTP health check:
   `GET /api/health` reports critical warning if alert file exists.

---

## 6. Disaster Recovery Runbook (RTO $< 2.5\text{s}$, RPO $< 1\text{h}$)

If the primary database file is corrupted or host hardware fails, execute this exact recovery sequence:

### Step 1: Identify Latest Valid Encrypted Snapshot
Inspect cloud storage or local backup directory:
```bash
ls -lt /var/www/optii/data/backups/optii_backup_*.json | head -n 1
```

### Step 2: Decrypt Snapshot to Staging Destination
Using the platform's recovery utility:
```bash
node -e "
const { decryptBackupFile } = require('./scripts/backup_encrypted');
decryptBackupFile(
  'data/backups/optii_backup_LATEST.db.enc',
  'data/optii_recovered.db',
  process.env.BACKUP_ENCRYPTION_KEY
);
console.log('Decryption complete.');
"
```

### Step 3: Validate Restored Database Structural Integrity
```bash
sqlite3 data/optii_recovered.db "PRAGMA integrity_check;"
# Must output: ok

sqlite3 data/optii_recovered.db "PRAGMA foreign_key_check;"
# Must output empty (0 violations)

sqlite3 data/optii_recovered.db "SELECT count(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';"
# Must output: 22 tables
```

### Step 4: Swap Recovered Database & Restart Application
```bash
# Stop application process
pm2 stop optii-server

# Move corrupted file aside
mv data/optii.db data/optii.db.corrupted.$(date +%s)

# Promote recovered file
mv data/optii_recovered.db data/optii.db

# Ensure correct permissions
chmod 660 data/optii.db
chown optii:optii data/optii.db

# Restart server daemon
pm2 start optii-server

# Verify health endpoint
curl -s http://127.0.0.1:5050/api/health | jq .
# Expected: status: "ok", tables_active: 22
```

---

## 7. Incident Management & Emergency Procedures

### Scenario A: High Memory Usage / Node.js Heap Exhaustion
- **Threshold:** Process memory exceeds 900MB.
- **Automated Mitigation:** PM2 automatically restarts process when memory reaches 1024MB (`max_memory_restart: '1G'`).
- **Manual Action:**
  ```bash
  pm2 reload optii-server
  ```

### Scenario B: Database Busy / Lock Contention (`SQLITE_BUSY`)
- **Root Cause:** Excessive long-running transactions or concurrent multi-process writes.
- **Immediate Resolution:**
  1. Verify `PRAGMA busy_timeout = 5000;` is active.
  2. Ensure only a single PM2 instance is running (`pm2 list` shows `instances: 1`).
  3. Check for lingering uncommitted transaction locks:
     ```bash
     fuser data/optii.db
     ```

### Scenario C: Compromised Staff Credentials
- **Immediate Mitigation:**
  1. Log in to `/admin` as master administrator.
  2. Navigate to **Staff & Security**.
  3. Edit compromised account $\rightarrow$ Update password to temporary 32-character secret.
  4. If required, delete user row (`DELETE FROM users WHERE username = '...'`).
  5. The platform's active session validator (`server/middleware/auth.js:29`) checks user existence on every request; deleting the user revokes their active JWT sessions instantly.
