/**
 * ═════════════════════════════════════════════════════════════════════
 * OPTII OPTICAL PLATFORM — AUTOMATED DATABASE RESTORATION UTILITY
 * Restores backups into target environments with SHA-256 verification
 * ═════════════════════════════════════════════════════════════════════
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();

/**
 * Restores a backup file to a target destination and validates integrity
 * @param {string} backupFilePath - Path to source backup .db
 * @param {string} targetDbPath - Destination path for restored .db
 * @param {string} [manifestPath] - Path to metadata manifest JSON
 */
async function restoreDatabase(backupFilePath, targetDbPath, manifestPath) {
  console.log(`[Restore] Initiating restoration to target: ${targetDbPath}...`);

  if (!fs.existsSync(backupFilePath)) {
    throw new Error(`Backup file not found at: ${backupFilePath}`);
  }

  // 1. Verify SHA-256 Checksum if manifest exists
  if (manifestPath && fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const fileBuffer = fs.readFileSync(backupFilePath);
    const calculatedHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    if (calculatedHash !== manifest.sha256) {
      throw new Error(`INTEGRITY CHECKSUM MISMATCH! Manifest: ${manifest.sha256}, Actual: ${calculatedHash}`);
    }
    console.log(`[Restore] ✓ SHA-256 checksum verified: ${calculatedHash}`);
  }

  // 2. Ensure target directory exists and copy file
  const targetDir = path.dirname(targetDbPath);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  fs.copyFileSync(backupFilePath, targetDbPath);
  console.log(`[Restore] ✓ Binary snapshot restored to target destination.`);

  // 3. Connect to restored database and run full integrity checks
  const targetDb = new sqlite3.Database(targetDbPath);
  const runQuery = (sql) => new Promise((resolve, reject) => {
    targetDb.all(sql, (err, rows) => err ? reject(err) : resolve(rows));
  });

  try {
    const integrityResult = await runQuery('PRAGMA integrity_check;');
    const integrityOk = integrityResult[0]?.integrity_check === 'ok';

    if (!integrityOk) {
      throw new Error(`Restored database failed integrity check: ${JSON.stringify(integrityResult)}`);
    }
    console.log(`[Restore] ✓ Restored database PRAGMA integrity_check: OK`);

    const fkResult = await runQuery('PRAGMA foreign_key_check;');
    if (fkResult.length > 0) {
      throw new Error(`Restored database has foreign key violations: ${JSON.stringify(fkResult)}`);
    }
    console.log(`[Restore] ✓ Foreign key constraints verified: 0 violations`);

    const tables = await runQuery("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
    console.log(`[Restore] ✓ Tables available in restored database: ${tables.length}`);

    targetDb.close();
    return { success: true, targetDbPath, tables_restored: tables.length, checksum_verified: !!manifestPath };
  } catch (err) {
    targetDb.close();
    throw err;
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const backupFile = args[0];
  const targetDb = args[1] || path.resolve(__dirname, '../data/optii_restored_test.db');
  const manifest = args[2] || (backupFile ? backupFile.replace(/\.db$/, '.json') : null);

  if (!backupFile) {
    // If no argument, find most recent backup in data/backups
    const backupDir = path.resolve(__dirname, '../data/backups');
    const files = fs.readdirSync(backupDir).filter(f => f.startsWith('optii_backup_') && f.endsWith('.db')).sort().reverse();
    if (files.length === 0) {
      console.error('No backup files found in data/backups');
      process.exit(1);
    }
    const latestBackup = path.join(backupDir, files[0]);
    const latestManifest = latestBackup.replace(/\.db$/, '.json');
    restoreDatabase(latestBackup, targetDb, latestManifest)
      .then(() => process.exit(0))
      .catch(err => {
        console.error('[Restore Error]:', err);
        process.exit(1);
      });
  } else {
    restoreDatabase(backupFile, targetDb, manifest)
      .then(() => process.exit(0))
      .catch(err => {
        console.error('[Restore Error]:', err);
        process.exit(1);
      });
  }
}

module.exports = { restoreDatabase };
