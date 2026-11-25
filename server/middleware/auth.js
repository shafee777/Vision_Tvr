const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../db/database');

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') 
    ? authHeader.substring(7) 
    : req.query.token;

  if (!token) {
    return res.status(401).json({ success: false, message: 'Authentication required. No token provided.' });
  }

  jwt.verify(token, config.JWT_SECRET, async (err, user) => {
    if (err) {
      return res.status(403).json({ success: false, message: 'Invalid or expired token.' });
    }

    try {
      const activeUser = await db.get('SELECT id, username, role, full_name FROM users WHERE id = ?', [user.id]);
      if (!activeUser) {
        return res.status(401).json({ success: false, message: 'User account has been revoked or removed.' });
      }
      req.user = activeUser;
      next();
    } catch (dbErr) {
      req.user = user;
      next();
    }
  });
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        success: false, 
        message: `Forbidden: requires one of the following roles: [${roles.join(', ')}]` 
      });
    }
    next();
  };
}

module.exports = {
  authenticateToken,
  requireRole
};
