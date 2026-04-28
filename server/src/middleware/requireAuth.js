'use strict';

const jwt = require('jsonwebtoken');
const { pool } = require('../db');

async function requireAuth(req, res, next) {
  const isDeviceTokenPath = req.method === 'POST' && String(req.path || '') === '/device-token';
  const header = req.headers.authorization || '';
  const m = header.match(/^Bearer\s+(.+)$/i);
  if (!m) {
    if (isDeviceTokenPath) {
      console.warn('device_token_auth_rejected', { reason: 'missing_or_invalid_auth_header' });
    }
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }
  const token = m[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (!payload.sub) {
      if (isDeviceTokenPath) {
        console.warn('device_token_auth_rejected', { reason: 'invalid_token_payload' });
      }
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
      if (isDeviceTokenPath) {
        console.warn('device_token_auth_rejected', { reason: 'user_not_found' });
      }
      return res.status(401).json({ error: 'User not found' });
    }
    if (user.is_banned) {
      if (isDeviceTokenPath) {
        console.warn('device_token_auth_rejected', { reason: 'user_banned', userId: user.id });
      }
      return res.status(403).json({ error: user.ban_reason || 'Account is blocked by admin' });
    }
    if (isDeviceTokenPath) {
      console.info('device_token_auth_ok', { userId: user.id });
    }
    req.userId = user.id;
    req.user = user;
    return next();
  } catch {
    if (isDeviceTokenPath) {
      console.warn('device_token_auth_rejected', { reason: 'jwt_verify_failed' });
    }
    return res.status(401).json({ error: 'Access token expired or invalid' });
  }
}

module.exports = { requireAuth };
