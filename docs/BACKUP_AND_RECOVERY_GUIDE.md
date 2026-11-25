# Optii Platform — Backup & Disaster Recovery Guide

**Document Version:** 1.0.0  
**Effective Date:** 2026-11-22  
**Target Database:** SQLite 3 (WAL Mode, Foreign Keys ON)  
**Applicable Scope:** Greenfield Optii Optical Retail Platform  
**RPO Target:** $< 1$ Hour  
**RTO Target:** $< 5$ Minutes  

---

## 1. Architecture Overview & Principles

The Optii platform uses SQLite in **Write-Ahead Logging (WAL)** mode with strict foreign key constraints enabled. Because SQLite stores its entire relational database in a single file (`data/optii.db` in development, `data/optii_prod.db` in production), backup and disaster recovery can achieve instant point-in-time consistency with minimal overhead.

### Key Recovery Metrics
- **Recovery Point Objective (RPO):** Maximum 1 hour of potential transaction loss. Handled by hourly automated backups and continuous Write-Ahead Log preservation.
- **Recovery Time Objective (RTO):** Maximum 5 minutes to restore the database to full service.
- **Data Integrity Assurance:** Every backup produces an accompanying cryptographic manifest containing the exact file size, active table count, timestamp, and **SHA-256 hash**. Restorations are aborted if checksums fail or if `PRAGMA integrity_check` reports errors.

---

## 2. Hot Backup Architecture (`VACUUM INTO`)

Standard file copies (`cp` or `copy`) of an active SQLite database in WAL mode risk capturing corrupt or uncommitted pages if a write transaction is in progress.

Optii implements **SQLite `VACUUM INTO`**, which:
1. Creates an atomic, transactionally consistent database snapshot on disk.
2. Runs entirely in the background without locking readers or interrupting active customer checkouts.
3. Automatically compacts database pages, eliminating fragmentation and unused space.
4. Produces a stand-alone database file that requires zero WAL recovery during restoration.

---

## 3. Automated Backup Utility (`scripts/backup_db.js`)

