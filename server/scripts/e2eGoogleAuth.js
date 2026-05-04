#!/usr/bin/env node
'use strict';

/**
 * Smoke tests for POST /v1/auth/google (no real Google account required for basic checks).
 *
 * Optional live check: set E2E_GOOGLE_ID_TOKEN to a fresh ID token from the device
 * (Logcat after sign-in, or a one-off debug log) — token expires quickly (~1h).
 *
 *   cd server && npm run e2e:google-auth
 *   API_BASE=http://127.0.0.1:3000/v1 npm run e2e:google-auth
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (_e) {
    data = { _raw: text };
  }
  return { ok: res.ok, status: res.status, data };
}

async function main() {
  const apiBase = String(process.env.API_BASE || process.env.E2E_API_BASE || 'http://127.0.0.1:3000/v1').replace(
    /\/+$/,
    '',
  );
  const url = `${apiBase}/auth/google`;
  console.log('[e2e:google-auth] POST', url);

  let failed = false;

  const r0 = await postJson(url, {});
  if (r0.status !== 400 || !String(r0.data?.error || '').includes('idToken')) {
    console.warn('[e2e:google-auth] Expected 400 idToken required, got', r0.status, r0.data);
    failed = true;
  } else {
    console.log('[e2e:google-auth] OK: missing idToken → 400');
  }

  const configured = Boolean(String(process.env.GOOGLE_SIGN_IN_WEB_CLIENT_ID || '').trim());
  const r1 = await postJson(url, { idToken: 'not-a-real-jwt' });
  const expectedBadToken = configured ? 401 : 503;
  if (r1.status !== expectedBadToken) {
    console.warn(
      `[e2e:google-auth] Expected HTTP ${expectedBadToken} for garbage token (configured=${configured}), got`,
      r1.status,
      r1.data,
    );
    failed = true;
  } else {
    console.log(`[e2e:google-auth] OK: invalid token → ${r1.status}`);
  }

  const live = String(process.env.E2E_GOOGLE_ID_TOKEN || '').trim();
  if (live) {
    const r2 = await postJson(url, { idToken: live });
    if ((r2.status === 200 || r2.status === 201) && r2.data?.accessToken) {
      console.log('[e2e:google-auth] OK: live idToken returned accessToken (HTTP', r2.status + ')');
    } else {
      console.warn('[e2e:google-auth] Live token check failed:', r2.status, r2.data);
      failed = true;
    }
  } else {
    console.log('[e2e:google-auth] Skip live token (set E2E_GOOGLE_ID_TOKEN to exercise full verify).');
  }

  if (!configured) {
    console.warn('[e2e:google-auth] Note: GOOGLE_SIGN_IN_WEB_CLIENT_ID unset — set it for real ID token verification.');
  }

  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error('[e2e:google-auth] Failed (API down?):', e.message || e);
  process.exit(0);
});
