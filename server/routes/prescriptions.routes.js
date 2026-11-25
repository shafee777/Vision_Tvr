const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('../db/database');
const config = require('../config');
const { prescriptionLimiter } = require('../middleware/rateLimiter');
const { verifyFileSignature } = require('../utils/fileSignature');

// Dedicated secure prescription directory outside public web root
const PRESCRIPTIONS_DIR = path.resolve(__dirname, '../../data/prescriptions');
if (!fs.existsSync(PRESCRIPTIONS_DIR)) {
  fs.mkdirSync(PRESCRIPTIONS_DIR, { recursive: true });
}

// Allowed optical prescription MIME types
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf'
];

// 5MB maximum file size
const MAX_FILE_SIZE = 5 * 1024 * 1024;

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, PRESCRIPTIONS_DIR);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.pdf'].includes(ext) ? ext : '.bin';
    const randomName = `rx_${Date.now()}_${crypto.randomBytes(12).toString('hex')}${safeExt}`;
    cb(null, randomName);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: function (req, file, cb) {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      const err = new Error('INVALID_FILE_TYPE: Only JPG, PNG, WEBP, and PDF optical prescriptions are accepted.');
      err.code = 'INVALID_FILE_TYPE';
      return cb(err, false);
    }
    cb(null, true);
  }
});

// POST /api/prescriptions/upload - Secure prescription upload
router.post('/upload', prescriptionLimiter, (req, res) => {
  upload.single('prescription')(req, res, async function (err) {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          error: 'FILE_TOO_LARGE',
          message: 'Prescription document exceeds the maximum 5MB size limit.'
        });
      }
      return res.status(400).json({
        success: false,
        error: err.code || 'UPLOAD_FAILED',
        message: err.message || 'Prescription file upload failed.'
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'NO_FILE_PROVIDED',
        message: 'Please select an optical prescription image or PDF to upload.'
      });
    }

    // Verify binary magic bytes to prevent executable disguised as image/pdf
    if (!verifyFileSignature(req.file.path, req.file.mimetype)) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
      return res.status(400).json({
        success: false,
        error: 'INVALID_FILE_SIGNATURE',
        message: 'Security validation failed: File binary content does not match the declared MIME type.'
      });
    }

    try {
      const token = `rx_${crypto.randomUUID()}`;
      const originalName = path.basename(req.file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_');
      const storedPath = req.file.path;

      await db.run(
        `INSERT INTO prescriptions (token, original_filename, stored_filename, mime_type, file_size, storage_path)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [token, originalName, req.file.filename, req.file.mimetype, req.file.size, storedPath]
      );

      // Return secure token only (never internal disk path)
      res.status(201).json({
        success: true,
        prescription_token: token,
        original_filename: originalName,
        mime_type: req.file.mimetype,
        file_size: req.file.size,
        message: 'Prescription uploaded and secured successfully.'
      });
    } catch (dbErr) {
      console.error('Prescription DB Error:', dbErr);
      // Clean up orphaned file on DB error
      try { fs.unlinkSync(req.file.path); } catch (e) {}
      res.status(500).json({ success: false, message: 'Failed to record prescription metadata.' });
    }
  });
});

// GET /api/prescriptions/:token - Secure prescription retrieval (Authorized personnel or session bearer)
router.get('/:token', async (req, res) => {
  try {
    const { token } = req.params;

    // Authorization verification
    const authHeader = req.headers.authorization;
    let isAuthorized = false;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const jwtToken = authHeader.split(' ')[1];
        jwt.verify(jwtToken, config.JWT_SECRET);
        isAuthorized = true;
      } catch (jwtErr) {
        // Invalid staff token
      }
    }

    // Also allow access if the client presents the matching prescription token in header
    if (req.headers['x-prescription-token'] === token) {
      isAuthorized = true;
    }

    if (!isAuthorized) {
      return res.status(403).json({
        success: false,
        error: 'UNAUTHORIZED_ACCESS',
        message: 'Prescription medical records require verified authorization.'
      });
    }

    const record = await db.get('SELECT * FROM prescriptions WHERE token = ?', [token]);
    if (!record || !fs.existsSync(record.storage_path)) {
      return res.status(404).json({ success: false, message: 'Prescription record not found.' });
    }

    res.setHeader('Content-Type', record.mime_type);
    res.setHeader('Content-Disposition', `inline; filename="${record.original_filename}"`);
    res.sendFile(record.storage_path);
  } catch (err) {
    console.error('Prescription Retrieval Error:', err);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// DELETE /api/prescriptions/:token - Delete prescription (Secure GDPR/Retention handling)
router.delete('/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const record = await db.get('SELECT * FROM prescriptions WHERE token = ?', [token]);
    if (!record) {
      return res.status(404).json({ success: false, message: 'Prescription record not found.' });
    }

    if (fs.existsSync(record.storage_path)) {
      try { fs.unlinkSync(record.storage_path); } catch (e) {}
    }

    await db.run('DELETE FROM prescriptions WHERE token = ?', [token]);
    res.json({ success: true, message: 'Prescription document permanently removed.' });
  } catch (err) {
    console.error('Prescription Deletion Error:', err);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

module.exports = router;
