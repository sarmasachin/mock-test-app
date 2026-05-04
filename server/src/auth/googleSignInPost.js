'use strict';

/**
 * Google Sign-In HTTP handler only.
 * No SMTP, no password-reset mail, no welcome mail — keeps this flow isolated from email code.
 */

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { pool } = require('../db');
const { mapUserRow } = require('../userMapper');
const { issueTokens } = require('../services/sessionTokens');
const { verifyGoogleSignInIdToken } = require('./verifyGoogleIdToken');

function pickSixDigit() {
  return 100000 + Math.floor(Math.random() * 900000);
}

async function isRegistrationClosed() {
  try {
    const registrationSetting = await pool.query(
      `SELECT setting_value FROM app_settings WHERE setting_key = 'registrationOpen' LIMIT 1`,
    );
    if (
      registrationSetting.rows[0] &&
      String(registrationSetting.rows[0].setting_value || 'true').toLowerCase() === 'false'
    ) {
      return true;
    }
  } catch (e) {
    if (e.code === '42P01') {
      return false;
    }
    throw e;
  }
  return false;
}

async function postGoogleSignIn(req, res) {
  const idToken = String((req.body || {}).idToken || '').trim();
  if (!idToken) {
    return res.status(400).json({ error: 'idToken required' });
  }

  let sub;
  let email;
  let emailVerified;
  let displayName;
  try {
    const payload = await verifyGoogleSignInIdToken(idToken);
    sub = String(payload.sub || '').trim();
    email = String(payload.email || '')
      .trim()
      .toLowerCase();
    emailVerified = Boolean(payload.email_verified);
    displayName = String(payload.name || '').trim();
  } catch (e) {
    if (e && e.code === 'CONFIG') {
      console.error('google_sign_in_disabled', 'Set GOOGLE_SIGN_IN_WEB_CLIENT_ID in server .env');
      return res.status(503).json({ error: 'Google sign-in is not configured on this server' });
    }
    console.error('google_id_token_verify_failed', e && (e.message || e));
    return res.status(401).json({ error: 'Invalid or expired Google sign-in' });
  }

  if (!sub) {
    return res.status(401).json({ error: 'Invalid Google account' });
  }
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Your Google account did not share an email. Allow email to continue.' });
  }
  if (!displayName) {
    displayName = email.split('@')[0] || 'User';
  }

  const client = await pool.connect();
  try {
    const bySub = await client.query(`SELECT * FROM users WHERE google_sub = $1 LIMIT 1`, [sub]);
    let userRow = bySub.rows[0];
    if (userRow) {
      if (userRow.is_banned) {
        return res.status(403).json({ error: userRow.ban_reason || 'Account is blocked by admin' });
      }
      const tokens = await issueTokens(userRow.id);
      return res.status(200).json({
        user: mapUserRow(userRow),
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresInSeconds: tokens.expiresInSeconds,
      });
    }

    const byEmail = await client.query(
      `SELECT * FROM users WHERE email_normalized = lower(trim($1)) LIMIT 1`,
      [email],
    );
    const existing = byEmail.rows[0];
    if (existing) {
      if (existing.is_banned) {
        return res.status(403).json({ error: existing.ban_reason || 'Account is blocked by admin' });
      }
      if (existing.google_sub && String(existing.google_sub) !== sub) {
        return res.status(409).json({ error: 'This email is linked to a different Google account' });
      }
      const verifiedAt = emailVerified ? new Date().toISOString() : null;
      await client.query(
        `UPDATE users
         SET google_sub = $1,
             display_name = CASE
               WHEN trim(COALESCE(display_name, '')) = '' THEN $2
               ELSE display_name
             END,
             email_verified_at = COALESCE(email_verified_at, $3::timestamptz),
             updated_at = now()
         WHERE id = $4::uuid`,
        [sub, displayName, verifiedAt, existing.id],
      );
      const refreshed = await client.query(`SELECT * FROM users WHERE id = $1::uuid LIMIT 1`, [existing.id]);
      userRow = refreshed.rows[0];
      const tokens = await issueTokens(userRow.id);
      return res.status(200).json({
        user: mapUserRow(userRow),
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresInSeconds: tokens.expiresInSeconds,
      });
    }

    const closed = await isRegistrationClosed();
    if (closed) {
      return res.status(403).json({ error: 'New registration is temporarily disabled' });
    }

    const randomPasswordMaterial = crypto.randomBytes(48).toString('hex');
    const passwordHash = await bcrypt.hash(randomPasswordMaterial, 12);

    let inserted = null;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const six = pickSixDigit();
      try {
        const ins = await client.query(
          `INSERT INTO users (
             email, password_hash, display_name, phone, google_sub,
             six_digit_public_id, signup_state, signup_district, email_verified_at
           ) VALUES ($1, $2, $3, '', $4, $5, '', '', $6)
           RETURNING *`,
          [email, passwordHash, displayName, sub, six, emailVerified ? new Date().toISOString() : null],
        );
        inserted = ins.rows[0];
        break;
      } catch (e) {
        if (e.code === '23505' && e.constraint === 'users_six_digit_public_id_unique') {
          continue;
        }
        throw e;
      }
    }
    if (!inserted) {
      return res.status(500).json({ error: 'Could not allocate user id; retry' });
    }
    const tokens = await issueTokens(inserted.id);
    return res.status(201).json({
      user: mapUserRow(inserted),
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresInSeconds: tokens.expiresInSeconds,
    });
  } catch (e) {
    if (e.code === '23505') {
      return res.status(409).json({ error: 'Email or account already exists' });
    }
    console.error(e);
    return res.status(500).json({ error: 'Google sign-in failed' });
  } finally {
    client.release();
  }
}

module.exports = {
  postGoogleSignIn,
};
