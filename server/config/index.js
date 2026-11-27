const path = require('path');
require('dotenv').config();

const ROOT_DIR = path.resolve(__dirname, '../../');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');

const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PRODUCTION = NODE_ENV === 'production';
const IS_TEST = NODE_ENV === 'test';
const IS_DEVELOPMENT = NODE_ENV === 'development';

const DEV_FALLBACK_JWT_SECRET = 'optii_optical_jwt_secret_key_2026_super_secure';

// Environment-specific Database Path
let defaultDbFilename = 'optii.db';
if (IS_TEST) {
  defaultDbFilename = 'optii_test.db';
} else if (IS_PRODUCTION) {
  defaultDbFilename = 'optii_prod.db';
}

const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, defaultDbFilename);

// Validate Production Requirements at Startup
function validateProductionConfig() {
  if (IS_PRODUCTION) {
    const secret = process.env.JWT_SECRET;
    if (!secret || secret === DEV_FALLBACK_JWT_SECRET || secret.length < 32) {
      const err = new Error(
        'FATAL CONFIGURATION ERROR: In production mode, JWT_SECRET must be explicitly defined in environment variables and contain at least 32 characters. Development fallback secrets are strictly prohibited.'
      );
      err.code = 'CONFIG_VALIDATION_ERROR';
      throw err;
    }
  }
}

// Execute configuration validation
validateProductionConfig();

module.exports = {
  NODE_ENV,
  IS_PRODUCTION,
  IS_TEST,
  IS_DEVELOPMENT,
  PORT: parseInt(process.env.PORT, 10) || 5050,
  DB_PATH,
  JWT_SECRET: process.env.JWT_SECRET || DEV_FALLBACK_JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '24h',
  ROOT_DIR,
  DATA_DIR,
  PUBLIC_DIR,
  UPLOADS_DIR: path.join(PUBLIC_DIR, 'uploads'),
  PRESCRIPTIONS_DIR: path.join(DATA_DIR, 'prescriptions'),
  WHATSAPP_PHONE: process.env.WHATSAPP_PHONE || '+919486552324',
  STORE_NAME: process.env.STORE_NAME || 'Vision Opticals',
  CORS_ORIGINS: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',').map(s => s.trim()) : null,
  
  // Payment Gateway Configuration
  PAYMENT_MODE: process.env.PAYMENT_MODE || 'sandbox', // 'sandbox' | 'live'
  RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID || 'rzp_test_optii_sandbox_key',
  RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET || 'rzp_test_optii_sandbox_secret',
  RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET || 'rzp_whsec_optii_test_webhook_key_2026',
  CASHFREE_APP_ID: process.env.CASHFREE_APP_ID || 'cf_app_sandbox_optii',
  CASHFREE_SECRET_KEY: process.env.CASHFREE_SECRET_KEY || 'cf_sec_sandbox_optii_secret',
  CASHFREE_WEBHOOK_SECRET: process.env.CASHFREE_WEBHOOK_SECRET || 'cf_whsec_optii_test_webhook_key_2026',
  
  // Encrypted Backup Key
  BACKUP_ENCRYPTION_KEY: process.env.BACKUP_ENCRYPTION_KEY || 'optii_backup_aes_encryption_key_2026_secure',
  
  validateProductionConfig
};
