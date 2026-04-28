'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../db');
const { sha256Hex, randomRefreshToken } = require('../cryptoUtil');
const { mapUserRow } = require('../userMapper');
const {
  isMailConfigured,
  sendPasswordResetOtp,
  sendWelcomeEmail,
  sendSecurityAccountAlertEmail,
} = require('../mail');
const { verifyGoogleIdToken, isGoogleAuthConfigured } = require('../googleAuth');

const router = express.Router();

const ACCESS_TTL = () => parseInt(process.env.ACCESS_TOKEN_TTL_SECONDS || '86400', 10);
const REFRESH_DAYS = () => parseInt(process.env.REFRESH_TOKEN_TTL_DAYS || '14', 10);

function signAccessToken(userId) {
  return jwt.sign({ sub: userId }, process.env.JWT_SECRET, { expiresIn: ACCESS_TTL() });
}

async function insertRefreshSession(client, userId, plainRefresh) {
  const hash = sha256Hex(plainRefresh);
  const expires = new Date();
  expires.setDate(expires.getDate() + REFRESH_DAYS());
  await client.query(
    `INSERT INTO user_refresh_sessions (user_id, refresh_token_hash, expires_at)
     VALUES ($1::uuid, $2, $3)`,
    [userId, hash, expires.toISOString()],
  );
}

async function issueTokens(userId) {
  const accessToken = signAccessToken(userId);
  const refreshToken = randomRefreshToken();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await insertRefreshSession(client, userId, refreshToken);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  return { accessToken, refreshToken, expiresInSeconds: ACCESS_TTL() };
}

function pickSixDigit() {
  return 100000 + Math.floor(Math.random() * 900000);
}

const PASSWORD_RESET_OTP_MINUTES = () =>
  parseInt(process.env.PASSWORD_RESET_OTP_MINUTES || '15', 10);

function isValidPhone(input) {
  const digits = String(input || '').replace(/\D/g, '').slice(0, 10);
  if (digits.length !== 10) return false;
  const allSameDigit = new Set(digits.split('')).size === 1;
  const firstFiveSame = new Set(digits.slice(0, 5).split('')).size === 1;
  return !allSameDigit && !firstFiveSame;
}

router.post('/register', async (req, res) => {
  const { displayName, email, phone, password, state, district } = req.body || {};
  const name = String(displayName || '').trim();
  const em = String(email || '').trim().toLowerCase();
  const ph = String(phone || '').replace(/\D/g, '').slice(0, 10);
  const pw = String(password || '');
  const st = String(state || '').trim();
  const dist = String(district || '').trim();
  try {
    const registrationSetting = await pool.query(
      `SELECT setting_value FROM app_settings WHERE setting_key = 'registrationOpen' LIMIT 1`,
    );
    if (
      registrationSetting.rows[0] &&
      String(registrationSetting.rows[0].setting_value || 'true').toLowerCase() === 'false'
    ) {
      return res.status(403).json({ error: 'New registration is temporarily disabled' });
    }
  } catch (e) {
    if (e.code !== '42P01') {
      console.error(e);
      return res.status(500).json({ error: 'Registration is temporarily unavailable' });
    }
  }

  if (!name) return res.status(400).json({ error: 'displayName required' });
  if (!em || !em.includes('@')) return res.status(400).json({ error: 'Valid email required' });
  if (!isValidPhone(ph)) {
    return res.status(400).json({ error: 'Enter a valid mobile number' });
  }
  if (pw.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });

  const passwordHash = await bcrypt.hash(pw, 12);
  const client = await pool.connect();
  try {
    let userRow = null;
    for (let attempt = 0; attempt < 40; attempt++) {
      const six = pickSixDigit();
      try {
        const ins = await client.query(
          `INSERT INTO users (
             email, password_hash, display_name, phone, six_digit_public_id,
             signup_state, signup_district
           ) VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING *`,
          [em, passwordHash, name, ph, six, st, dist],
        );
        userRow = ins.rows[0];
        break;
      } catch (e) {
        if (e.code === '23505' && e.constraint === 'users_six_digit_public_id_unique') {
          continue;
        }
        throw e;
      }
    }
    if (!userRow) {
      return res.status(500).json({ error: 'Could not allocate user id; retry' });
    }
    const tokens = await issueTokens(userRow.id);
    if (isMailConfigured()) {
      sendWelcomeEmail({ to: em, displayName: name }).catch((mailErr) => {
        console.error('welcome_email_failed', mailErr && (mailErr.message || mailErr));
      });
    }
    return res.status(201).json({
      user: mapUserRow(userRow),
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresInSeconds: tokens.expiresInSeconds,
    });
  } catch (e) {
    if (e.code === '23505') {
      return res.status(409).json({ error: 'Email or phone already registered' });
    }
    console.error(e);
    return res.status(500).json({ error: 'Registration failed' });
  } finally {
    client.release();
  }
});

