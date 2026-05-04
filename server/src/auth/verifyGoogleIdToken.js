'use strict';

const { OAuth2Client } = require('google-auth-library');

/**
 * OAuth client IDs allowed as JWT "aud" for Android Sign-In with requestIdToken(webClientId).
 * Configure at least GOOGLE_SIGN_IN_WEB_CLIENT_ID on the server.
 */
function configuredAudiences() {
  const web = String(process.env.GOOGLE_SIGN_IN_WEB_CLIENT_ID || '').trim();
  const android = String(process.env.GOOGLE_SIGN_IN_ANDROID_CLIENT_ID || '').trim();
  return [web, android].filter(Boolean);
}

/**
 * @param {string} idToken
 * @returns {Promise<import('google-auth-library').TokenPayload>}
 */
async function verifyGoogleSignInIdToken(idToken) {
  const audiences = configuredAudiences();
  if (!audiences.length) {
    const err = new Error('missing_google_audience');
    err.code = 'CONFIG';
    throw err;
  }
  const client = new OAuth2Client();
  const ticket = await client.verifyIdToken({
    idToken,
    audience: audiences.length === 1 ? audiences[0] : audiences,
  });
  const payload = ticket.getPayload();
  if (!payload) {
    const err = new Error('empty_payload');
    err.code = 'VERIFY';
    throw err;
  }
  return payload;
}

/** Decode JWT payload without verifying (debug only: safe fields like aud). */
function peekIdTokenAud(idToken) {
  try {
    const parts = String(idToken || '').split('.');
    if (parts.length < 2) return null;
    const json = Buffer.from(parts[1], 'base64url').toString('utf8');
    const payload = JSON.parse(json);
    return { aud: payload.aud, azp: payload.azp };
  } catch (_e) {
    return null;
  }
}

module.exports = {
  verifyGoogleSignInIdToken,
  configuredAudiences,
  peekIdTokenAud,
};
