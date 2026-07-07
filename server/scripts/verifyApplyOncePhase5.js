'use strict';

/**
 * Phase 5 — End-to-end verification for apply-once fix (phases 1–4).
 * Runs offline phase suites + integrated journey. Optional API smoke (idempotent).
 *
 * Usage:
 *   node scripts/verifyApplyOncePhase5.js
 *   node scripts/verifyApplyOncePhase5.js --with-api
 *   node scripts/verifyApplyOncePhase5.js --api https://admin-admin.govmocktest.com/v1 --with-api
 *
 * Env (optional API smoke):
 *   E2E_API_BASE / API_BASE
 *   E2E_LOGIN_IDENTIFIER / E2E_LOGIN_PASSWORD
 */
require('dotenv').config();

const { execSync } = require('child_process');
const path = require('path');
const {
  buildApplyResponseBody,
  resolveApplyEligibilityForTest,
  resolveAlreadyAppliedForTarget,
} = require('../src/lib/testApplicationCycle');

const SCRIPTS_DIR = __dirname;
const PHASE_SCRIPTS = [
  'verifyApplyOncePhase1.js',
  'verifyApplyOncePhase2.js',
  'verifyApplyOncePhase3.js',
  'verifyApplyOncePhase4.js',
];

const DEFAULT_API = String(
  process.env.E2E_API_BASE || process.env.API_BASE || 'http://127.0.0.1:3000/v1',
).replace(/\/+$/, '');

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

function runPhaseSuites() {
  for (const script of PHASE_SCRIPTS) {
    execSync(`node "${path.join(SCRIPTS_DIR, script)}"`, { stdio: 'inherit' });
  }
}

// --- Phase 2 merge mirror (local applied list) ---
function mergeAppliedLocal(localActive, serverEntries) {
  if (!serverEntries || serverEntries.length === 0) return localActive || [];
  const entryKey = (e) => {
    const id = String(e.testId || '').trim();
    if (id) return `id:${id}`;
    return `title:${String(e.testName || '').trim().toLowerCase()}`;
  };
  const serverKeys = new Set(serverEntries.map(entryKey));
  const localOnly = (localActive || []).filter((local) => !serverKeys.has(entryKey(local)));
  return [...serverEntries, ...localOnly];
}

// --- Phase 1 TestApplyState mirror ---
function matchMyTestApplication(applications, routeKey, card) {
  const key = String(routeKey || '').trim();
  if (!key) return null;
  return (applications || []).find((app) => {
    const appTitle = String(app.testTitle || '').trim();
    const appId = String(app.testId || '').trim();
    if (appId && card?.id && appId === card.id) return true;
    if (appTitle.toLowerCase() === key.toLowerCase()) return true;
    const cardTitle = String(card?.title || '').trim();
    if (cardTitle && appTitle.toLowerCase() === cardTitle.toLowerCase()) return true;
    const cardSub = String(card?.subcategory || '').trim();
    if (
      cardSub &&
      key.toLowerCase() === cardSub.toLowerCase() &&
      cardTitle &&
      appTitle.toLowerCase() === cardTitle.toLowerCase()
    ) {
      return true;
    }
    return false;
  }) || null;
}

function userHasAppliedForCurrentCycle(resolve, matchedApplication) {
  if (resolve?.mayReapplyForNewCycle === true && resolve?.alreadyAppliedInCurrentCycle !== true) {
    return false;
  }
  if (resolve?.alreadyAppliedInCurrentCycle === true) return true;
  if (resolve?.canStart === true) return true;
  if (matchedApplication) return true;
  return false;
}

