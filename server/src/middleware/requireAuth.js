'use strict';

const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const m = header.match(/^Bearer\s+(.+)$/i);
  if (!m) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }
  const token = m[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (!payload.sub) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    req.userId = payload.sub;
    return next();
  } catch {
    return res.status(401).json({ error: 'Access token expired or invalid' });
  }
}

module.exports = { requireAuth };
