'use strict';

const { pool } = require('../db');

async function requireAdmin(req, res, next) {
  try {
    let user;
    try {
      const { rows } = await pool.query(
        `SELECT is_admin, is_super_admin FROM users WHERE id = $1::uuid LIMIT 1`,
        [req.userId],
      );
      user = rows[0];
    } catch (dbErr) {
      // Backward compatibility for older schemas without is_super_admin.
      if (dbErr && dbErr.code === '42703') {
        const { rows } = await pool.query(`SELECT is_admin FROM users WHERE id = $1::uuid LIMIT 1`, [req.userId]);
        user = rows[0] ? { ...rows[0], is_super_admin: rows[0].is_admin } : null;
      } else {
        throw dbErr;
      }
    }
    if (!user || !user.is_admin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    req.isSuperAdmin = Boolean(user.is_super_admin);
    return next();
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to verify admin access' });
  }
}

module.exports = { requireAdmin };
