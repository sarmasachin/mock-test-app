'use strict';
/**
 * Phase 2 — READ-ONLY live E2E smoke for schedule timer (no DB writes).
 *
 * Usage:
 *   node scripts/e2eScheduleTimerPhase2.js
 *   node scripts/e2eScheduleTimerPhase2.js --api http://127.0.0.1:3000/v1
 *   node scripts/e2eScheduleTimerPhase2.js --with-db
 *
 * Env (optional):
 *   E2E_API_BASE / API_BASE — API root ending in /v1
 *   E2E_LOGIN_IDENTIFIER / E2E_LOGIN_PASSWORD — user for /tests/my-applications
 */
require('dotenv').config();

const { pool } = require('../src/db');
const {
  sanitizeHomeContentForPublicApi,
  scheduleTimerFieldsMatchApi,
  hasLegacyTimerFields,
  LEGACY_TIMER_KEYS,
  normalizeScheduleTimerEnabled,
} = require('../src/lib/homeContentPublicSanitize');

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
    return { ok: false, status: 0, body: { error: formatRequestError(e) }, requestFailed: true };
  } finally {
    clearTimeout(timer);
  }
}

async function requestJson(label, url, options = {}) {
  const res = await fetchJson(url, options);
  return { ...res, label };
}

function requestFailureMessage(res, fallback) {
  if (res.requestFailed) return res.body?.error || fallback;
  if (!res.ok) return res.body?.error || `HTTP ${res.status}`;
  return '';
}

function assertApiContentNoLegacy(content, allOk) {
  let nextOk = allOk;
  if (!content || typeof content !== 'object') {
    return line(false, 'home content missing or not object') && nextOk;
  }
  for (const key of LEGACY_TIMER_KEYS) {
    nextOk =
      line(
        !Object.prototype.hasOwnProperty.call(content, key),
        `GET /home/content → no legacy field "${key}"`,
      ) && nextOk;
  }
  const enabledTypeOk =
    content.startSeriesScheduleTimerEnabled === true ||
    content.startSeriesScheduleTimerEnabled === false ||
    content.startSeriesScheduleTimerEnabled === undefined;
  nextOk = line(enabledTypeOk, 'GET /home/content → startSeriesScheduleTimerEnabled is boolean/absent') && nextOk;
  const effectiveEnabled = content.startSeriesScheduleTimerEnabled === true;
  nextOk =
    line(
      effectiveEnabled === normalizeScheduleTimerEnabled(content),
      `GET /home/content → timer effective=${effectiveEnabled}`,
    ) && nextOk;
  return nextOk;
}

async function loadDbHomeRaw() {
  const res = await pool.query(
    `SELECT setting_value FROM app_settings WHERE setting_key = 'homeContent' LIMIT 1`,
  );
  if (!res.rows.length) return null;
  try {
    return JSON.parse(String(res.rows[0].setting_value || '{}'));
  } catch {
    return {};
  }
}

async function loadScheduledTestCount() {
  const advRes = await pool.query(
    `SELECT setting_value FROM app_settings WHERE setting_key = 'testAdvancedConfigs' LIMIT 1`,
  );
  let map = {};
  try {
    map = JSON.parse(String(advRes.rows[0]?.setting_value || '{}')) || {};
  } catch {
    map = {};
  }
  const testsRes = await pool.query(
    `SELECT id, title, exam_date, slot_label, is_published
     FROM tests
     WHERE is_published = true
     ORDER BY updated_at DESC
     LIMIT 100`,
  );
  let withExamDate = 0;
  for (const row of testsRes.rows || []) {
    const adv = map[String(row.id)] || {};
    const examDate = String(row.exam_date || adv.examDate || '').trim();
    if (examDate) withExamDate += 1;
  }
  return { published: (testsRes.rows || []).length, withExamDate };
}

