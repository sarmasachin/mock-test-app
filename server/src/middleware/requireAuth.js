'use strict';

const jwt = require('jsonwebtoken');
const { pool } = require('../db');

async function requireAuth(req, res, next) {
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
    let user;
    try {
      const { rows } = await pool.query(
        `SELECT id, is_banned, ban_reason FROM users WHERE id = $1::uuid LIMIT 1`,
        [payload.sub],
      );
      user = rows[0];
    } catch (dbErr) {
      // Backward compatibility for older schemas without ban columns.
      if (dbErr && dbErr.code === '42703') {
        const { rows } = await pool.query(`SELECT id FROM users WHERE id = $1::uuid LIMIT 1`, [payload.sub]);
        user = rows[0] ? { ...rows[0], is_banned: false, ban_reason: null } : null;
      } else {
        throw dbErr;
      }
    }
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    if (user.is_banned) {
      return res.status(403).json({ error: user.ban_reason || 'Account is blocked by admin' });
    }
    req.userId = user.id;
    req.user = user;
    return next();
  } catch {
    return res.status(401).json({ error: 'Access token expired or invalid' });
  }
}

module.exports = { requireAuth };