router.post('/login', async (req, res) => {
  const { identifier, password } = req.body || {};
  const idRaw = String(identifier || '').trim();
  const pw = String(password || '');
  if (!idRaw || !pw) return res.status(400).json({ error: 'identifier and password required' });

  let q;
  let params;
  if (idRaw.includes('@')) {
    q = `SELECT * FROM users WHERE email_normalized = lower(trim($1)) LIMIT 1`;
    params = [idRaw];
  } else {
    const digits = idRaw.replace(/\D/g, '').slice(0, 10);
    if (!isValidPhone(digits)) {
      return res.status(400).json({ error: 'Enter valid email or 10-digit mobile' });
    }
    q = `SELECT * FROM users WHERE phone = $1 LIMIT 1`;
    params = [digits];
  }

  try {
    const { rows } = await pool.query(q, params);
    const row = rows[0];
    if (!row) return res.status(401).json({ error: 'Invalid credentials' });
    if (row.is_banned) return res.status(403).json({ error: row.ban_reason || 'Account is blocked by admin' });
    const ok = await bcrypt.compare(pw, row.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    const tokens = await issueTokens(row.id);
    if (isMailConfigured() && row.email) {
      sendSecurityAccountAlertEmail({
        to: String(row.email || '').trim(),
        subject: 'New login detected',
        eventType: 'New Login',
        eventDetail: `A new login was detected from IP ${String(req.ip || '')} using ${String(req.headers['user-agent'] || '').slice(0, 120)}.`,
      }).catch((mailErr) => {
        console.error('security_login_alert_failed', mailErr && (mailErr.message || mailErr));
      });
    }
    return res.json({
      user: mapUserRow(row),
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresInSeconds: tokens.expiresInSeconds,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Login failed' });
  }
});

/**
 * POST /v1/auth/google
 * Body: { idToken } — Android Credential Manager ID token; verified with GOOGLE_WEB_CLIENT_ID.
 * Creates user (phone/state empty) or logs in / links google_sub on existing email.
 */
router.post('/google', async (req, res) => {
  const idToken = String((req.body || {}).idToken || '').trim();
  if (!idToken) return res.status(400).json({ error: 'idToken required' });
  if (!isGoogleAuthConfigured()) {
    return res.status(503).json({ error: 'Google Sign-In is not configured on this server' });
  }

  let gp;
  try {
    gp = await verifyGoogleIdToken(idToken);
  } catch (e) {
    console.error('Google token verify failed:', e.message || e);
    return res.status(401).json({ error: 'Invalid or expired Google sign-in' });
  }

  const crypto = require('crypto');
  const client = await pool.connect();
  try {
    const byEmail = await client.query(
      `SELECT * FROM users WHERE email_normalized = lower(trim($1)) LIMIT 1`,
      [gp.email],
    );
    let row = byEmail.rows[0];

    if (row) {
      if (row.google_sub && row.google_sub !== gp.sub) {
        return res.status(409).json({ error: 'This email is linked to a different Google account' });
      }
      await client.query(
        `UPDATE users
         SET google_sub = COALESCE(google_sub, $1),
             email_verified_at = COALESCE(email_verified_at, now())
         WHERE id = $2::uuid`,
        [gp.sub, row.id],
      );
      const again = await client.query(`SELECT * FROM users WHERE id = $1::uuid`, [row.id]);
      row = again.rows[0];
    } else {
      const randomPw = crypto.randomBytes(32).toString('hex');
      const passwordHash = await bcrypt.hash(randomPw, 12);
      let userRow = null;
      for (let attempt = 0; attempt < 40; attempt++) {
        const six = pickSixDigit();
        try {
          const ins = await client.query(
            `INSERT INTO users (
               email, password_hash, display_name, phone, six_digit_public_id,
               signup_state, signup_district, google_sub, email_verified_at
             ) VALUES ($1, $2, $3, '', $4, '', '', $5, now())
             RETURNING *`,
            [gp.email, passwordHash, gp.name, six, gp.sub],
          );
          userRow = ins.rows[0];
          break;
        } catch (e) {
          if (e.code === '23505' && e.constraint === 'users_six_digit_public_id_unique') {
            continue;
          }
          throw e;
        }
      }
      if (!userRow) {
        return res.status(500).json({ error: 'Could not create account; try again' });
      }
      row = userRow;
    }
    if (row.is_banned) {
      return res.status(403).json({ error: row.ban_reason || 'Account is blocked by admin' });
    }
    const tokens = await issueTokens(row.id);
    if (isMailConfigured() && row.email) {
      sendSecurityAccountAlertEmail({
        to: String(row.email || '').trim(),
        subject: 'Google sign-in detected',
        eventType: 'Google Login',
        eventDetail: `A Google sign-in was detected from IP ${String(req.ip || '')}. If this was not you, secure your account now.`,
      }).catch((mailErr) => {
        console.error('security_google_login_alert_failed', mailErr && (mailErr.message || mailErr));
      });
    }
    return res.json({
      user: mapUserRow(row),
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresInSeconds: tokens.expiresInSeconds,
    });
  } catch (e) {
    console.error(e);
    if (e.code === '23505') {
      return res.status(409).json({ error: 'Email or Google account already registered' });
    }
    return res.status(500).json({ error: 'Google sign-in failed' });
  } finally {
    client.release();
  }
});

router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body || {};
  const plain = String(refreshToken || '');
  if (!plain) return res.status(400).json({ error: 'refreshToken required' });
  const hash = sha256Hex(plain);
  const client = await pool.connect();
  try {
    const sel = await client.query(
      `SELECT id, user_id FROM user_refresh_sessions
       WHERE refresh_token_hash = $1 AND revoked_at IS NULL AND expires_at > now()
       LIMIT 1`,
      [hash],
    );
    const session = sel.rows[0];
    if (!session) return res.status(401).json({ error: 'Invalid or expired refresh token' });

    await client.query('BEGIN');
    await client.query(`UPDATE user_refresh_sessions SET revoked_at = now() WHERE id = $1`, [session.id]);
    const newRefresh = randomRefreshToken();
    await insertRefreshSession(client, session.user_id, newRefresh);
    await client.query('COMMIT');

    const accessToken = signAccessToken(session.user_id);
    return res.json({
      accessToken,
      refreshToken: newRefresh,
      expiresInSeconds: ACCESS_TTL(),
    });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(e);
    return res.status(500).json({ error: 'Refresh failed' });
  } finally {
    client.release();
  }
});

/**
 * POST /v1/auth/password-reset/request
 * Body: { email }
 * Sends a 6-digit OTP to Gmail (or any SMTP) when SMTP_* env is set and the user exists.
 */
router.post('/password-reset/request', async (req, res) => {
  const em = String((req.body || {}).email || '')
    .trim()
    .toLowerCase();
  if (!em || !em.includes('@')) {
    return res.status(400).json({ error: 'Valid email required' });
  }
  try {
    const { rows } = await pool.query(
      `SELECT id, email FROM users WHERE email_normalized = lower(trim($1)) LIMIT 1`,
      [em],
    );
    const user = rows[0];
    if (!user) {
      return res.status(200).json({
        ok: false,
        error:
          'This email is not registered. Please sign up first or check the spelling.',
      });
    }
    if (!isMailConfigured()) {
      console.error('password-reset/request: SMTP_USER / SMTP_PASS / MAIL_FROM not set');
      return res.status(503).json({
        error:
          'Password reset email is not configured. Add SMTP settings to the server .env (see .env.example).',
      });
    }
    const otp = String(pickSixDigit());
    const tokenHash = sha256Hex(otp);
    const expires = new Date();
    expires.setMinutes(expires.getMinutes() + PASSWORD_RESET_OTP_MINUTES());
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE user_one_time_tokens SET used_at = now()
         WHERE user_id = $1::uuid AND purpose = 'password_reset' AND used_at IS NULL`,
        [user.id],
      );
      await client.query(
        `INSERT INTO user_one_time_tokens (user_id, purpose, token_hash, expires_at)
         VALUES ($1::uuid, 'password_reset', $2, $3)`,
        [user.id, tokenHash, expires.toISOString()],
      );
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
    await sendPasswordResetOtp({ to: user.email, otp });
    return res.status(200).json({
      ok: true,
      message: 'We sent a 6-digit code to this email. It expires in 15 minutes.',
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Could not send reset code' });
  }
});

/**
 * POST /v1/auth/password-reset/complete
 * Body: { email, otp, newPassword }
 */
router.post('/password-reset/complete', async (req, res) => {
  const em = String((req.body || {}).email || '')
    .trim()
    .toLowerCase();
  const otpRaw = String((req.body || {}).otp || '').replace(/\D/g, '');
  const newPw = String((req.body || {}).newPassword || '');
  if (!em || !em.includes('@')) {
    return res.status(400).json({ error: 'Valid email required' });
  }
  if (otpRaw.length !== 6) {
    return res.status(400).json({ error: 'Enter the 6-digit code from your email' });
  }
  if (newPw.length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters' });
  }
  const tokenHash = sha256Hex(otpRaw);
  const client = await pool.connect();
  try {
    const u = await client.query(
      `SELECT id FROM users WHERE email_normalized = lower(trim($1)) LIMIT 1`,
      [em],
    );
    const userId = u.rows[0]?.id;
    if (!userId) {
      return res.status(400).json({ error: 'Invalid or expired code' });
    }
    const tok = await client.query(
      `SELECT id FROM user_one_time_tokens
       WHERE user_id = $1::uuid
         AND purpose = 'password_reset'
         AND token_hash = $2
         AND used_at IS NULL
         AND expires_at > now()
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId, tokenHash],
    );
    const tokenRow = tok.rows[0];
    if (!tokenRow) {
      return res.status(400).json({ error: 'Invalid or expired code' });
    }
    const passwordHash = await bcrypt.hash(newPw, 12);
    await client.query('BEGIN');
    await client.query(`UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2::uuid`, [
      passwordHash,
      userId,
    ]);
    await client.query(`UPDATE user_one_time_tokens SET used_at = now() WHERE id = $1`, [tokenRow.id]);
    await client.query(
      `UPDATE user_one_time_tokens SET used_at = now()
       WHERE user_id = $1::uuid AND purpose = 'password_reset' AND used_at IS NULL AND id <> $2`,
      [userId, tokenRow.id],
    );
    await client.query('COMMIT');
    if (isMailConfigured()) {
      sendSecurityAccountAlertEmail({
        to: em,
        subject: 'Password changed successfully',
        eventType: 'Password Changed',
        eventDetail: `Your password was changed successfully. If you did not perform this action, reset password immediately.`,
      }).catch((mailErr) => {
        console.error('security_password_change_alert_failed', mailErr && (mailErr.message || mailErr));
      });
    }
    return res.json({ ok: true });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(e);
    return res.status(500).json({ error: 'Password reset failed' });
  } finally {
    client.release();
  }
});

module.exports = router;




