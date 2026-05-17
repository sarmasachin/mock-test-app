'use strict';

const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const { sha256Hex, randomRefreshToken } = require('../cryptoUtil');
const { mapUserRow } = require('../userMapper');
const {
  ACCESS_TTL,
  signAccessToken,
  insertRefreshSession,
  issueTokens,
} = require('../services/sessionTokens');
const {
  isMailConfigured,
  mapSmtpSendErrorToClientMessage,
  sendPasswordResetOtp,
  sendAdminLoginOtp,
  sendWelcomeEmail,
  sendSecurityAccountAlertEmail,
} = require('../mail');
const { postGoogleSignIn } = require('../auth/googleSignInPost');
const {
  checkPasswordResetIp,
  checkPasswordResetEmail,
  checkAdminLoginRequestIp,
  checkAdminLoginRequestUser,
  checkAdminLoginVerifyIp,
} = require('../lib/otpSendRateLimit');

const router = express.Router();

/**
 * When true, POST /admin-login/request-otp returns JWTs immediately after password + is_admin
 * checks (no email OTP). Production servers must leave ADMIN_DEV_PASSWORD_LOGIN unset/false
 * (do not commit server/.env); NODE_ENV is not used here so local runs are not blocked by a
 * stray NODE_ENV=production on the developer machine.
 */
