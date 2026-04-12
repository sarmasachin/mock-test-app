'use strict';

const { OAuth2Client } = require('google-auth-library');

let oauth2Client;

function getAudience() {
  return String(process.env.GOOGLE_WEB_CLIENT_ID || '').trim();
}

function isGoogleAuthConfigured() {
  return Boolean(getAudience());
}

/**
 * @param {string} idToken
 * @returns {Promise<{ sub: string, email: string, name: string }>}
 */
async function verifyGoogleIdToken(idToken) {
  const audience = getAudience();
  if (!audience) {
    throw new Error('GOOGLE_WEB_CLIENT_ID is not set');
  }
  if (!oauth2Client) {
    oauth2Client = new OAuth2Client(audience);
  }
  const ticket = await oauth2Client.verifyIdToken({
    idToken,
    audience,
  });
  const p = ticket.getPayload();
  if (!p || !p.sub || !p.email) {
    throw new Error('Invalid Google token payload');
  }
  if (!p.email_verified) {
    throw new Error('Google email is not verified');
  }
  const email = String(p.email).trim().toLowerCase();
  const name = String(p.name || '')
    .trim()
    .slice(0, 120);
  return {
    sub: String(p.sub),
    email,
    name: name || email.split('@')[0] || 'User',
  };
}

module.exports = { verifyGoogleIdToken, isGoogleAuthConfigured };