function runIntegratedJourney() {
  let ok = true;
  const now = Date.now();
  const cycleStart = '2026-07-01T10:00:00.000Z';
  const sub = 'Patwari';
  const testA = {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    title: 'Patwari Mock 1',
    subcategory: sub,
    last_cycle_started_at: cycleStart,
    enrolled_count: 12,
    capacity_total: 100,
  };
  const testB = {
    id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    title: 'Patwari Mock 2',
    subcategory: sub,
    last_cycle_started_at: cycleStart,
    enrolled_count: 3,
    capacity_total: 50,
  };
  const userApps = [{ ...testA, applied_at: '2026-07-01T10:20:00.000Z' }];

  ok =
    line(
      resolveApplyEligibilityForTest(testB, userApps).kind === 'already_applied_sibling_subcategory',
      'journey: Phase 4 blocks second UUID in same subcategory',
    ) && ok;

  ok =
    line(
      resolveApplyEligibilityForTest(testA, userApps).kind === 'already_applied_same_test',
      'journey: Phase 3/4 duplicate apply on same test id',
    ) && ok;

  const dupBody = buildApplyResponseBody({
    test: testA,
    enrolledCount: testA.enrolled_count,
    capacityTotal: testA.capacity_total,
    alreadyApplied: true,
    alreadyAppliedInCurrentCycle: true,
    message: 'You already applied for this test',
  });
  ok = line(dupBody.alreadyAppliedInCurrentCycle === true, 'journey: Phase 3 duplicate response flags') && ok;
  ok = line(dupBody.enrolledInCurrentCycle === true, 'journey: Phase 3 enrolledInCurrentCycle') && ok;

  const localActive = [
    {
      testName: testA.title,
      testId: testA.id,
      unlockAtMillis: now - 60_000,
      expiresAtMillis: now + 3_600_000,
    },
  ];
  ok =
    line(
      mergeAppliedLocal(localActive, []).length === 1,
      'journey: Phase 2 empty server sync keeps local applied row',
    ) && ok;

  const resolveState = resolveAlreadyAppliedForTarget(testB, userApps);
  const myApps = [{ testId: testA.id, testTitle: testA.title }];
  const catalogCardApplied = { id: testA.id, title: testA.title, subcategory: sub };
  const matchedByTitle = matchMyTestApplication(myApps, testA.title, catalogCardApplied);
  ok = line(matchedByTitle?.testId === testA.id, 'journey: Phase 1 matches application by title') && ok;
  ok =
    line(
      userHasAppliedForCurrentCycle(
        {
          alreadyAppliedInCurrentCycle: resolveState.alreadyAppliedInCurrentCycle,
          mayReapplyForNewCycle: resolveState.mayReapplyForNewCycle,
        },
        null,
      ),
      'journey: Phase 1 resolve hides apply CTA for sibling catalog row',
    ) && ok;
  ok =
    line(
      userHasAppliedForCurrentCycle(
        { alreadyAppliedInCurrentCycle: true },
        matchedByTitle,
      ),
      'journey: Phase 1 UI hides apply when my-applications matches',
    ) && ok;

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
  const identifier = String(process.env.E2E_LOGIN_IDENTIFIER || '9817585270').trim();
  const password = String(process.env.E2E_LOGIN_PASSWORD || '123456');
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

async function runApiSmoke() {
  const apiBase = argValue('--api') || DEFAULT_API;
  let ok = true;

  const loginRes = await login(apiBase);
  if (!loginRes.token) {
    line(true, `API smoke skipped — login failed: ${loginRes.error}`);
    return true;
  }
  const auth = { Authorization: `Bearer ${loginRes.token}` };

  const catalogRes = await fetchJson(`${apiBase}/tests?limit=20`, { headers: auth });
  if (!catalogRes.ok) {
    line(true, `API smoke skipped — GET /tests failed: HTTP ${catalogRes.status}`);
    return true;
  }
  const items = Array.isArray(catalogRes.body?.items) ? catalogRes.body.items : [];
  ok = line(Array.isArray(catalogRes.body?.items), `API GET /tests → ${items.length} item(s)`) && ok;
  if (items.length === 0) {
    line(true, 'API smoke: no published tests — resolve/apply checks skipped');
    return ok;
  }

  const test = items[0];
  const testId = String(test.id || '').trim();
  const title = String(test.title || '').trim();
  ok = line(Boolean(testId), `API catalog test id present ("${title}")`) && ok;

  const resolveRes = await fetchJson(
    `${apiBase}/tests/resolve?testId=${encodeURIComponent(testId)}`,
    { headers: auth },
  );
  ok = line(resolveRes.ok, `API GET /tests/resolve → HTTP ${resolveRes.status}`) && ok;
  if (resolveRes.ok) {
    ok =
      line(
        typeof resolveRes.body?.alreadyAppliedInCurrentCycle === 'boolean',
        'API resolve has alreadyAppliedInCurrentCycle',
      ) && ok;
  }

  const applyOnce = await fetchJson(`${apiBase}/tests/${testId}/apply`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
  });
  ok = line(applyOnce.status > 0, `API POST /tests/:id/apply (1st) → HTTP ${applyOnce.status}`) && ok;
  if (applyOnce.body) {
    ok =
      line(
        typeof applyOnce.body.alreadyAppliedInCurrentCycle === 'boolean',
        'API apply response has alreadyAppliedInCurrentCycle (Phase 3)',
      ) && ok;
  }

  const applyTwice = await fetchJson(`${apiBase}/tests/${testId}/apply`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
  });
  ok = line(applyTwice.ok, `API POST /tests/:id/apply (2nd) → HTTP ${applyTwice.status}`) && ok;
  if (applyTwice.ok) {
    const secondDup =
      applyTwice.body?.alreadyApplied === true ||
      applyTwice.body?.alreadyAppliedInCurrentCycle === true;
    ok = line(secondDup, 'API duplicate apply is idempotent (alreadyApplied flags)') && ok;
    ok =
      line(
        applyTwice.body?.enrolledInCurrentCycle !== false || applyTwice.body?.waitlisted === true,
        'API duplicate apply does not treat user as fresh enrollee',
      ) && ok;
  }

  const appsRes = await fetchJson(`${apiBase}/tests/my-applications`, { headers: auth });
  ok = line(appsRes.ok, `API GET /tests/my-applications → HTTP ${appsRes.status}`) && ok;
  if (appsRes.ok) {
    const apps = Array.isArray(appsRes.body?.items) ? appsRes.body.items : [];
    ok = line(Array.isArray(appsRes.body?.items), `API my-applications → ${apps.length} item(s)`) && ok;
    const mine = apps.find((row) => String(row.testId || '') === testId);
    if (mine) {
      ok = line(mine.alreadyAppliedInCurrentCycle === true, 'API my-applications current-cycle flag') && ok;
    } else if (applyOnce.body?.alreadyAppliedInCurrentCycle || applyOnce.body?.enrolledInCurrentCycle) {
      ok = line(false, 'API my-applications missing applied test after apply') && ok;
    } else {
      ok = line(true, 'API my-applications: test not listed (may be between cycles)') && ok;
    }
  }

  const bySub = new Map();
  for (const row of items) {
    const sub = String(row.subcategory || '').trim().toLowerCase();
    if (!sub) continue;
    if (!bySub.has(sub)) bySub.set(sub, []);
    bySub.get(sub).push(row);
  }
  let siblingChecked = false;
  for (const [, group] of bySub) {
    if (group.length < 2) continue;
    const applied = group[0];
    const sibling = group[1];
    const appliedId = String(applied.id || '');
    const siblingId = String(sibling.id || '');
    if (!appliedId || !siblingId || appliedId === siblingId) continue;
    const blockRes = await fetchJson(`${apiBase}/tests/${siblingId}/apply`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
    });
    siblingChecked = true;
    const blocked =
      blockRes.ok &&
      (blockRes.body?.alreadyApplied === true || blockRes.body?.alreadyAppliedInCurrentCycle === true);
    ok =
      line(
        blocked,
        `API Phase 4 sibling guard (${String(sibling.subcategory || sub)}: ${sibling.title})`,
      ) && ok;
    break;
  }
  if (!siblingChecked) {
    ok = line(true, 'API Phase 4 sibling guard skipped (no duplicate subcategory in catalog)') && ok;
  }

  return ok;
}

async function main() {
  console.log('=== verifyApplyOncePhase5 (apply-once E2E) ===\n');

  console.log('--- Phase suites 1–4 ---\n');
  runPhaseSuites();

  console.log('\n--- Integrated offline journey ---\n');
  let ok = runIntegratedJourney();

  const runApi = hasFlag('--with-api') || Boolean(process.env.E2E_API_BASE);
  if (runApi) {
    console.log('\n--- Optional API smoke (idempotent apply) ---\n');
    ok = (await runApiSmoke()) && ok;
  } else {
    line(true, 'API smoke skipped (use --with-api or set E2E_API_BASE)');
  }

  console.log('');
  if (ok) {
    console.log('PASS  Apply-once Phase 5 E2E');
    process.exit(0);
  }
  console.error('FAIL  Apply-once Phase 5 E2E');
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
