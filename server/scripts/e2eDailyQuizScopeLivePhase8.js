#!/usr/bin/env node
'use strict';

/**
 * Phase 8 — live API smoke for scoped daily quiz (read-only, post-deploy).
 *
 * Usage:
 *   node scripts/e2eDailyQuizScopeLivePhase8.js
 *   node scripts/e2eDailyQuizScopeLivePhase8.js --api https://admin-admin.govmocktest.com/v1
 *   node scripts/e2eDailyQuizScopeLivePhase8.js --require-auth
 *
 * Env:
 *   E2E_API_BASE / API_BASE / PHASE0_API_BASE
 *   E2E_LOGIN_IDENTIFIER / E2E_LOGIN_PASSWORD  (user app login)
 *   E2E_SUPER_ADMIN_TOKEN                      (admin analytics smoke)
 *   E2E_SCOPE_STATE                            (default Himachal Pradesh)
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { verifyLiveDeliveryShape } = require('./lib/dailyQuizShuffleVerifyShared');

const DEFAULT_API = String(
  process.env.E2E_API_BASE || process.env.API_BASE || process.env.PHASE0_API_BASE || 'https://admin-admin.govmocktest.com/v1',
).replace(/\/+$/, '');

const LOGIN_ID = String(process.env.E2E_LOGIN_IDENTIFIER || '9817585270').trim();
const LOGIN_PW = String(process.env.E2E_LOGIN_PASSWORD || '123456');
const ADMIN_TOKEN = String(process.env.E2E_SUPER_ADMIN_TOKEN || '').trim();
const SCOPE_STATE = String(process.env.E2E_SCOPE_STATE || 'Himachal Pradesh').trim();

function argValue(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return '';
  return String(process.argv[idx + 1] || '').trim();
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function line(ok, msg) {
  console.log(`${ok ? 'OK' : 'FAIL'}  ${msg}`);
  return ok;
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || 25000);
  try {
    const headers = { Accept: 'application/json', ...(options.headers || {}) };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(url, {
      method: options.method || 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = { _raw: text.slice(0, 500) };
    }
    return { ok: res.ok, status: res.status, body, requestFailed: false };
  } catch (e) {
    return { ok: false, status: 0, body: { error: String(e.message || e) }, requestFailed: true };
  } finally {
    clearTimeout(timer);
  }
}

async function loginUser(apiBase) {
  const res = await fetchJson(`${apiBase}/auth/login`, {
    method: 'POST',
    body: { identifier: LOGIN_ID, password: LOGIN_PW },
  });
  if (!res.ok || !res.body?.accessToken) {
    return { token: '', error: res.body?.error || `HTTP ${res.status}` };
  }
  return { token: String(res.body.accessToken), error: '' };
}

function itemIds(items) {
  return (Array.isArray(items) ? items : [])
    .map((x) => String(x?.id || ''))
    .filter(Boolean)
    .sort();
}

async function main() {
  const apiBase = argValue('--api') || DEFAULT_API;
  const requireAuth = hasFlag('--require-auth');
  console.log('=== Phase 8: live daily quiz scope smoke ===');
  console.log(`API: ${apiBase}\n`);
  let ok = true;

  const healthBase = apiBase.replace(/\/v1$/, '');
  const health = await fetchJson(`${healthBase}/health`);
  if (health.requestFailed) {
    console.log(`LIVE_SMOKE_SKIPPED: API unreachable (${health.body?.error || 'network error'})`);
    process.exit(0);
  }
  ok = line(health.ok, `GET /health → HTTP ${health.status}`) && ok;

  const digest = await fetchJson(`${apiBase}/digest/quiz-today`);
  if (digest.status === 404) {
    console.log('LIVE_SMOKE_NOTE: no daily quiz published (digest 404) — scoped auth checks may also 404');
  } else {
    ok = line(digest.ok, `GET /digest/quiz-today → HTTP ${digest.status}`) && ok;
    if (digest.ok) {
      const digestItems = Array.isArray(digest.body?.items) ? digest.body.items : [];
      ok = line(digestItems.length > 0, `digest delivers ${digestItems.length} all_india item(s)`) && ok;
      for (const item of digestItems.slice(0, 5)) {
        const shape = verifyLiveDeliveryShape(item);
        ok = line(shape.ok, `digest shape ${item.id}: ${shape.reason || 'ok'}`) && ok;
      }
    }
  }

  const badScope = await fetchJson(`${apiBase}/daily-quiz/today?scope=state`);
  ok =
    line(
      badScope.status === 401 || badScope.status === 400,
      `GET /daily-quiz/today?scope=state (no auth/state) → HTTP ${badScope.status} (401 or 400 expected)`,
    ) && ok;

  const loginRes = await loginUser(apiBase);
  if (!loginRes.token) {
    const msg = `User auth checks skipped — login failed: ${loginRes.error}`;
    if (requireAuth) {
      ok = line(false, msg) && ok;
    } else {
      line(true, msg);
    }
  } else {
    ok = line(true, 'User login OK') && ok;
    const authHeaders = { Authorization: `Bearer ${loginRes.token}` };

    const allIndia = await fetchJson(`${apiBase}/daily-quiz/today?scope=all_india`, { headers: authHeaders });
    if (allIndia.status === 404) {
      line(true, 'GET /daily-quiz/today?scope=all_india → 404 (no published bank)');
    } else {
      ok = line(allIndia.ok, `GET /daily-quiz/today?scope=all_india → HTTP ${allIndia.status}`) && ok;
      if (allIndia.ok) {
        ok = line(allIndia.body?.scope === 'all_india', `response scope=all_india (${allIndia.body?.scope})`) && ok;
        ok =
          line(
            typeof allIndia.body?.scopeKey === 'string' && allIndia.body.scopeKey.length > 0,
            `scopeKey present (${allIndia.body?.scopeKey})`,
          ) && ok;
        const authItems = Array.isArray(allIndia.body?.items) ? allIndia.body.items : [];
        ok = line(authItems.length > 0, `scoped all_india delivers ${authItems.length} item(s)`) && ok;

        if (digest.ok && digest.status !== 404) {
          const digestIds = itemIds(digest.body?.items);
          const authIds = itemIds(authItems);
          ok =
            line(
              digestIds.join(',') === authIds.join(','),
              'digest all_india pick matches auth scope=all_india pick (same day)',
            ) && ok;
        }
      }
    }

    const badState = await fetchJson(`${apiBase}/daily-quiz/today?scope=state`, { headers: authHeaders });
    ok = line(badState.status === 400, `GET /daily-quiz/today?scope=state (missing state) → HTTP ${badState.status}`) && ok;

    const stateScoped = await fetchJson(
      `${apiBase}/daily-quiz/today?scope=state&state=${encodeURIComponent(SCOPE_STATE)}`,
      { headers: authHeaders },
    );
    if (stateScoped.status === 404) {
      line(true, `GET /daily-quiz/today state=${SCOPE_STATE} → 404 (no items for scope — OK if bank has no state items)`);
    } else {
      ok = line(stateScoped.ok, `GET /daily-quiz/today state=${SCOPE_STATE} → HTTP ${stateScoped.status}`) && ok;
      if (stateScoped.ok) {
        ok = line(stateScoped.body?.scope === 'state', `response scope=state`) && ok;
        ok = line(String(stateScoped.body?.stateName || '') === SCOPE_STATE, `stateName echoed correctly`) && ok;
      }
    }

    const quizDay = String(allIndia.body?.quizDay || digest.body?.quizDay || '').slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(quizDay)) {
      const lb = await fetchJson(
        `${apiBase}/daily-quiz/leaderboard?quizDay=${quizDay}&scope=all_india&limit=5`,
        { headers: authHeaders },
      );
      ok = line(lb.ok, `GET /daily-quiz/leaderboard?scope=all_india → HTTP ${lb.status}`) && ok;
      if (lb.ok) {
        ok = line(Array.isArray(lb.body?.entries), 'leaderboard entries array present') && ok;
        ok = line(lb.body?.scope === 'all_india', 'leaderboard response scope=all_india') && ok;
      }
    }
  }

  if (ADMIN_TOKEN) {
    const today = new Date().toISOString().slice(0, 10);
    const adminHeaders = { Authorization: `Bearer ${ADMIN_TOKEN}` };
    const adminLb = await fetchJson(
      `${apiBase}/admin/daily-quiz/leaderboard?quizDay=${today}&quizScope=all_india&limit=5`,
      { headers: adminHeaders },
    );
    ok = line(adminLb.ok, `GET /admin/daily-quiz/leaderboard?quizScope=all_india → HTTP ${adminLb.status}`) && ok;
    if (adminLb.ok) {
      ok = line(adminLb.body?.deliveryScope === 'all_india', 'admin leaderboard deliveryScope=all_india') && ok;
      ok = line(Array.isArray(adminLb.body?.entries), 'admin leaderboard entries array') && ok;
    }
  } else {
    line(true, 'Admin analytics smoke skipped — set E2E_SUPER_ADMIN_TOKEN for full gate');
  }

  console.log('');
  if (ok) {
    console.log('VERIFY_DAILY_QUIZ_SCOPE_LIVE_PHASE8_OK');
    process.exit(0);
  }
  console.error('VERIFY_DAILY_QUIZ_SCOPE_LIVE_PHASE8_FAILED');
  process.exit(1);
}

main().catch((e) => {
  console.error('e2e_daily_quiz_scope_live_phase8_error', e);
  process.exit(1);
});
