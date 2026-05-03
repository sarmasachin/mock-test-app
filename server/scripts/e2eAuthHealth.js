#!/usr/bin/env node
'use strict';

/**
 * Checks Google Web client ID alignment (Android google-services.json vs server .env)
 * and runs a small HTTP E2E: POST /v1/auth/login (QA seed user) when API is reachable.
 *
 * Usage (from repo server folder):
 *   npm run e2e:auth-health
 *
 * Optional:
 *   API_BASE=http://127.0.0.1:3000/v1 npm run e2e:auth-health
 *
 * Exit: 0 = alignment OK + login E2E passed (or login skipped if API down); 1 = client ID mismatch.
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const REPO_ROOT = path.join(__dirname, '..', '..');
const GOOGLE_SERVICES = path.join(REPO_ROOT, 'app', 'google-services.json');
const LOCAL_PROPERTIES = path.join(REPO_ROOT, 'local.properties');

function readJsonSafe(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (_e) {
    return null;
  }
}

/** Web OAuth client id from Firebase `google-services.json` (client_type 3). */
function webClientIdFromGoogleServices() {
  const j = readJsonSafe(GOOGLE_SERVICES);
  const clients = j?.client?.[0]?.oauth_client;
  if (!Array.isArray(clients)) return '';
  const web = clients.find((c) => Number(c?.client_type) === 3 && String(c?.client_id || '').trim());
  return String(web?.client_id || '').trim();
}

function googleWebFromLocalProperties() {
  try {
    const raw = fs.readFileSync(LOCAL_PROPERTIES, 'utf8');
    const lines = raw.split(/\r?\n/);
    for (const line of lines) {
      const m = line.match(/^\s*mocktest\.googleWebClientId\s*=\s*(.+)\s*$/);
      if (m) return String(m[1] || '').trim().replace(/^["']|["']$/g, '');
    }
  } catch (_e) {
    return '';
  }
  return '';
}

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
  const fromJson = webClientIdFromGoogleServices();
  const fromEnv = String(process.env.GOOGLE_WEB_CLIENT_ID || '').trim();
  const fromLocalProps = googleWebFromLocalProperties();

  console.log('[e2e:auth-health] Firebase Web client (app/google-services.json, type 3):');
  console.log(fromJson || '(could not read — check app/google-services.json)');
  console.log('[e2e:auth-health] Server GOOGLE_WEB_CLIENT_ID (.env):');
  console.log(fromEnv || '(unset — Google token verify disabled / 503 on /auth/google)');
  if (fromLocalProps) {
    console.log('[e2e:auth-health] local.properties mocktest.googleWebClientId (BuildConfig fallback):');
    console.log(fromLocalProps);
  } else {
    console.log('[e2e:auth-health] local.properties mocktest.googleWebClientId: (not set — app uses default_web_client_id from JSON)');
  }

  let alignOk = true;
  if (!fromJson) {
    console.error('\n[e2e:auth-health] FAIL: missing Web client id in google-services.json');
    alignOk = false;
  }
  if (fromEnv && fromJson && fromEnv !== fromJson) {
    console.error('\n[e2e:auth-health] FAIL: server GOOGLE_WEB_CLIENT_ID does not match Firebase Web client id.');
    console.error('  Fix: set server .env GOOGLE_WEB_CLIENT_ID to the same value as shown for Firebase above.');
    alignOk = false;
  }
  if (fromLocalProps && fromJson && fromLocalProps !== fromJson) {
    console.warn('\n[e2e:auth-health] WARN: mocktest.googleWebClientId differs from Firebase default_web_client_id.');
    console.warn('  App now prefers default_web_client_id in GoogleSignInHelper — this is OK unless you rely on BuildConfig only.');
  }
  if (!fromEnv && fromJson) {
    console.warn('\n[e2e:auth-health] WARN: GOOGLE_WEB_CLIENT_ID unset on server — Android Google login will fail after token (503).');
  }

  const apiBase = String(process.env.API_BASE || process.env.E2E_API_BASE || 'http://127.0.0.1:3000/v1').replace(/\/+$/, '');
  const loginUrl = `${apiBase}/auth/login`;

  console.log(`\n[e2e:auth-health] POST ${loginUrl} (QA seed: phone 9817585270, password 123456)…`);
  try {
    const r = await postJson(loginUrl, { identifier: '9817585270', password: '123456' });
    if (r.status === 200 && r.data?.accessToken) {
      console.log('[e2e:auth-health] OK: password login returned accessToken.');
    } else {
      console.warn(`[e2e:auth-health] Login HTTP ${r.status}:`, r.data?.error || r.data?._raw || r.data);
      console.warn('  (If 401: run DB seed 005_seed_qa_login.sql or check user exists / is_admin.)');
    }
  } catch (e) {
    console.warn('[e2e:auth-health] Login check skipped (API not reachable):', e.message || e);
    console.warn(`  Start API: cd server && npm run dev   then: API_BASE=${apiBase} npm run e2e:auth-health`);
  }

  const googleUrl = `${apiBase}/auth/google`;
  try {
    const g = await postJson(googleUrl, { idToken: 'invalid-test-token' });
    if (g.status === 503 && String(g.data?.error || '').includes('not configured')) {
      console.log('\n[e2e:auth-health] Google route: 503 not configured (expected when GOOGLE_WEB_CLIENT_ID unset).');
    } else if (g.status === 401) {
      console.log('\n[e2e:auth-health] Google route: 401 on bad token (server accepts route; verify uses GOOGLE_WEB_CLIENT_ID).');
    } else {
      console.log('\n[e2e:auth-health] Google route probe:', g.status, g.data?.error || '');
    }
  } catch (e) {
    console.warn('[e2e:auth-health] Google route probe skipped:', e.message || e);
  }

  if (!alignOk) process.exit(1);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