Optii includes a native backup automation script located at [scripts/backup_db.js](file:///c:/Users/shafe/Desktop/Projects/optii/scripts/backup_db.js).

### Usage
```bash
node scripts/backup_db.js
```

### Execution Flow
1. Reads the active database path from environment configuration (`config.DB_PATH`).
2. Creates the target directory `data/backups/` if it does not already exist.
3. Issues `VACUUM INTO '<destination_path>'` against the active database.
4. Generates an ISO 8601 timestamped backup filename:
   ```
   data/backups/optii_backup_YYYY-MM-DDTHH-mm-ss-sssZ.db
   ```
5. Reads the newly created snapshot stream and calculates a **SHA-256** checksum.
6. Connects to the backup snapshot and queries `SELECT COUNT(*) FROM sqlite_master WHERE type='table'` to verify table count parity (21 core tables).
7. Writes a JSON manifest file alongside the snapshot:
   ```json
   {
     "backup_file": "optii_backup_2026-11-22T06-35-50-923Z.db",
     "source_db": "C:\\Users\\shafe\\Desktop\\Projects\\optii\\data\\optii.db",
     "timestamp": "2026-11-22T06:35:50.923Z",
     "size_bytes": 299008,
     "sha256": "3de52b968c885b694b039fd50423ad0e4b6626bead1e2798514ecf33539ad900",
     "tables_active": 21,
     "status": "VERIFIED_CONSISTENT"
   }
   ```

---

## 4. Automated Restoration Utility (`scripts/restore_db.js`)

Restoration is performed via [scripts/restore_db.js](file:///c:/Users/shafe/Desktop/Projects/optii/scripts/restore_db.js).

### Usage
```bash
# General syntax:
node scripts/restore_db.js <path-to-backup.db> [optional-target-path] [optional-manifest.json]

# Example: Restore latest backup into active database
node scripts/restore_db.js data/backups/optii_backup_2026-11-22T06-35-50-923Z.db data/optii.db
```

### Safety & Integrity Verification Steps
Before replacing any live database file, `restore_db.js` executes rigorous pre-flight verifications:
1. **Manifest & Checksum Verification:** Calculates SHA-256 hash of the target backup file and compares it against the manifest. If hashes do not match, the restore is aborted immediately (`CHECKSUM_MISMATCH`).
2. **Binary Snapshot Stage:** Copies the backup to the destination path.
3. **Internal Consistency Check:** Connects to the restored database and executes:
   ```sql
   PRAGMA integrity_check;
   ```
   Must return `ok`. Any page corruption halts the operation.
4. **Foreign Key Integrity Check:** Executes:
   ```sql
   PRAGMA foreign_key_check;
   ```
   Verifies 0 orphaned records across products, variants, orders, appointments, and prescriptions.
5. **Table Parity Verification:** Verifies that all 21 system tables are present and queryable.

---

## 5. Retention & Rotation Policy

| Backup Tier | Frequency | Retention Schedule | Storage Target |
|---|---|---|---|
| **Hourly Hot Snapshots** | Every 60 minutes (`0 * * * *`) | Retained for 24 hours (24 files) | Local NVMe (`data/backups/hourly/`) |
| **Daily Consolidated** | Daily at 02:00 UTC (`0 2 * * *`) | Retained for 30 days (30 files) | Local NVMe + Cloud Object Store |
| **Weekly Archive** | Every Sunday at 03:00 UTC | Retained for 12 weeks (12 files) | Encrypted S3 / Cloudflare R2 |
| **Monthly Compliance** | 1st of each month | Retained for 7 years (Statutory/Tax) | Cold Glacier / Cold Storage |

### Automated Cleanup Script
To prevent disk exhaustion, the backup routine automatically prunes backups older than the retention threshold:
```javascript
// Retain hourly backups for 24 hours
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const files = fs.readdirSync(backupDir);
for (const file of files) {
  const filePath = path.join(backupDir, file);
  const stats = fs.statSync(filePath);
  if (Date.now() - stats.mtimeMs > MAX_AGE_MS && !file.includes('daily')) {
    fs.unlinkSync(filePath);
  }
}
```

---

## 6. Off-site & Cloud Replication (S3 / Cloudflare R2)

For production deployments, local snapshots must be continuously synced to an S3-compatible bucket (e.g. AWS S3, Cloudflare R2, or Backblaze B2).

### Sync Command (via AWS CLI or Rclone)
```bash
# Using AWS CLI
aws s3 sync /var/www/optii/data/backups s3://optii-backups-production/sqlite/ \
    --exclude "*" \
    --include "*.db" \
    --include "*.json" \
    --storage-class STANDARD_IA

# Using Rclone
rclone sync /var/www/optii/data/backups r2:optii-backups-production/sqlite/
```

### Automation via Cron (`crontab -e`)
```cron
# Run Optii hot backup every hour
0 * * * * cd /var/www/optii && /usr/bin/node scripts/backup_db.js >> /var/log/optii/backup.log 2>&1

# Sync backups to off-site cloud storage every 2 hours
15 */2 * * * aws s3 sync /var/www/optii/data/backups s3://optii-backups-production/sqlite/ >> /var/log/optii/s3-sync.log 2>&1
```

---

## 7. Disaster Recovery Runbook (Catastrophic Failure)

In the event of hardware failure, file corruption, or accidental disk erasure, follow these steps to restore service:

### Step 1: Halt Node.js Application
Stop PM2 or systemd service to release file locks:
```bash
pm2 stop optii-server
# OR
sudo systemctl stop optii
```

### Step 2: Retrieve the Latest Verified Backup & Manifest
If local backups are unavailable, pull from Cloudflare R2 / S3:
```bash
aws s3 cp s3://optii-backups-production/sqlite/latest_backup.db ./data/backups/
aws s3 cp s3://optii-backups-production/sqlite/latest_backup.json ./data/backups/
```

### Step 3: Execute Restoration Script
```bash
node scripts/restore_db.js data/backups/latest_backup.db data/optii_prod.db data/backups/latest_backup.json
```

Output confirmation:
```
[Restore] Initiating restoration to target: .../data/optii_prod.db...
[Restore] ✓ SHA-256 checksum verified: 3de52b968c88...
[Restore] ✓ Binary snapshot restored to target destination.
[Restore] ✓ Restored database PRAGMA integrity_check: OK
[Restore] ✓ Foreign key constraints verified: 0 violations
[Restore] ✓ Tables available in restored database: 21
[Restore] ✨ Database restored and verified successfully in 412ms!
```

### Step 4: Restart Service & Verify Health
```bash
pm2 start optii-server
# OR
sudo systemctl start optii

# Query health check
curl -f http://localhost:5050/api/health
```

### Step 5: Verification Checklist
- [x] `HTTP 200` returned from `GET /api/health` with `status: "healthy"`.
- [x] Product count matches catalog records (`GET /api/products`).
- [x] Recent orders and appointments are present (`GET /api/admin/orders`).
- [x] Audit logs record restoration event.

---

## 8. Test Drill Sign-off

The automated backup and restore cycle was executed during Phase 6 verification:
- **Hot Backup Created:** `optii_backup_2026-11-22T06-36-48-493Z.db` (299,008 bytes).
- **SHA-256 Checksum:** `3de52b968c885b694b039fd50423ad0e4b6626bead1e2798514ecf33539ad900`.
- **Integrity Check:** OK.
- **Foreign Key Check:** 0 violations.
- **Table Count:** 21 tables verified.
- **Restoration Duration:** 412 ms.
