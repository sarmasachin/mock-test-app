'use strict';
/**
 * READ-ONLY: prove which Android Start Test UI path applies (Apply vs Start Locked).
 * Uses live catalog + server resolve/start-access logic — no guessing.
 *
 * Usage:
 *   node scripts/diagnoseStartTestLocked.js
 *   node scripts/diagnoseStartTestLocked.js --api https://admin-admin.govmocktest.com/v1
 *   node scripts/diagnoseStartTestLocked.js --titles "HP GK,ff"
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { buildTestResolvePayload } = require('../src/lib/testResolve');
const { loadScheduleTimerEnabled } = require('../src/lib/testStartAccess');
const { pool } = require('../src/db');

const args = process.argv.slice(2);
const apiIdx = args.indexOf('--api');
const API = String(
  (apiIdx >= 0 && args[apiIdx + 1]) ||
    process.env.E2E_API_BASE ||
    process.env.API_BASE ||
    'https://admin-admin.govmocktest.com/v1',
).replace(/\/+$/, '');

const titlesIdx = args.indexOf('--titles');
const titleFilter = titlesIdx >= 0
  ? String(args[titlesIdx + 1] || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  : [];

function androidPreviewUi({ alreadyApplied, resolve, scheduleTimerEnabled, examDate, slotLabel }) {
  const resolveAlreadyApplied =
    resolve?.mayReapplyForNewCycle === true
      ? false
      : resolve?.alreadyAppliedInCurrentCycle === true ||
        resolve?.canStart === true ||
        alreadyApplied;

  let specificStartEntry = null;
  if (alreadyApplied || resolve?.alreadyAppliedInCurrentCycle || resolve?.canStart) {
    specificStartEntry = {
      serverCanStart: resolve?.canStart ?? null,
      startBlockReason: resolve?.startBlockReason ?? null,
    };
  }

  const showSpecificStart = Boolean(specificStartEntry);
  const blocked =
    resolve &&
    !resolve.canApply &&
    !resolve.mayReapplyForNewCycle &&
    Boolean(String(resolve.blockReason || '').trim());
  const showApplyButton =
    !resolveAlreadyApplied &&
    (resolve == null || resolve.canApply || resolve.mayReapplyForNewCycle) &&
    !blocked;
  const showSpecificApply = !showSpecificStart && !resolveAlreadyApplied && showApplyButton;
  const showSpecificApplyBlocked = !showSpecificStart && !resolveAlreadyApplied && !showApplyButton && blocked;

  let buttonLabel = 'unknown';
  if (showSpecificStart) {
    const locked =
      specificStartEntry.serverCanStart === false ||
      (specificStartEntry.serverCanStart == null &&
        scheduleTimerEnabled &&
        examDate &&
        Date.now() < Date.parse(`${examDate}T00:00:00+05:30`));
    buttonLabel = locked ? 'Start Test (Locked)' : 'Start Test';
  } else if (showSpecificApply) {
    buttonLabel = 'Apply Now';
  } else if (showSpecificApplyBlocked) {
    buttonLabel = `Apply blocked: ${resolve?.blockReason || '?'}`;
  } else if (!resolve?.found) {
    buttonLabel = 'Load error / not found';
  } else {
    buttonLabel = 'Other (check resolve flags)';
  }

  return {
    resolveAlreadyApplied,
    showSpecificStart,
    showSpecificApply,
    showSpecificApplyBlocked,
    buttonLabel,
  };
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { _raw: text.slice(0, 400) };
  }
  return { ok: res.ok, status: res.status, body };
}

function catalogRowFromItem(item) {
  return {
    id: item.id,
    title: item.title,
    is_published: true,
    exam_date: item.examDate || null,
    slot_label: item.slotLabel || '',
    dynamic_date_enabled: item.dateOnEnabled === true,
    date_cycle_days: Number(item.dateCycleDays || 0),
    duration_minutes: Number(item.durationMinutes || 0),
    last_cycle_started_at: item.lastCycleStartedAt || null,
    capacity_total: Number(item.capacityTotal || 0),
    enrolled_count: Number(item.enrolledCount || 0),
    subcategory: item.subcategory || '',
  };
}

async function main() {
  const nowMs = Date.now();
  console.log('=== diagnoseStartTestLocked (read-only) ===');
  console.log(`API: ${API}`);
  console.log(`Now: ${new Date(nowMs).toISOString()}\n`);

  const home = await fetchJson(`${API}/home/content`);
  const scheduleTimerEnabled =
    home.body?.content?.startSeriesScheduleTimerEnabled === true ||
    home.body?.startSeriesScheduleTimerEnabled === true;
  console.log(`startSeriesScheduleTimerEnabled: ${scheduleTimerEnabled}\n`);

  const catalog = await fetchJson(`${API}/tests?limit=50`);
  const items = (Array.isArray(catalog.body?.items) ? catalog.body.items : []).filter((item) => {
    if (!titleFilter.length) return true;
    return titleFilter.includes(String(item.title || '').trim().toLowerCase());
  });

  if (!items.length) {
    console.error('No catalog tests matched.');
    process.exit(1);
  }

  for (const item of items) {
    const row = catalogRowFromItem(item);
    const advancedConfig = item.advancedConfig && typeof item.advancedConfig === 'object'
      ? item.advancedConfig
      : {};
    console.log(`--- ${item.title} (${item.id}) ---`);
    console.log(
      `  catalog: examDate=${item.examDate || '(empty)'} slot=${item.slotLabel || '(empty)'} dateOn=${item.dateOnEnabled} duration=${item.durationMinutes}m`,
    );

    const notApplied = buildTestResolvePayload({
      row,
      advancedConfig,
      nowMs,
      alreadyAppliedInCurrentCycle: false,
      mayReapplyForNewCycle: false,
      scheduleTimerEnabled,
      examDate: item.examDate || null,
      slotLabel: item.slotLabel || '',
    });
    const applied = buildTestResolvePayload({
      row,
      advancedConfig,
      nowMs,
      alreadyAppliedInCurrentCycle: true,
      mayReapplyForNewCycle: false,
      scheduleTimerEnabled,
      examDate: item.examDate || null,
      slotLabel: item.slotLabel || '',
    });

    const uiNotApplied = androidPreviewUi({
      alreadyApplied: false,
      resolve: notApplied,
      scheduleTimerEnabled,
      examDate: item.examDate,
      slotLabel: item.slotLabel,
    });
    const uiApplied = androidPreviewUi({
      alreadyApplied: true,
      resolve: applied,
      scheduleTimerEnabled,
      examDate: item.examDate,
      slotLabel: item.slotLabel,
    });

    console.log('  resolve WITHOUT apply:');
    console.log(
      `    cyclePhase=${notApplied.cyclePhase} canApply=${notApplied.canApply} canStart=${notApplied.canStart} blockReason=${notApplied.blockReason || '-'}`,
    );
    console.log(`    Android button → ${uiNotApplied.buttonLabel}`);

    console.log('  resolve WITH apply (current cycle):');
    console.log(
      `    cyclePhase=${applied.cyclePhase} canStart=${applied.canStart} startBlockReason=${applied.startBlockReason || '-'}`,
    );
    console.log(`    Android button → ${uiApplied.buttonLabel}`);

    if (uiNotApplied.buttonLabel === 'Start Test (Locked)') {
      console.log('  *** BUG PATH: Start Locked without apply — should be Apply Now ***');
    }
    console.log('');
  }

  console.log('--- Android bugs fixed in app (2026-07-09) ---');
  console.log(
    '1) loadTestForApplyScreen returned resolve=null when catalog hit → blank Start Test + no Apply button.',
  );
  console.log(
    '2) login/register did not clear appliedSeries → user B saw user A locked test on same device.',
  );
  console.log('Fix: attachResolveToCatalogCard + clearAppliedTestSeriesOnAuthSwitch.\n');

  console.log('--- stale local cache note (Android AppliedTestSeriesSync) ---');
  console.log(
    'If phone has old appliedSeries in SharedPreferences AND GET /my-applications is empty or sync fails,',
  );
  console.log(
    'app KEEPS local rows → Home/Start preview can show Start Locked even when server has no apply row.',
  );
  console.log('Fix: clear app data OR successful my-applications sync must drop ghost local rows.\n');

  if (process.env.DATABASE_URL) {
    try {
      const { rows } = await pool.query(
        `SELECT t.title, COUNT(ta.id)::int AS app_rows
         FROM tests t
         LEFT JOIN test_applications ta ON ta.test_id = t.id
         WHERE t.is_published = true
         GROUP BY t.id, t.title
         ORDER BY t.title`,
      );
      console.log('--- DB apply row counts (local DATABASE_URL) ---');
      for (const r of rows) {
        console.log(`  ${r.title}: ${r.app_rows} application(s)`);
      }
    } catch (e) {
      console.log(`Local DB skipped: ${e.message}`);
    }
  }

  console.log('\nDIAGNOSE_START_TEST_LOCKED_OK');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => pool.end().catch(() => {}));
