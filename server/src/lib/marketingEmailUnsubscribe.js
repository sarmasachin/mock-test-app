'use strict';

const crypto = require('crypto');

const TOKEN_VERSION = 1;
const TOKEN_TTL_SEC = 180 * 24 * 60 * 60; // 180 days

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim());
}

/** HTTPS origin only (no path). Example: https://admin-admin.govmocktest.com */
function getPublicApiOrigin() {
  const a = String(process.env.PUBLIC_API_BASE_URL || '').trim().replace(/\/+$/, '');
  if (a) return a;
  const b = String(process.env.EMAIL_PUBLIC_UNSUBSCRIBE_BASE_URL || '').trim().replace(/\/+$/, '');
  return b || '';
}

function getJwtSecret() {
  return String(process.env.JWT_SECRET || '').trim();
}

function signMarketingEmailUnsubscribeToken(userId) {
  const secret = getJwtSecret();
  if (!secret || secret.length < 16) return null;
  const uid = String(userId || '').trim();
  if (!isUuid(uid)) return null;
  const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_SEC;
  const payload = Buffer.from(JSON.stringify({ v: TOKEN_VERSION, sub: uid, exp }), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifyMarketingEmailUnsubscribeToken(token) {
  const secret = getJwtSecret();
  if (!secret || secret.length < 16) return null;
  const raw = String(token || '').trim();
  const dot = raw.indexOf('.');
  if (dot <= 0) return null;
  const payload = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  if (!payload || !sig) return null;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  try {
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(sig, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  } catch (_e) {
    return null;
  }
  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch (_e) {
    return null;
  }
  if (!parsed || parsed.v !== TOKEN_VERSION || !isUuid(parsed.sub)) return null;
  const now = Math.floor(Date.now() / 1000);
  if (typeof parsed.exp !== 'number' || parsed.exp < now) return null;
  return { userId: String(parsed.sub).trim() };
}

/** Full URL for GET unsubscribe (null if misconfigured or invalid user id). */
function buildMarketingUnsubscribeUrl(userId) {
  const origin = getPublicApiOrigin();
  if (!origin.toLowerCase().startsWith('https://')) return null;
  const tok = signMarketingEmailUnsubscribeToken(userId);
  if (!tok) return null;
  return `${origin}/v1/email/preferences/unsubscribe?token=${encodeURIComponent(tok)}`;
}

module.exports = {
  getPublicApiOrigin,
  signMarketingEmailUnsubscribeToken,
  verifyMarketingEmailUnsubscribeToken,
  buildMarketingUnsubscribeUrl,
  isUuid,
};
