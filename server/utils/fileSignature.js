/**
 * ═════════════════════════════════════════════════════════════════════
 * OPTII OPTICAL PLATFORM — FILE SIGNATURE (MAGIC NUMBER) VERIFIER
 * Validates actual binary file headers to prevent executable spoofing
 * ═════════════════════════════════════════════════════════════════════
 */

const fs = require('fs');

/**
 * Validates that file on disk matches its declared MIME type using magic bytes
 * @param {string} filePath - Absolute path to uploaded file
 * @param {string} declaredMime - Declared MIME type from multipart header
 * @returns {boolean} True if binary header matches declared MIME type
 */
function verifyFileSignature(filePath, declaredMime) {
  if (!fs.existsSync(filePath)) return false;

  const buffer = Buffer.alloc(16);
  const fd = fs.openSync(filePath, 'r');
  fs.readSync(fd, buffer, 0, 16, 0);
  fs.closeSync(fd);

  switch (declaredMime) {
    case 'image/jpeg':
      // JPEG starts with FF D8 FF
      return buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;

    case 'image/png':
      // PNG starts with 89 50 4E 47 0D 0A 1A 0A
      return (
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4E &&
        buffer[3] === 0x47 &&
        buffer[4] === 0x0D &&
        buffer[5] === 0x0A &&
        buffer[6] === 0x1A &&
        buffer[7] === 0x0A
      );

    case 'application/pdf':
      // PDF starts with %PDF (25 50 44 46)
      return (
        buffer[0] === 0x25 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x44 &&
        buffer[3] === 0x46
      );

    case 'image/webp':
      // WebP starts with RIFF (52 49 46 46) and bytes 8-11 are WEBP (57 45 42 50)
      return (
        buffer[0] === 0x52 &&
        buffer[1] === 0x49 &&
        buffer[2] === 0x46 &&
        buffer[3] === 0x46 &&
        buffer[8] === 0x57 &&
        buffer[9] === 0x45 &&
        buffer[10] === 0x42 &&
        buffer[11] === 0x50
      );

    default:
      return false;
  }
}

module.exports = {
  verifyFileSignature
};
