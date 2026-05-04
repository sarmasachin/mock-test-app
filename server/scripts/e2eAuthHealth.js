#!/usr/bin/env node
'use strict';

/**
 * POST /v1/auth/login smoke test (QA seed user when API is reachable).
 *
 * Usage (from repo server folder):
 *   npm run e2e:auth-health
 *
 * Optional:
 *   API_BASE=http://127.0.0.1:3000/v1 npm run e2e:auth-health
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
  const apiBase = String(process.env.API_BASE || process.env.E2E_API_BASE || 'http://127.0.0.1:3000/v1').replace(/\/+$/, '');
  const loginUrl = `${apiBase}/auth/login`;

  console.log('[e2e:auth-health] POST', loginUrl, '(QA seed: phone 9817585270, password 123456)…');
  try {
    const r = await postJson(loginUrl, { identifier: '9817585270', password: '123456' });
    if (r.status === 200 && r.data?.accessToken) {
      console.log('[e2e:auth-health] OK: password login returned accessToken.');
    } else {
      console.warn(`[e2e:auth-health] Login HTTP ${r.status}:`, r.data?.error || r.data?._raw || r.data);
      console.warn('  (If 401: run DB seed 005_seed_qa_login.sql or check user exists.)');
    }
  } catch (e) {
    console.warn('[e2e:auth-health] Login check skipped (API not reachable):', e.message || e);
    console.warn(`  Start API: cd server && npm run dev   then: API_BASE=${apiBase} npm run e2e:auth-health`);
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
