const multer = require('multer');
const path = require('path');
const fs = require('fs');
const config = require('../config');

// Ensure upload directory exists
if (config.UPLOADS_DIR && !fs.existsSync(config.UPLOADS_DIR)) {
  fs.mkdirSync(config.UPLOADS_DIR, { recursive: true });
}

// Multer memory storage (allows Jimp to optimize before writing to disk)
const imageStorage = multer.memoryStorage();

// File filter for images (JPEG, PNG, WebP only — matches imageProcessor.js)
const imageFileFilter = (req, file, cb) => {
  const allowed = /jpeg|jpg|png|webp/i;
  const ext = path.extname(file.originalname).toLowerCase();
  const mime = file.mimetype;

  if (allowed.test(ext) && allowed.test(mime)) {
    cb(null, true);
  } else {
    const err = new Error('Only JPEG, PNG, and WebP image files are allowed.');
    err.status = 400;
    cb(err);
  }
};

const uploadImages = multer({
  storage: imageStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB limit (matches UI & imageProcessor)
  fileFilter: imageFileFilter
});

// Disk storage for CSV uploads
const csvDiskStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, config.UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueName = 'import_' + Date.now() + '_' + file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, uniqueName);
  }
});

const uploadCSV = multer({
  storage: csvDiskStorage,
  limits: { fileSize: 15 * 1024 * 1024 }
});

module.exports = {
  uploadImages,
  uploadCSV
};
