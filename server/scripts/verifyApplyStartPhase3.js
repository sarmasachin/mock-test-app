'use strict';
/**
 * Phase 3 verify — admin test readiness + apply/start access rules (read-only by default).
 *
 * Usage:
 *   node scripts/verifyApplyStartPhase3.js
 *   node scripts/verifyApplyStartPhase3.js --with-auth-apply
 *
 * Env:
 *   E2E_LOGIN_IDENTIFIER / E2E_LOGIN_PASSWORD — optional auth apply smoke
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), override: true });

const { pool } = require('../src/db');
const { evaluateTestStartAccess } = require('../src/lib/testStartAccess');
const { loadScheduleTimerEnabled } = require('../src/lib/testStartAccess');
const { resolveTestCyclePhase } = require('../src/lib/testResolve');
const { catalogVisibilityError } = require('../src/lib/testVisibility');

function line(ok, msg) {
  console.log(`${ok ? 'OK' : '!!'}  ${msg}`);
  return ok;
}

async function loadAdvancedConfigMap(db) {
  try {
    const { rows } = await db.query(
      `SELECT setting_value FROM app_settings WHERE setting_key = 'testAdvancedConfigs' LIMIT 1`,
    );
    const parsed = JSON.parse(String(rows?.[0]?.setting_value || '{}'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_e) {
    return {};
  }
}

function resolveAdvancedConfigForTest(advancedMap, testId) {
  const key = String(testId || '').trim();
  if (!key || !advancedMap || typeof advancedMap !== 'object') return {};
  return advancedMap[key] && typeof advancedMap[key] === 'object' ? advancedMap[key] : {};
}

function normalizeTestAdvancedConfig(rawValue) {
  const raw = rawValue && typeof rawValue === 'object' ? rawValue : {};
  return {
    publishAt: String(raw.publishAt || '').trim() || null,
    unpublishAt: String(raw.unpublishAt || '').trim() || null,
    lateJoinMinutes: Math.max(0, Number(raw.lateJoinMinutes || 0)),
  };
}

function resolveExamDate(row) {
  if (!row) return null;
  if (row.dynamic_date_enabled === true && row.date_cycle_days > 0 && row.last_cycle_started_at) {
    const start = new Date(row.last_cycle_started_at);
    if (!Number.isNaN(start.getTime())) {
      return start.toISOString().slice(0, 10);
    }
  }
  if (row.exam_date) {
    const d = new Date(row.exam_date);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  return null;
}

async function auditPublishedTests(db) {
  const advancedMap = await loadAdvancedConfigMap(db);
  const scheduleTimerEnabled = await loadScheduleTimerEnabled(db);
  const { rows } = await db.query(
    `SELECT id, title, subcategory, is_published, capacity_total, enrolled_count,
            exam_date, slot_label, dynamic_date_enabled, date_cycle_days,
            last_cycle_started_at, valid_until
     FROM tests
     WHERE is_published = true
     ORDER BY title ASC`,
  );

  let ok = line(
    scheduleTimerEnabled === false || scheduleTimerEnabled === true,
    `scheduleTimerEnabled=${scheduleTimerEnabled}`,
  );

  if (rows.length === 0) {
    ok = line(false, 'No published tests in DB — admin must publish at least one test') && ok;
    return { ok, scheduleTimerEnabled, rows: [] };
  }

  ok = line(rows.length > 0, `${rows.length} published test(s) in DB`) && ok;

  for (const row of rows) {
    const title = String(row.title || 'Test');
    const sub = String(row.subcategory || '').trim();
    const capacity = Math.max(0, Number(row.capacity_total || 0));
    const adv = normalizeTestAdvancedConfig(resolveAdvancedConfigForTest(advancedMap, row.id));
    const catalogError = catalogVisibilityError(row, adv);
    const cyclePhase = resolveTestCyclePhase(row, adv, Date.now(), []);
    const examDate = resolveExamDate(row);
    const slotLabel = String(row.slot_label || '');

    if (!sub) {
      ok = line(false, `"${title}": missing subcategory — won't match home/tests category filter`) && ok;
    } else {
      ok = line(true, `"${title}": subcategory="${sub}"`) && ok;
    }

    if (capacity <= 0) {
      ok = line(false, `"${title}": capacity_total=0 — app shows "0 seats left" (set capacity > 0 in admin)`) && ok;
    } else {
      ok = line(true, `"${title}": capacity=${capacity}`) && ok;
    }

    if (catalogError) {
      ok = line(false, `"${title}": catalog blocked — ${catalogError}`) && ok;
    }

    if (scheduleTimerEnabled && !examDate) {
      ok = line(
        false,
        `"${title}": schedule timer ON but exam_date missing — start will stay blocked after apply`,
      ) && ok;
    } else if (scheduleTimerEnabled && examDate) {
      ok = line(true, `"${title}": schedule timer ON, exam_date=${examDate} slot="${slotLabel}"`) && ok;
    }

    const startAccess = evaluateTestStartAccess({
      alreadyAppliedInCurrentCycle: true,
      scheduleTimerEnabled,
      cyclePhase,
      catalogError,
      examDate,
      slotLabel,
      lateJoinMinutes: adv.lateJoinMinutes,
      attemptAccess: { allowed: true },
      row,
      advancedConfig: adv,
    });

    if (!scheduleTimerEnabled) {
      const scheduled = Boolean(String(examDate || '').trim()) && Boolean(slotLabel);
      if (!scheduled) {
        ok = line(
          startAccess.canStart === true,
          `"${title}": timer OFF + no schedule → canStart=${startAccess.canStart}`,
        ) && ok;
      } else {
        ok = line(
          typeof startAccess.canStart === 'boolean',
          `"${title}": timer OFF + scheduled → canStart=${startAccess.canStart} (${startAccess.startBlockReason || 'ready'})`,
        ) && ok;
      }
    } else {
      ok = line(
        typeof startAccess.canStart === 'boolean',
        `"${title}": timer ON + applied → canStart=${startAccess.canStart} (${startAccess.startBlockReason || 'ready'})`,
      ) && ok;
    }
  }

  return { ok, scheduleTimerEnabled, rows };
}

async function staticAndroidApplyStartCheck() {
  const fs = require('fs');
  const path = require('path');
  const repoPath = path.join(
    __dirname, '..', '..', 'app', 'src', 'main', 'java', 'com', 'freemocktest', 'app', 'data', 'ContentRepository.kt',
  );
  const prefsPath = path.join(
    __dirname, '..', '..', 'app', 'src', 'main', 'java', 'com', 'freemocktest', 'app', 'data', 'AppPreferencesRepository.kt',
  );
  const navPath = path.join(
    __dirname, '..', '..', 'app', 'src', 'main', 'java', 'com', 'freemocktest', 'app', 'newui', 'navigation', 'MainBottomNavHost.kt',
  );
  const repoSrc = fs.readFileSync(repoPath, 'utf8');
  const prefsSrc = fs.readFileSync(prefsPath, 'utf8');
  const navSrc = fs.readFileSync(navPath, 'utf8');
  let ok = line(repoSrc.includes('resolveTestCardForNavigation'), 'Android: resolveTestCardForNavigation()') && true;
  ok = line(prefsSrc.includes('findAppliedEntryForTestLookup'), 'Android: findAppliedEntryForTestLookup()') && ok;
  ok = line(navSrc.includes('canonicalTestTitle'), 'Android: quiz navigation uses canonical title') && ok;
  ok = line(navSrc.includes('findAppliedEntryForTestLookup'), 'Android: quiz gate matches subcategory lookup') && ok;
  return ok;
}

async function optionalAuthApplySmoke(apiBase, testRow) {
  if (!process.argv.includes('--with-auth-apply')) {
    line(true, 'Auth apply smoke skipped (pass --with-auth-apply to enable)');
    return true;
  }
  const identifier = String(process.env.E2E_LOGIN_IDENTIFIER || '').trim();
  const password = String(process.env.E2E_LOGIN_PASSWORD || '').trim();
  if (!identifier || !password) {
    return line(false, '--with-auth-apply requires E2E_LOGIN_IDENTIFIER and E2E_LOGIN_PASSWORD');
  }
  if (!testRow) {
    return line(false, 'No suitable test row for auth apply smoke');
  }

  const loginRes = await fetch(`${apiBase}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password }),
  });
  const loginBody = await loginRes.json().catch(() => ({}));
  const token = loginBody.accessToken || loginBody.access_token;
  if (!loginRes.ok || !token) {
    return line(false, `Auth login failed (${loginRes.status})`);
  }

  const applyRes = await fetch(`${apiBase}/tests/${testRow.id}/apply`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  const applyBody = await applyRes.json().catch(() => ({}));
  if (![200, 201, 202].includes(applyRes.status)) {
    return line(false, `POST apply failed (${applyRes.status}): ${applyBody.error || 'unknown'}`);
  }

  const appsRes = await fetch(`${apiBase}/tests/my-applications`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const appsBody = await appsRes.json().catch(() => ({}));
  const items = Array.isArray(appsBody.items) ? appsBody.items : [];
  const mine = items.find((x) => String(x.testId) === String(testRow.id));
  let ok = line(Boolean(mine), `my-applications includes "${testRow.title}" after apply`) && true;
  if (mine) {
    ok = line(mine.canStart === true, `my-applications canStart=${mine.canStart} for "${testRow.title}"`) && ok;
  }
  return ok;
}

async function main() {
  let ok = await staticAndroidApplyStartCheck();
  const db = pool;
  const audit = await auditPublishedTests(db);
  ok = audit.ok && ok;

  const readyRow = audit.rows.find((row) => {
    const sub = String(row.subcategory || '').trim();
    const cap = Math.max(0, Number(row.capacity_total || 0));
    return sub && cap > 0;
  }) || audit.rows[0];

  const port = Number(process.env.PORT || 3000);
  const apiBase = `http://127.0.0.1:${port}/v1`;
  ok = await optionalAuthApplySmoke(apiBase, readyRow) && ok;

  await pool.end().catch(() => {});

  if (!ok) {
    console.error('\nPhase 3 verify FAILED — fix admin data issues above, then re-run.');
    process.exit(1);
  }
  console.log('\nPhase 3 verify PASSED');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
