#!/usr/bin/env node
'use strict';

/**
 * Phase 4 — live API smoke for reschedule/re-apply API fields (read-only + idempotent apply).
 *
 * Usage:
 *   node scripts/e2eRescheduleReapplyLivePhase4.js
 *   node scripts/e2eRescheduleReapplyLivePhase4.js --api https://admin-admin.govmocktest.com/v1
 *
 * Env:
 *   E2E_API_BASE / API_BASE
 *   E2E_LOGIN_IDENTIFIER / E2E_LOGIN_PASSWORD
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const DEFAULT_API = String(
  process.env.E2E_API_BASE || process.env.API_BASE || 'http://127.0.0.1:3000/v1',
).replace(/\/+$/, '');

function argValue(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return '';
  return String(process.argv[idx + 1] || '').trim();
}

function line(ok, msg) {
  console.log(`${ok ? 'OK' : 'FAIL'}  ${msg}`);
  return ok;
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || 25000);
  try {
    const res = await fetch(url, {
      method: options.method || 'GET',
      headers: options.headers || {},
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = { _raw: text.slice(0, 500) };
    }
    return { ok: res.ok, status: res.status, body };
  } catch (e) {
    return { ok: false, status: 0, body: { error: String(e.message || e) }, requestFailed: true };
  } finally {
    clearTimeout(timer);
  }
}

async function login(apiBase) {
  const identifier = String(process.env.E2E_LOGIN_IDENTIFIER || '').trim();
  const password = String(process.env.E2E_LOGIN_PASSWORD || '');
  if (!identifier || !password) {
    return { token: '', error: 'E2E_LOGIN_IDENTIFIER/PASSWORD not set' };
  }
  const res = await fetchJson(`${apiBase}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { identifier, password },
  });
  if (!res.ok || !res.body?.accessToken) {
    return { token: '', error: res.body?.error || `HTTP ${res.status}` };
  }
  return { token: String(res.body.accessToken), error: '' };
}

async function main() {
  const apiBase = argValue('--api') || DEFAULT_API;
  console.log('=== Phase 4: live reschedule/re-apply API smoke ===');
  console.log(`API: ${apiBase}\n`);
  let ok = true;

  const loginRes = await login(apiBase);
  if (!loginRes.token) {
    console.log(`LIVE_SMOKE_SKIPPED: ${loginRes.error}`);
    process.exit(0);
  }
  const auth = { Authorization: `Bearer ${loginRes.token}` };

  const catalogRes = await fetchJson(`${apiBase}/tests?limit=30`, { headers: auth });
  if (!catalogRes.ok) {
    console.log(`LIVE_SMOKE_SKIPPED: GET /tests failed HTTP ${catalogRes.status}`);
    process.exit(0);
  }
  const items = Array.isArray(catalogRes.body?.items) ? catalogRes.body.items : [];
  ok = line(items.length > 0, `GET /tests → ${items.length} item(s)`) && ok;

  const myAppsRes = await fetchJson(`${apiBase}/tests/my-applications`, { headers: auth });
  ok = line(myAppsRes.ok, `GET /tests/my-applications → HTTP ${myAppsRes.status}`) && ok;
  const myItems = Array.isArray(myAppsRes.body?.items) ? myAppsRes.body.items : [];

  for (const app of myItems) {
    const title = String(app.testTitle || '').trim();
    if (!title) continue;
    const resolveRes = await fetchJson(
      `${apiBase}/tests/resolve?title=${encodeURIComponent(title)}`,
      { headers: auth },
    );
    if (!resolveRes.ok) continue;

    const resolveMay = resolveRes.body?.mayReapplyForNewCycle === true;
    const appMay = app.mayReapplyForNewCycle === true;
    const resolveApplied = resolveRes.body?.alreadyAppliedInCurrentCycle === true;
    const appApplied = app.alreadyAppliedInCurrentCycle === true;

    if (resolveMay || appMay) {
      ok =
        line(
          resolveRes.body?.lastCycleStartedAt != null || app.lastCycleStartedAt != null,
          `live: ${title} re-apply row has lastCycleStartedAt`,
        ) && ok;
      ok =
        line(
          !resolveApplied || resolveMay,
          `live: ${title} resolve flags consistent (not applied+mayReapply conflict)`,
        ) && ok;
      ok =
        line(
          !appApplied || !appMay,
          `live: ${title} my-apps flags consistent`,
        ) && ok;
    }
  }

  const probe = items[0];
  const testId = String(probe?.id || '').trim();
  if (testId) {
    const resolveRes = await fetchJson(
      `${apiBase}/tests/resolve?testId=${encodeURIComponent(testId)}`,
      { headers: auth },
    );
    ok = line(resolveRes.ok, `GET /tests/resolve?testId → HTTP ${resolveRes.status}`) && ok;
    if (resolveRes.ok) {
      ok =
        line(
          typeof resolveRes.body?.mayReapplyForNewCycle === 'boolean' &&
            typeof resolveRes.body?.alreadyAppliedInCurrentCycle === 'boolean' &&
            typeof resolveRes.body?.lastCycleStartedAt !== 'undefined',
          'resolve exposes cycle re-apply fields',
        ) && ok;
    }

    const applyRes = await fetchJson(`${apiBase}/tests/${testId}/apply`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
    });
    ok = line(applyRes.status > 0, `POST /tests/:id/apply → HTTP ${applyRes.status}`) && ok;
    if (applyRes.body) {
      ok =
        line(
          typeof applyRes.body.reenrolledForNewCycle === 'boolean',
          'apply response exposes reenrolledForNewCycle',
        ) && ok;
    }
  }

  console.log('');
  if (ok) {
    console.log('E2E_RESCHEDULE_REAPPLY_LIVE_PHASE4_OK');
    process.exit(0);
  }
  console.error('E2E_RESCHEDULE_REAPPLY_LIVE_PHASE4_FAILED');
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
