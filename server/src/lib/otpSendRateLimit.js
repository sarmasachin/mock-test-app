'use strict';

/**
 * In-memory sliding-window caps for OTP send endpoints (reduces SMTP auth storms + abuse).
 * Tuned via env; safe defaults for single-node API. (Multi-node needs Redis etc.)
 */

const WINDOW_MS = Math.max(60_000, parseInt(process.env.OTP_REQUEST_WINDOW_MS || '900000', 10));
const PW_MAX_IP = Math.max(5, parseInt(process.env.OTP_PASSWORD_RESET_MAX_PER_IP || '30', 10));
const PW_MAX_EMAIL = Math.max(1, parseInt(process.env.OTP_PASSWORD_RESET_MAX_PER_EMAIL || '5', 10));
const EV_MAX_USER = Math.max(1, parseInt(process.env.OTP_EMAIL_VERIFY_MAX_PER_USER || '8', 10));
// Admin login: keep these low to avoid mail provider blocks during testing.
const ADL_REQ_MAX_IP = Math.max(1, parseInt(process.env.OTP_ADMIN_LOGIN_REQUEST_MAX_PER_IP || '5', 10));
const ADL_REQ_MAX_UID = Math.max(1, parseInt(process.env.OTP_ADMIN_LOGIN_REQUEST_MAX_PER_USER || '5', 10));
const ADL_VER_MAX_IP = Math.max(1, parseInt(process.env.OTP_ADMIN_LOGIN_VERIFY_MAX_PER_IP || '10', 10));

const buckets = new Map();

function bucketKey(kind, id) {
  return `${kind}:${String(id || '').trim().slice(0, 320)}`;
}

function take(key, max) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    b = { count: 0, resetAt: now + WINDOW_MS };
    buckets.set(key, b);
  }
  if (b.count >= max) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) };
  }
  b.count += 1;
  return { ok: true };
}

function clientIp(req) {
  const xf = String(req.headers['x-forwarded-for'] || '')
    .split(',')[0]
    .trim();
  if (xf) return xf.slice(0, 128);
  return String(req.ip || req.socket?.remoteAddress || 'unknown').slice(0, 128);
}

function checkPasswordResetIp(req) {
  return take(bucketKey('pw_ip', clientIp(req)), PW_MAX_IP);
}

function checkPasswordResetEmail(email) {
  const em = String(email || '').trim().toLowerCase();
  return take(bucketKey('pw_em', em), PW_MAX_EMAIL);
}

function checkEmailVerificationUser(userId) {
  return take(bucketKey('ev_uid', String(userId || '').trim()), EV_MAX_USER);
}

/** Admin panel: request OTP after password check */
function checkAdminLoginRequestIp(req) {
  return take(bucketKey('adl_req_ip', clientIp(req)), ADL_REQ_MAX_IP);
}

function checkAdminLoginRequestUser(userId) {
  return take(bucketKey('adl_req_uid', String(userId || '').trim()), ADL_REQ_MAX_UID);
}

/** Admin panel: verify OTP step */
function checkAdminLoginVerifyIp(req) {
  return take(bucketKey('adl_ver_ip', clientIp(req)), ADL_VER_MAX_IP);
}

setInterval(() => {
  const now = Date.now();
  const cutoff = now - WINDOW_MS * 2;
  for (const [k, v] of buckets.entries()) {
    if (!v || v.resetAt < cutoff) buckets.delete(k);
  }
}, Math.min(WINDOW_MS, 300_000)).unref();

module.exports = {
  checkPasswordResetIp,
  checkPasswordResetEmail,
  checkEmailVerificationUser,
  checkAdminLoginRequestIp,
  checkAdminLoginRequestUser,
  checkAdminLoginVerifyIp,
  clientIp,
};
