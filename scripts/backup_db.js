/**
 * ═════════════════════════════════════════════════════════════════════
 * OPTII OPTICAL PLATFORM — AUTOMATED DATABASE BACKUP UTILITY
 * Creates consistent, hot-safe snapshots with SHA-256 integrity hashing
 * ═════════════════════════════════════════════════════════════════════
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('../server/db/database');
const config = require('../server/config');

const BACKUP_DIR = path.resolve(__dirname, '../data/backups');

async function createBackup() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFilename = `optii_backup_${timestamp}.db`;
  const backupPath = path.join(BACKUP_DIR, backupFilename);
  const manifestPath = path.join(BACKUP_DIR, `optii_backup_${timestamp}.json`);

  console.log(`[Backup] Initiating hot backup from ${config.DB_PATH} to ${backupPath}...`);

  // Ensure initial Pragmas are fully settled before VACUUM
  await new Promise(r => setTimeout(r, 150));

  // Use SQLite VACUUM INTO for a transaction-consistent atomic copy
  const escapedPath = backupPath.replace(/\\/g, '/');
  await db.run(`VACUUM INTO '${escapedPath}'`);

  // Calculate SHA-256 Checksum of the backup file
  const fileBuffer = fs.readFileSync(backupPath);
  const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
  const stats = fs.statSync(backupPath);

  // Retrieve table summary for verification manifest
  const tables = await db.all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
  const tableCounts = {};
  for (const t of tables) {
    const countRes = await db.get(`SELECT COUNT(*) as c FROM ${t.name}`);
    tableCounts[t.name] = countRes.c;
  }

  const manifest = {
    backup_file: backupFilename,
    source_db: config.DB_PATH,
    timestamp: new Date().toISOString(),
    size_bytes: stats.size,
    sha256: hash,
    tables_active: tables.length,
    table_counts: tableCounts
  };

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  console.log(`[Backup] ✓ Hot backup created successfully:`);
  console.log(`  File:     ${backupFilename} (${stats.size} bytes)`);
  console.log(`  SHA-256:  ${hash}`);
  console.log(`  Tables:   ${tables.length} tables backed up`);
  console.log(`  Manifest: ${path.basename(manifestPath)}`);

  return { backupPath, manifestPath, manifest };
}

if (require.main === module) {
  createBackup()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('[Backup Error]:', err);
      process.exit(1);
    });
}

module.exports = { createBackup };
