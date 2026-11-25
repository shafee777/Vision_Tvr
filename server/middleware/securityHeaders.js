/**
 * ═════════════════════════════════════════════════════════════════════
 * OPTII OPTICAL PLATFORM — SECURITY HEADERS & DEFENSE-IN-DEPTH
 * Implements strict HTTP response headers against OWASP Top 10 vulnerabilities
 * ═════════════════════════════════════════════════════════════════════
 */

const config = require('../config');

function securityHeaders(req, res, next) {
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Prevent Clickjacking by disallowing framing
  res.setHeader('X-Frame-Options', 'DENY');

  // XSS protection filter in legacy browsers
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Referrer Policy: Send full referrer on same-origin, only origin on cross-origin
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Restrict sensitive browser hardware APIs
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');

  // Content Security Policy
  const cspDirectives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: https: blob:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ];
  res.setHeader('Content-Security-Policy', cspDirectives.join('; '));

  // Enforce HSTS in production environments
  if (config.IS_PRODUCTION && req.secure) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  // Hide server software identification header
  res.removeHeader('X-Powered-By');

  next();
}

module.exports = securityHeaders;
