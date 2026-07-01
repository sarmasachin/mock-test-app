'use strict';
/**
 * Phase 7 — READ-ONLY apply cycle E2E smoke (no DB writes, no test mutations).
 *
 * Usage:
 *   node scripts/e2eTestApplyCycle.js
 *   node scripts/e2eTestApplyCycle.js --api https://admin-admin.govmocktest.com/v1
 *   node scripts/e2eTestApplyCycle.js --with-db
 *
 * Env (optional):
 *   E2E_API_BASE / API_BASE — API root ending in /v1
 *   E2E_LOGIN_IDENTIFIER / E2E_LOGIN_PASSWORD — user for resolve API
 *   PHASE7_TEST_TITLE — specific test title to resolve-check
 */
require('dotenv').config();

const { pool } = require('../src/db');
const { loadPublishScheduleItemsSafe } = require('../src/lib/testResolve');
const { evaluateApplyCyclePhase } = require('../src/lib/applyCycleE2eScenarios');

const DEFAULT_API = String(process.env.E2E_API_BASE || process.env.API_BASE || 'http://127.0.0.1:3000/v1').replace(
  /\/+$/,
  '',
);

function argValue(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return '';
  return String(process.argv[idx + 1] || '').trim();
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function line(ok, msg) {
  console.log(`${ok ? 'OK' : '!!'}  ${msg}`);
  return ok;
}

function formatRequestError(e) {
  if (!e) return 'unknown error';
  if (e.name === 'AbortError') return 'request timed out';
  return String(e.message || e);
}

function failedResponse(errorMessage) {
  return {
    ok: false,
    status: 0,
    body: { error: errorMessage },
    requestFailed: true,
  };
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
    return { ok: res.ok, status: res.status, body, requestFailed: false };
  } catch (e) {
    return failedResponse(formatRequestError(e));
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Per-request wrapper — never throws; logs label on unexpected errors in caller.
 */
async function requestJson(label, url, options = {}) {
  try {
    const res = await fetchJson(url, options);
    if (res.requestFailed) {
      return { ...res, label, error: res.body?.error || 'request failed' };
    }
    return { ...res, label, error: '' };
  } catch (e) {
    const error = formatRequestError(e);
    return { ...failedResponse(error), label, error };
  }
}

async function login(apiBase) {
  const label = 'POST /auth/login';
  try {
    const identifier = String(process.env.E2E_LOGIN_IDENTIFIER || '9817585270').trim();
    const password = String(process.env.E2E_LOGIN_PASSWORD || '123456');
    const res = await requestJson(label, `${apiBase}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { identifier, password },
    });
    if (res.requestFailed || res.error) {
      return { token: '', error: `${label}: ${res.error}` };
    }
    if (!res.ok || !res.body?.accessToken) {
      return { token: '', error: `${label}: ${res.body?.error || `HTTP ${res.status}`}` };
    }
    return { token: String(res.body.accessToken), error: '' };
  } catch (e) {
    return { token: '', error: `${label}: ${formatRequestError(e)}` };
  }
}

async function loadAdvancedMap(db) {
  const res = await db.query(
    `SELECT setting_value FROM app_settings WHERE setting_key = 'testAdvancedConfigs' LIMIT 1`,
  );
  try {
    return JSON.parse(String(res.rows[0]?.setting_value || '{}')) || {};
  } catch {
    return {};
  }
}

function resolveAdv(map, testId) {
  const key = String(testId || '').trim();
  if (map[key]) return map[key];
  const lower = key.toLowerCase();
  for (const [k, v] of Object.entries(map || {})) {
    if (String(k).trim().toLowerCase() === lower) return v;
  }
  return null;
}

async function loadDbTestsForCrossCheck() {
  const advancedMap = await loadAdvancedMap(pool);
  const publishScheduleItems = await loadPublishScheduleItemsSafe(pool);
  const nowMs = Date.now();
  const testsRes = await pool.query(
    `SELECT id, title, slug, is_published, duration_minutes, last_cycle_started_at, valid_until
     FROM tests
     ORDER BY updated_at DESC
     LIMIT 50`,
  );
  return (testsRes.rows || []).map((row) => {
    const advancedConfig = resolveAdv(advancedMap, row.id) || {};
    const evaluation = evaluateApplyCyclePhase({
      row,
      advancedConfig,
      publishScheduleItems,
      nowMs,
      appliedAtIso: null,
    });
    return {
      id: String(row.id),
      title: String(row.title || ''),
      evaluation,
    };
  });
}

function requestFailureMessage(res, fallback) {
  if (res.requestFailed || res.error) {
    return res.error || fallback;
  }
  if (!res.ok) {
    return res.body?.error || `HTTP ${res.status}`;
  }
  return '';
}

async function checkResolveByTitle({ apiBase, authHeaders, title, catalogRes, allOk }) {
  const label = `GET /tests/resolve?title=${title}`;
  let nextOk = allOk;
  try {
    const resolveRes = await requestJson(
      label,
      `${apiBase}/tests/resolve?title=${encodeURIComponent(title)}`,
      { headers: authHeaders },
    );
    const failure = requestFailureMessage(resolveRes, 'resolve failed');
    if (failure) {
      nextOk = line(false, `${label} → ${failure}`) && nextOk;
      return nextOk;
    }

    const payload = resolveRes.body || {};
    nextOk = line(payload.found === true, `resolve "${title}" → found`) && nextOk;
    if (!payload.found) {
      return nextOk;
    }

    nextOk = line(Boolean(payload.id), `resolve "${title}" → has id`) && nextOk;
    nextOk =
      line(
        typeof payload.catalogVisible === 'boolean' && typeof payload.canApply === 'boolean',
        `resolve "${title}" → catalogVisible + canApply booleans`,
      ) && nextOk;

    if (payload.cyclePhase === 'between_cycles') {
      nextOk = line(payload.canApply === false, `resolve "${title}" between_cycles → canApply false`) && nextOk;
    }

    const inCatalog =
      catalogRes.ok &&
      Array.isArray(catalogRes.body?.items) &&
      catalogRes.body.items.some((x) => String(x.id) === String(payload.id));

    if (inCatalog) {
      nextOk =
        line(payload.catalogVisible === true, `resolve "${title}" in catalog → catalogVisible true`) && nextOk;
    } else if (payload.cyclePhase === 'live') {
      nextOk =
        line(
          payload.catalogVisible === false,
          `resolve "${title}" live but not in catalog → catalogVisible false (visibility window)`,
        ) && nextOk;
    }
  } catch (e) {
    nextOk = line(false, `${label} → ${formatRequestError(e)}`) && nextOk;
  }
  return nextOk;
}

async function checkResolveByTestId({ apiBase, authHeaders, test, allOk }) {
  const label = `GET /tests/resolve?testId=${test.id.slice(0, 8)}…`;
  let nextOk = allOk;
  try {
    const resolveRes = await requestJson(label, `${apiBase}/tests/resolve?testId=${encodeURIComponent(test.id)}`, {
      headers: authHeaders,
    });
    const failure = requestFailureMessage(resolveRes, 'resolve failed');
    if (failure) {
      nextOk = line(false, `${label} → ${failure}`) && nextOk;
      return nextOk;
    }

    const apiPhase = String(resolveRes.body?.cyclePhase || '');
    const expected = test.evaluation.resolve.cyclePhase;
    nextOk =
      line(apiPhase === expected, `API vs DB phase match "${test.title}" (${expected})`) && nextOk;
  } catch (e) {
    nextOk = line(false, `${label} → ${formatRequestError(e)}`) && nextOk;
  }
  return nextOk;
}

async function main() {
  const apiBase = String(argValue('--api') || DEFAULT_API).replace(/\/+$/, '');
  const withDb = hasFlag('--with-db');
  const titleQ = String(process.env.PHASE7_TEST_TITLE || argValue('--title') || '').trim();

  console.log('PHASE7_E2E_APPLY_CYCLE — read-only smoke\n');
  console.log(`API: ${apiBase}`);
  console.log(`DB cross-check: ${withDb ? 'yes' : 'no (pass --with-db)'}\n`);

  let allOk = true;

  try {
    const catalogRes = await requestJson('GET /tests?limit=50', `${apiBase}/tests?limit=50`);
    const catalogFailure = requestFailureMessage(catalogRes, 'catalog request failed');
    if (catalogFailure) {
      allOk = line(false, `GET /tests failed: ${catalogFailure}`) && allOk;
    } else {
      const items = Array.isArray(catalogRes.body?.items) ? catalogRes.body.items : [];
      allOk = line(true, `GET /tests → ${items.length} catalog item(s)`) && allOk;
      for (const item of items.slice(0, 5)) {
        allOk =
          line(Boolean(item.id && item.title), `catalog item has id+title: ${String(item.title || '').slice(0, 40)}`) &&
          allOk;
      }
    }

    const loginResult = await login(apiBase);
    if (!loginResult.token) {
      allOk = line(false, `Auth login skipped/failed: ${loginResult.error || 'no token'}`) && allOk;
      console.log('\nResolve API checks skipped (login required). Set E2E_LOGIN_IDENTIFIER/PASSWORD.\n');
    } else {
      allOk = line(true, 'Auth login OK — resolve API checks enabled') && allOk;
      const authHeaders = { Authorization: `Bearer ${loginResult.token}` };

      const titlesToCheck = new Set();
      if (titleQ) titlesToCheck.add(titleQ);
      if (catalogRes.ok && Array.isArray(catalogRes.body?.items)) {
        for (const item of catalogRes.body.items.slice(0, 3)) {
          if (item?.title) titlesToCheck.add(String(item.title));
        }
      }

      if (!titlesToCheck.size && withDb) {
        try {
          const dbTests = await loadDbTestsForCrossCheck();
          for (const t of dbTests.slice(0, 3)) {
            if (t.title) titlesToCheck.add(t.title);
          }
        } catch (e) {
          allOk =
            line(false, `DB load for resolve titles failed: ${formatRequestError(e)}`) && allOk;
        }
      }

      if (!titlesToCheck.size) {
        allOk = line(true, 'No titles to resolve-check (set PHASE7_TEST_TITLE or use --with-db)') && allOk;
      }

      for (const title of titlesToCheck) {
        allOk = await checkResolveByTitle({
          apiBase,
          authHeaders,
          title,
          catalogRes,
          allOk,
        });
      }
    }

    if (withDb) {
      console.log('\n=== DB cross-check (read-only) ===\n');
      try {
        const dbTests = await loadDbTestsForCrossCheck();
        allOk = line(dbTests.length >= 0, `DB tests loaded: ${dbTests.length}`) && allOk;
        const between = dbTests.filter((t) => t.evaluation.resolve.cyclePhase === 'between_cycles');
        const live = dbTests.filter((t) => t.evaluation.resolve.cyclePhase === 'live');
        console.log(`  Live phase: ${live.length}, Between cycles: ${between.length}`);

        for (const t of between.slice(0, 5)) {
          allOk =
            line(
              t.evaluation.catalogListed === false,
              `DB "${t.title}" between_cycles → not catalog-listed`,
            ) && allOk;
        }
        for (const t of live.slice(0, 5)) {
          allOk = line(t.evaluation.catalogListed === true, `DB "${t.title}" live → catalog-visible`) && allOk;
        }

        if (loginResult.token) {
          const authHeaders = { Authorization: `Bearer ${loginResult.token}` };
          for (const t of between.slice(0, 3)) {
            allOk = await checkResolveByTestId({
              apiBase,
              authHeaders,
              test: t,
              allOk,
            });
          }
        } else {
          allOk = line(true, 'API vs DB phase match skipped (login required)') && allOk;
        }
      } catch (dbErr) {
        allOk = line(false, `DB cross-check failed: ${formatRequestError(dbErr)}`) && allOk;
      }
    }
  } catch (e) {
    allOk = line(false, `unexpected smoke error: ${formatRequestError(e)}`) && allOk;
  }

  console.log('\nManual QA: publish test → apply → wait cycle → resolve shows between_cycles → republish → re-apply');
  console.log('Runbook: server/PHASE7_APPLY_CYCLE_RUNBOOK.txt\n');
  console.log(allOk ? 'PHASE7_E2E_OK' : 'PHASE7_E2E_NEEDS_ATTENTION');
  process.exit(allOk ? 0 : 1);
}

main()
  .catch((e) => {
    console.error('PHASE7_E2E_FATAL', e);
    process.exit(1);
  })
  .finally(() => pool.end().catch(() => {}));