function isAdminDevPasswordLoginEnabled() {
  const raw = String(process.env.ADMIN_DEV_PASSWORD_LOGIN || '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
}

function pickSixDigit() {
  return 100000 + Math.floor(Math.random() * 900000);
}

const PASSWORD_RESET_OTP_MINUTES = () =>
  parseInt(process.env.PASSWORD_RESET_OTP_MINUTES || '15', 10);

const ADMIN_LOGIN_OTP_MINUTES = () => {
  const raw = process.env.ADMIN_LOGIN_OTP_MINUTES;
  if (raw !== undefined && String(raw).trim() !== '') {
    const n = parseInt(String(raw), 10);
    return Number.isFinite(n) ? Math.max(5, Math.min(60, n)) : 15;
  }
  return Math.max(5, Math.min(60, PASSWORD_RESET_OTP_MINUTES()));
};

/** Shared lookup for password login and admin OTP flows */
async function loadUserByLoginIdentifier(idRaw) {
  const raw = String(idRaw || '').trim();
  if (!raw) return { kind: 'empty' };
  if (raw.includes('@')) {
    const { rows } = await pool.query(
      `SELECT * FROM users WHERE email_normalized = lower(trim($1)) LIMIT 1`,
      [raw],
    );
    return { kind: 'ok', row: rows[0] || null };
  }
  const digits = raw.replace(/\D/g, '').slice(0, 10);
  if (!isValidPhone(digits)) return { kind: 'bad_phone' };
  const { rows } = await pool.query(`SELECT * FROM users WHERE phone = $1 LIMIT 1`, [digits]);
  return { kind: 'ok', row: rows[0] || null };
}

function isValidPhone(input) {
  const digits = String(input || '').replace(/\D/g, '').slice(0, 10);
  if (digits.length !== 10) return false;
  const allSameDigit = new Set(digits.split('')).size === 1;
  const firstFiveSame = new Set(digits.slice(0, 5).split('')).size === 1;
  return !allSameDigit && !firstFiveSame;
}

/** Stable id from app (e.g. ANDROID_ID); else weak hash of UA+IP for legacy clients. */
function computeLoginDeviceFingerprint(req, body) {
  const raw = String((body && (body.deviceFingerprint || body.deviceId)) || '')
    .trim()
    .slice(0, 128);
  if (raw) return raw;
  const ua = String(req.headers['user-agent'] || '').slice(0, 400);
  const ip = String(req.ip || req.socket?.remoteAddress || '').trim();
  return crypto.createHash('sha256').update(`${ua}|${ip}`, 'utf8').digest('hex');
}

/**
 * Remembers this device for the user. Returns whether to send "new device" security email.
 * Suppresses mail for accounts younger than NEW_ACCOUNT_LOGIN_ALERT_GRACE_HOURS (default 48).
 */
async function recordPasswordLoginDevice({ userId, createdAt, fingerprint }) {
  const graceHoursRaw = Number(process.env.NEW_ACCOUNT_LOGIN_ALERT_GRACE_HOURS || 48);
  const graceHours = Number.isFinite(graceHoursRaw)
    ? Math.max(0, Math.min(168, graceHoursRaw))
    : 48;
  const graceMs = graceHours * 3600 * 1000;
  const createdMs = createdAt ? new Date(createdAt).getTime() : NaN;
  const accountAgeMs = Number.isFinite(createdMs) ? Date.now() - createdMs : Infinity;
  const withinGrace = accountAgeMs >= 0 && accountAgeMs < graceMs;

  const existing = await pool.query(
    `SELECT 1 AS ok FROM user_login_devices WHERE user_id = $1::uuid AND fingerprint = $2 LIMIT 1`,
    [userId, fingerprint],
  );
  if (existing.rows[0]) {
    await pool.query(
      `UPDATE user_login_devices SET last_seen_at = now()
       WHERE user_id = $1::uuid AND fingerprint = $2`,
      [userId, fingerprint],
    );
    return { shouldAlert: false };
  }
  await pool.query(
    `INSERT INTO user_login_devices (user_id, fingerprint, first_seen_at, last_seen_at)
     VALUES ($1::uuid, $2, now(), now())`,
    [userId, fingerprint],
  );
  return { shouldAlert: !withinGrace };
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
      sendWelcomeEmail({ to: em, displayName: name, userId: String(userRow.id) }).catch((mailErr) => {
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

  try {
    const loaded = await loadUserByLoginIdentifier(idRaw);
    if (loaded.kind === 'bad_phone') {
      return res.status(400).json({ error: 'Enter valid email or 10-digit mobile' });
    }
    const row = loaded.kind === 'ok' ? loaded.row : null;
    if (!row) return res.status(401).json({ error: 'Invalid credentials' });
    if (row.is_banned) return res.status(403).json({ error: row.ban_reason || 'Account is blocked by admin' });
    const ok = await bcrypt.compare(pw, row.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    const tokens = await issueTokens(row.id);
    let shouldSendNewDeviceAlert = false;
    try {
      const fingerprint = computeLoginDeviceFingerprint(req, req.body || {});
      const rec = await recordPasswordLoginDevice({
        userId: row.id,
        createdAt: row.created_at,
        fingerprint,
      });
      shouldSendNewDeviceAlert = rec.shouldAlert === true;
    } catch (devErr) {
      console.error('login_device_record_failed', devErr && (devErr.message || devErr));
    }
    if (shouldSendNewDeviceAlert && isMailConfigured() && row.email) {
      sendSecurityAccountAlertEmail({
        userId: String(row.id),
        to: String(row.email || '').trim(),
        displayName: String(row.display_name || '').trim(),
        subject: 'Security Alert: New login on your account',
        eventType: 'New Login',
        eventDetail: `A new login was detected on a device we have not seen on this account before. IP ${String(req.ip || '')}. ${String(req.headers['user-agent'] || '').slice(0, 120)}`,
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
 * POST /v1/auth/admin-login/request-otp
 * Body: { identifier, password } — verify password + admin flag, then email 6-digit code.
 * Does not return tokens (admin panel only; mobile app unchanged).
 */
router.post('/admin-login/request-otp', async (req, res) => {
  const idRaw = String((req.body || {}).identifier || '').trim();
  const pw = String((req.body || {}).password || '');
  if (!idRaw || !pw) return res.status(400).json({ error: 'identifier and password required' });

  const rlIp = checkAdminLoginRequestIp(req);
  if (!rlIp.ok) {
    res.setHeader('Retry-After', String(rlIp.retryAfterSec));
    return res.status(429).json({
      error: `Too many attempts from this network. Try again in ${rlIp.retryAfterSec}s.`,
    });
  }

  try {
    const loaded = await loadUserByLoginIdentifier(idRaw);
    if (loaded.kind === 'bad_phone') {
      return res.status(400).json({ error: 'Enter valid email or 10-digit mobile' });
    }
    const row = loaded.kind === 'ok' ? loaded.row : null;
    if (!row) return res.status(401).json({ error: 'Invalid credentials' });
    if (row.is_banned) return res.status(403).json({ error: row.ban_reason || 'Account is blocked by admin' });
    const ok = await bcrypt.compare(pw, row.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    if (!row.is_admin) return res.status(401).json({ error: 'Invalid credentials' });

    const emailTo = String(row.email || '').trim();
    if (!emailTo || !emailTo.includes('@')) {
      return res.status(400).json({
        error: 'Admin OTP login requires an email address on this account. Contact support.',
      });
    }

    const rlUid = checkAdminLoginRequestUser(row.id);
    if (!rlUid.ok) {
      res.setHeader('Retry-After', String(rlUid.retryAfterSec));
      return res.status(429).json({
        error: `Too many code requests for this account. Try again in ${rlUid.retryAfterSec}s.`,
      });
    }

    if (isAdminDevPasswordLoginEnabled()) {
      console.warn(
        'admin_login_dev_password_bypass: tokens issued without OTP (ADMIN_DEV_PASSWORD_LOGIN is enabled — disable on any public deploy)',
      );
      const tokens = await issueTokens(row.id);
      return res.status(200).json({
        ok: true,
        devPasswordBypass: true,
        message:
          'Local dev: signed in without email OTP. Unset ADMIN_DEV_PASSWORD_LOGIN before production.',
        user: mapUserRow(row),
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresInSeconds: tokens.expiresInSeconds,
      });
    }

    if (!isMailConfigured()) {
      return res.status(503).json({
        error: 'Email is not configured on the server. Cannot send login code.',
      });
    }

    const otp = String(pickSixDigit());
    const tokenHash = sha256Hex(otp);
    const expires = new Date();
    expires.setMinutes(expires.getMinutes() + ADMIN_LOGIN_OTP_MINUTES());

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE user_one_time_tokens SET used_at = now()
         WHERE user_id = $1::uuid AND purpose = 'admin_login' AND used_at IS NULL`,
        [row.id],
      );
      await client.query(
        `INSERT INTO user_one_time_tokens (user_id, purpose, token_hash, expires_at)
         VALUES ($1::uuid, 'admin_login', $2, $3)`,
        [row.id, tokenHash, expires.toISOString()],
      );
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }

    await sendAdminLoginOtp({ to: emailTo, otp });
    const mins = ADMIN_LOGIN_OTP_MINUTES();
    return res.status(200).json({
      ok: true,
      message: `We sent a login code to your email. It expires in ${mins} minutes.`,
    });
  } catch (e) {
    console.error('admin_login_request_otp_failed', e);
    return res.status(500).json({ error: mapSmtpSendErrorToClientMessage(e) });
  }
});

/**
 * POST /v1/auth/admin-login/verify-otp
 * Body: { identifier, otp } — same tokens shape as POST /login.
 */
router.post('/admin-login/verify-otp', async (req, res) => {
  const idRaw = String((req.body || {}).identifier || '').trim();
  const otpRaw = String((req.body || {}).otp || '').replace(/\D/g, '');
  if (!idRaw || otpRaw.length !== 6) {
    return res.status(400).json({ error: 'identifier and 6-digit code required' });
  }

  const rlIp = checkAdminLoginVerifyIp(req);
  if (!rlIp.ok) {
    res.setHeader('Retry-After', String(rlIp.retryAfterSec));
    return res.status(429).json({
      error: `Too many attempts from this network. Try again in ${rlIp.retryAfterSec}s.`,
    });
  }

  try {
    const loaded = await loadUserByLoginIdentifier(idRaw);
    if (loaded.kind === 'bad_phone') {
      return res.status(400).json({ error: 'Enter valid email or 10-digit mobile' });
    }
    const row = loaded.kind === 'ok' ? loaded.row : null;
    if (!row) return res.status(401).json({ error: 'Invalid or expired code' });
    if (row.is_banned) return res.status(403).json({ error: row.ban_reason || 'Account is blocked by admin' });
    if (!row.is_admin) return res.status(401).json({ error: 'Invalid or expired code' });

    const tokenHash = sha256Hex(otpRaw);
    const tok = await pool.query(
      `SELECT id FROM user_one_time_tokens
       WHERE user_id = $1::uuid
         AND purpose = 'admin_login'
         AND token_hash = $2
         AND used_at IS NULL
         AND expires_at > now()
       ORDER BY created_at DESC
       LIMIT 1`,
      [row.id, tokenHash],
    );
    const tokenRow = tok.rows[0];
    if (!tokenRow) {
      return res.status(401).json({ error: 'Invalid or expired code' });
    }

    await pool.query(`UPDATE user_one_time_tokens SET used_at = now() WHERE id = $1`, [tokenRow.id]);
    await pool.query(
      `UPDATE user_one_time_tokens SET used_at = now()
       WHERE user_id = $1::uuid AND purpose = 'admin_login' AND used_at IS NULL AND id <> $2`,
      [row.id, tokenRow.id],
    );

    const tokens = await issueTokens(row.id);
    return res.json({
      user: mapUserRow(row),
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresInSeconds: tokens.expiresInSeconds,
    });
  } catch (e) {
    console.error('admin_login_verify_otp_failed', e);
    return res.status(500).json({ error: 'Login failed' });
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
  const rlIp = checkPasswordResetIp(req);
  if (!rlIp.ok) {
    res.setHeader('Retry-After', String(rlIp.retryAfterSec));
    return res.status(429).json({
      error: `Too many reset attempts from this network. Try again in ${rlIp.retryAfterSec}s.`,
    });
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
    const rlEm = checkPasswordResetEmail(em);
    if (!rlEm.ok) {
      res.setHeader('Retry-After', String(rlEm.retryAfterSec));
      return res.status(429).json({
        error: `Too many codes sent to this email. Try again in ${rlEm.retryAfterSec}s.`,
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
    console.error('password_reset_request_send_failed', e);
    return res.status(500).json({ error: mapSmtpSendErrorToClientMessage(e) });
  }
});

/**
 * POST /v1/auth/google
 * Body: { idToken } — Google ID token from the Android app (Play Services Sign-In).
 * Separate from SMTP / email-OTP flows (see password-reset routes and ../mail).
 */
router.post('/google', postGoogleSignIn);

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
        userId: String(userId),
        to: em,
        displayName: String(em.split('@')[0] || 'User'),
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




