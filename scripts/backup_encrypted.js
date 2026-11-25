/**
 * ═════════════════════════════════════════════════════════════════════
 * OPTII OPTICAL PLATFORM — ENCRYPTED OFF-SITE BACKUP & ALERT TOOL
 * Generates AES-256-CBC encrypted database snapshots with SHA-256
 * integrity manifests and automated failure alert dispatching.
 * ═════════════════════════════════════════════════════════════════════
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createBackup } = require('./backup_db');
const config = require('../server/config');

const BACKUP_DIR = path.resolve(__dirname, '../data/backups');
const ALGORITHM = 'aes-256-cbc';

/**
 * Encrypt a buffer or file with AES-256-CBC
 */
function encryptBuffer(buffer, keyStr) {
  // Derive 32-byte key using sha256 of the encryption key string
  const key = crypto.createHash('sha256').update(keyStr).digest();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  // Prepend 16-byte IV to the encrypted ciphertext
  return Buffer.concat([iv, encrypted]);
}

/**
 * Decrypt an AES-256-CBC encrypted buffer
 */
function decryptBuffer(encryptedBuffer, keyStr) {
  const key = crypto.createHash('sha256').update(keyStr).digest();
  const iv = encryptedBuffer.subarray(0, 16);
  const ciphertext = encryptedBuffer.subarray(16);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/**
 * Create an encrypted backup snapshot
 */
async function createEncryptedBackup() {
  const encryptionKey = config.BACKUP_ENCRYPTION_KEY || 'optii_backup_aes_encryption_key_2026_secure';

  try {
    // 1. Create standard hot snapshot
    const { backupPath, manifestPath, manifest } = await createBackup();

    // 2. Read raw database snapshot
    const rawData = fs.readFileSync(backupPath);

    // 3. Encrypt snapshot with AES-256-CBC
    const encryptedData = encryptBuffer(rawData, encryptionKey);
    const encFilename = `${manifest.backup_file}.enc`;
    const encPath = path.join(BACKUP_DIR, encFilename);
    fs.writeFileSync(encPath, encryptedData);

    // 4. Compute SHA-256 of encrypted file
    const encSha256 = crypto.createHash('sha256').update(encryptedData).digest('hex');

    // 5. Update manifest with encryption metadata
    manifest.encryption = {
      algorithm: ALGORITHM,
      encrypted_file: encFilename,
      encrypted_size_bytes: encryptedData.length,
      encrypted_sha256: encSha256,
      ready_for_cloud_sync: true
    };
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    console.log(`[Backup Encrypted] ✓ Encrypted snapshot created:`);
    console.log(`  File:      ${encFilename} (${encryptedData.length} bytes)`);
    console.log(`  SHA-256:   ${encSha256}`);
    console.log(`  Algorithm: ${ALGORITHM}`);

    // Clean up failure alerts if active
    const alertPath = path.join(BACKUP_DIR, 'backup_failure_alert.json');
    if (fs.existsSync(alertPath)) {
      fs.unlinkSync(alertPath);
    }

    return {
      success: true,
      backupPath,
      encryptedPath: encPath,
      manifestPath,
      manifest
    };
  } catch (err) {
    // Failure handling and alert dispatching
    console.error('[Backup Fatal Error]:', err.message);

    const alertPayload = {
      alert: 'BACKUP_CRITICAL_FAILURE',
      timestamp: new Date().toISOString(),
      error_message: err.message,
      stack: err.stack,
      remediation: 'Inspect disk space (df -h), file permissions (chmod 750), and SQLite lock status.'
    };

    const alertPath = path.join(BACKUP_DIR, 'backup_failure_alert.json');
    try {
      if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
      fs.writeFileSync(alertPath, JSON.stringify(alertPayload, null, 2));
    } catch (_) {}

    throw err;
  }
}

/**
 * Decrypt an encrypted backup file to target destination
 */
function decryptBackupFile(encPath, outDbPath, keyStr) {
  const encData = fs.readFileSync(encPath);
  const decrypted = decryptBuffer(encData, keyStr || config.BACKUP_ENCRYPTION_KEY);
  fs.writeFileSync(outDbPath, decrypted);
  return outDbPath;
}

if (require.main === module) {
  createEncryptedBackup()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = {
  createEncryptedBackup,
  encryptBuffer,
  decryptBuffer,
  decryptBackupFile
};
