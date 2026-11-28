/**
 * ═════════════════════════════════════════════════════════════════════
 * OPTII OPTICAL PLATFORM — SECURE IMAGE VALIDATION & JIMP OPTIMIZER
 * Validates MIME + magic bytes, strips metadata, resizes oversized
 * uploads safely, prevents path traversal, and cleans up failures.
 * ═════════════════════════════════════════════════════════════════════
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Jimp = require('jimp');
const { verifyFileSignature } = require('./fileSignature');
const config = require('../config');

const ALLOWED_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

function safeUnlink(filePath) {
  if (!filePath) return;
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (_) {}
}

/**
 * Safely resolve a relative public image path without leaving PUBLIC_DIR
 */
function resolveSafePublicPath(relUrl) {
  if (!relUrl || typeof relUrl !== 'string') return null;
  const normalized = relUrl.replace(/^\/+/, '').replace(/\\/g, '/');
  if (!normalized.startsWith('images/')) return null;
  const resolved = path.resolve(config.PUBLIC_DIR, normalized);
  const publicRoot = path.resolve(config.PUBLIC_DIR) + path.sep;
  if (!resolved.startsWith(publicRoot)) return null;
  return resolved;
}

/**
 * Validate and normalize an uploaded image file (from multer memoryStorage)
 * and write cleanly to public/images/<subdir>/<prefix>_<id>.<ext>
 */
async function processAndStorePublicImage(file, options = {}) {
  if (!file || !file.buffer || file.buffer.length === 0) {
    throw new Error('Uploaded image file is empty.');
  }
  if (!ALLOWED_IMAGE_MIME.has(file.mimetype)) {
    throw new Error('Unsupported file type. Only JPEG, PNG, and WebP images are allowed.');
  }

  const subdir = String(options.subdir || 'products').replace(/[^a-z0-9_-]/gi, '');
  const prefix = String(options.prefix || 'img').replace(/[^a-z0-9_-]/gi, '');
  const maxWidth = Number(options.maxWidth || 1400);

  const targetDir = path.resolve(config.PUBLIC_DIR, 'images', subdir);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const token = `${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
  const rawExt = file.mimetype === 'image/png' ? '.png' : (file.mimetype === 'image/webp' ? '.webp' : '.jpg');
  const tmpPath = path.join(targetDir, `.tmp_${prefix}_${token}${rawExt}`);

  try {
    fs.writeFileSync(tmpPath, file.buffer);
    if (!verifyFileSignature(tmpPath, file.mimetype)) {
      throw new Error(`Invalid binary file signature for '${file.originalname}'. Upload rejected.`);
    }

    // Re-encode JPEG/PNG through Jimp to strip EXIF metadata & cap resolution.
    // Note: Jimp v0.22 does not natively encode WebP; keep verified WebP intact if <= 5 MB.
    if (file.mimetype === 'image/webp') {
      const finalName = `${prefix}_${token}.webp`;
      const finalPath = path.join(targetDir, finalName);
      fs.renameSync(tmpPath, finalPath);
      return {
        imageUrl: `images/${subdir}/${finalName}`,
        diskPath: finalPath,
        filename: finalName
      };
    }

    const image = await Jimp.read(file.buffer);
    if (image.bitmap.width > maxWidth) {
      image.resize(maxWidth, Jimp.AUTO);
    }

    const outExt = file.mimetype === 'image/png' ? '.png' : '.jpg';
    const finalName = `${prefix}_${token}${outExt}`;
    const finalPath = path.join(targetDir, finalName);

    if (outExt === '.jpg') {
      image.quality(86);
    }
    await image.writeAsync(finalPath);
    safeUnlink(tmpPath);

    return {
      imageUrl: `images/${subdir}/${finalName}`,
      diskPath: finalPath,
      filename: finalName
    };
  } catch (err) {
    safeUnlink(tmpPath);
    throw err;
  }
}

module.exports = {
  ALLOWED_IMAGE_MIME,
  safeUnlink,
  resolveSafePublicPath,
  processAndStorePublicImage
};
