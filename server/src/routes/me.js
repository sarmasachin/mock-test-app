'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const { mapUserRow } = require('../userMapper');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM users WHERE id = $1::uuid LIMIT 1`, [req.userId]);
    const row = rows[0];
    if (!row) return res.status(404).json({ error: 'User not found' });
    return res.json({ user: mapUserRow(row) });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to load profile' });
  }
});

router.delete('/', async (req, res) => {
  try {
    const r = await pool.query(`DELETE FROM users WHERE id = $1::uuid`, [req.userId]);
    if (r.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    return res.status(204).send();
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to delete account' });
  }
});

router.patch('/profile', async (req, res) => {
  const { displayName, email, phone, state, district } = req.body || {};
  if (
    displayName === undefined &&
    email === undefined &&
    phone === undefined &&
    state === undefined &&
    district === undefined
  ) {
    return res.status(400).json({ error: 'No updatable fields provided' });
  }
  try {
    const curQ = await pool.query(`SELECT * FROM users WHERE id = $1::uuid`, [req.userId]);
    const cur = curQ.rows[0];
    if (!cur) return res.status(404).json({ error: 'User not found' });

    let nextName = cur.display_name;
    if (displayName !== undefined) {
      if (displayName === null) {
        return res.status(400).json({ error: 'displayName cannot be null' });
      }
      const n = String(displayName).trim();
      if (!n) return res.status(400).json({ error: 'displayName cannot be empty' });
      nextName = n;
    }

    let nextEmail = cur.email;
    if (email !== undefined) {
      if (email === null) {
        return res.status(400).json({ error: 'email cannot be null' });
      }
      const emTrim = String(email).trim().toLowerCase();
      if (!emTrim || !emTrim.includes('@')) {
        return res.status(400).json({ error: 'Invalid email' });
      }
      const curNorm = String(cur.email || '').trim().toLowerCase();
      if (cur.email_verified_at && emTrim !== curNorm) {
        return res.status(403).json({ error: 'Email cannot be changed after verification' });
      }
      nextEmail = emTrim;
    }

    let nextPhone = String(cur.phone || '').replace(/\D/g, '').slice(0, 10);
    if (phone !== undefined) {
      if (phone === null) {
        return res.status(400).json({ error: 'phone cannot be null' });
      }
      const ph = String(phone).replace(/\D/g, '').slice(0, 10);
      if (ph.length !== 10) {
        return res.status(400).json({ error: 'phone must be 10 digits' });
      }
      nextPhone = ph;
    }

    let nextState = String(cur.signup_state || '');
    if (state !== undefined && state !== null) {
      nextState = String(state).trim().slice(0, 120);
    }

    let nextDistrict = String(cur.signup_district || '');
    if (district !== undefined && district !== null) {
      nextDistrict = String(district).trim().slice(0, 120);
    }

    const upd = await pool.query(
      `UPDATE users SET display_name = $1, email = $2, phone = $3, signup_state = $4, signup_district = $5, updated_at = now()
       WHERE id = $6::uuid RETURNING *`,
      [nextName, nextEmail, nextPhone, nextState, nextDistrict, req.userId],
    );
    return res.json({ user: mapUserRow(upd.rows[0]) });
  } catch (e) {
    if (e.code === '23505') {
      return res.status(409).json({ error: 'Email or phone already in use' });
    }
    console.error(e);
    return res.status(500).json({ error: 'Profile update failed' });
  }
});

router.patch('/password', async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const curPw = String(currentPassword || '');
  const nextPw = String(newPassword || '');
  if (!curPw || !nextPw) {
    return res.status(400).json({ error: 'currentPassword and newPassword required' });
  }
  if (nextPw.length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters' });
  }
  try {
    const { rows } = await pool.query(`SELECT password_hash FROM users WHERE id = $1::uuid`, [req.userId]);
    const row = rows[0];
    if (!row) return res.status(404).json({ error: 'User not found' });
    const ok = await bcrypt.compare(curPw, row.password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    const hash = await bcrypt.hash(nextPw, 12);
    await pool.query(`UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2::uuid`, [
      hash,
      req.userId,
    ]);
    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Password update failed' });
  }
});

module.exports = router;
