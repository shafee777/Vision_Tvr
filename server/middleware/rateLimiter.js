/**
 * ═════════════════════════════════════════════════════════════════════
 * OPTII OPTICAL PLATFORM — IN-MEMORY SLIDING WINDOW RATE LIMITER
 * Protects critical endpoints from brute-force and Denial-of-Service attacks
 * ═════════════════════════════════════════════════════════════════════
 */

const config = require('../config');

// Store: Map<key, number[]> (timestamps in ms)
const requestLogs = new Map();

// Periodic cleanup of stale logs every 5 minutes to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamps] of requestLogs.entries()) {
    const fresh = timestamps.filter(t => now - t < 3600000);
    if (fresh.length === 0) {
      requestLogs.delete(key);
    } else {
      requestLogs.set(key, fresh);
    }
  }
}, 300000).unref();

/**
 * Create a rate limiter middleware
 * @param {Object} options
 * @param {number} options.windowMs - Sliding window duration in milliseconds
 * @param {number} options.max - Maximum number of allowed requests per window
 * @param {string} options.message - Error message when rate limit is exceeded
 * @param {string} [options.prefix='rl'] - Key prefix for tracking
 */
function createRateLimiter(options) {
  const {
    windowMs = 15 * 60 * 1000, // 15 minutes default
    max = 100,
    message = 'Too many requests. Please try again later.',
    prefix = 'rl'
  } = options;

  return function rateLimiterMiddleware(req, res, next) {
    // Allow bypass header strictly in automated test environments
    if (config.IS_TEST && req.headers['x-bypass-rate-limit'] === 'true') {
      return next();
    }

    const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
    const key = `${prefix}:${clientIp}`;
    const now = Date.now();
    const windowStart = now - windowMs;

    let timestamps = requestLogs.get(key) || [];
    // Keep only timestamps within current window
    timestamps = timestamps.filter(t => t > windowStart);

    if (timestamps.length >= max) {
      const oldest = timestamps[0];
      const resetTimeMs = Math.ceil((oldest + windowMs - now) / 1000);
      res.setHeader('Retry-After', resetTimeMs);
      res.setHeader('X-RateLimit-Limit', max);
      res.setHeader('X-RateLimit-Remaining', 0);
      res.setHeader('X-RateLimit-Reset', Math.ceil((oldest + windowMs) / 1000));

      return res.status(429).json({
        success: false,
        error_code: 'RATE_LIMIT_EXCEEDED',
        message,
        retry_after_seconds: resetTimeMs
      });
    }

    timestamps.push(now);
    requestLogs.set(key, timestamps);

    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - timestamps.length));

    next();
  };
}

module.exports = {
  createRateLimiter,
  loginLimiter: createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 10,
    prefix: 'auth_login',
    message: 'Too many consecutive login attempts. Your IP has been temporarily rate-limited for 15 minutes.'
  }),
  orderLimiter: createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 20,
    prefix: 'order_checkout',
    message: 'Order creation rate limit reached. Please wait before placing another order.'
  }),
  appointmentLimiter: createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 15,
    prefix: 'appt_booking',
    message: 'Appointment booking rate limit reached. Please wait a few minutes before submitting another booking.'
  }),
  prescriptionLimiter: createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 15,
    prefix: 'rx_upload',
    message: 'Prescription document upload limit reached. Please wait before uploading more files.'
  }),
  trackingLimiter: createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 60,
    prefix: 'order_track',
    message: 'Tracking query rate limit reached. Please wait a moment.'
  }),
  passwordLimiter: createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 5,
    prefix: 'pwd_change',
    message: 'Too many password update attempts. Please try again after 15 minutes.'
  })
};