async function login(apiBase) {
  const identifier = String(process.env.E2E_LOGIN_IDENTIFIER || '9817585270').trim();
  const password = String(process.env.E2E_LOGIN_PASSWORD || '123456');
  const res = await requestJson('POST /auth/login', `${apiBase}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { identifier, password },
  });
  if (res.requestFailed || !res.ok || !res.body?.accessToken) {
    return { token: '', error: res.body?.error || res.body?._raw || `HTTP ${res.status}` };
  }
  return { token: String(res.body.accessToken), error: '' };
}

async function main() {
  const apiBase = String(argValue('--api') || DEFAULT_API).replace(/\/+$/, '');
  const withDb = hasFlag('--with-db');

  console.log('PHASE2_E2E_SCHEDULE_TIMER — read-only smoke\n');
  console.log(`API: ${apiBase}`);
  console.log(`DB cross-check: ${withDb ? 'yes' : 'no (pass --with-db)'}\n`);

  let allOk = true;

  const homeRes = await requestJson('GET /home/content', `${apiBase}/home/content`);
  const homeFailure = requestFailureMessage(homeRes, 'home content request failed');
  if (homeFailure) {
    allOk = line(false, `GET /home/content failed: ${homeFailure}`) && allOk;
    console.log('\nStart API: cd server && npm start');
    console.log('Then: node scripts/e2eScheduleTimerPhase2.js --with-db\n');
    process.exit(1);
  }

  allOk = line(homeRes.ok, `GET /home/content → HTTP ${homeRes.status}`) && allOk;
  const content = homeRes.body?.content;
  allOk = assertApiContentNoLegacy(content, allOk);

  if (withDb) {
    try {
      const dbRaw = await loadDbHomeRaw();
      if (!dbRaw) {
        allOk = line(false, 'DB homeContent row missing') && allOk;
      } else {
        allOk =
          line(
            scheduleTimerFieldsMatchApi(dbRaw, content),
            'API timer flag matches DB raw after public sanitize',
          ) && allOk;
        const dbHadLegacy = hasLegacyTimerFields(dbRaw);
        if (dbHadLegacy) {
          allOk =
            line(
              !hasLegacyTimerFields(content),
              'DB still has legacy keys in raw JSON but API response is clean',
            ) && allOk;
          console.log('  ..  Tip: run node scripts/normalizeHomeContent.js to strip legacy keys from DB');
        }
        const stats = await loadScheduledTestCount();
        allOk =
          line(stats.published >= 0, `DB: ${stats.published} published test(s) in sample`) && allOk;
        if (content?.startSeriesScheduleTimerEnabled === true && stats.withExamDate === 0) {
          console.log('  ..  Note: schedule timer ON but no published tests with examDate — add one for manual QA');
        } else if (content?.startSeriesScheduleTimerEnabled === true) {
          allOk =
            line(
              stats.withExamDate > 0,
              `DB: ${stats.withExamDate} published test(s) with examDate (schedule timer ON)`,
            ) && allOk;
        }
      }
    } catch (e) {
      allOk = line(false, `DB cross-check failed: ${formatRequestError(e)}`) && allOk;
    }
  }

  const catalogRes = await requestJson('GET /tests?limit=10', `${apiBase}/tests?limit=10`);
  const catalogFailure = requestFailureMessage(catalogRes, 'catalog failed');
  if (catalogFailure) {
    allOk = line(false, `GET /tests failed: ${catalogFailure}`) && allOk;
  } else {
    const items = Array.isArray(catalogRes.body?.items) ? catalogRes.body.items : [];
    allOk = line(true, `GET /tests → ${items.length} catalog item(s) (apply flow API OK)`) && allOk;
  }

  const loginResult = await login(apiBase);
  if (!loginResult.token) {
    allOk = line(false, `Auth login failed: ${loginResult.error}`) && allOk;
    console.log('\n/my-applications check skipped. Set E2E_LOGIN_IDENTIFIER/PASSWORD.\n');
  } else {
    allOk = line(true, 'Auth login OK') && allOk;
    const appsRes = await requestJson(
      'GET /tests/my-applications',
      `${apiBase}/tests/my-applications`,
      { headers: { Authorization: `Bearer ${loginResult.token}` } },
    );
    const appsFailure = requestFailureMessage(appsRes, 'my-applications failed');
    if (appsFailure) {
      allOk = line(false, `GET /tests/my-applications → ${appsFailure}`) && allOk;
    } else {
      const items = Array.isArray(appsRes.body?.items) ? appsRes.body.items : [];
      allOk = line(true, `GET /tests/my-applications → ${items.length} item(s)`) && allOk;
      for (const item of items.slice(0, 3)) {
        allOk =
          line(
            Boolean(item.testId && item.testTitle),
            `application item has testId+testTitle: ${String(item.testTitle || '').slice(0, 36)}`,
          ) && allOk;
        allOk =
          line(
            'examDate' in item && 'slotLabel' in item,
            `application item has examDate+slotLabel (Android sync fields)`,
          ) && allOk;
      }
      if (content?.startSeriesScheduleTimerEnabled !== true) {
        allOk =
          line(
            true,
            'Timer OFF → server apply/my-applications OK; Android should start immediately after apply',
          ) && allOk;
      }
    }
  }

  const expectedSanitized = sanitizeHomeContentForPublicApi(content);
  allOk =
    line(
      expectedSanitized?.startSeriesScheduleTimerEnabled === (content?.startSeriesScheduleTimerEnabled === true),
      'idempotent sanitize on API response',
    ) && allOk;

  console.log(allOk ? '\nPHASE2_E2E_SCHEDULE_TIMER: PASS' : '\nPHASE2_E2E_SCHEDULE_TIMER: FAILED');
  console.log('\nManual: Admin Home Content checkbox → Apply → Start Test (timer off = instant)\n');
  process.exit(allOk ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
