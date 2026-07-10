#!/usr/bin/env node
'use strict';

/**
 * Phase 0 — HP GK cycle admin setup (safe, minimal scope).
 *
 * Default: dry-run (read-only audit).
 * Apply:   --apply  → enables homeContent.startSeriesScheduleTimerEnabled only.
 *
 * Does NOT mutate HP GK test row, advanced config, or resultVisibility.
 *
 * Usage:
 *   cd server
 *   node scripts/phase0HpGkCycleSetup.js           # audit
 *   node scripts/phase0HpGkCycleSetup.js --apply   # enable schedule timer
 */

require('dotenv').config();
const { Pool } = require('pg');
const {
  HP_GK_TEST_ID,
  HP_GK_TITLE,
  validateHpGkRow,
  assessScheduleTimerSafety,
  buildHomeContentTimerEnablePatch,
  simulateHpGkStartAccess,
  buildPhase0Report,
  canApplyPhase0,
  buildAdminTestCycleDiagnostics,
} = require('../src/lib/phase0HpGkCycleSetup');

function parseArgs(argv) {
  const apply = argv.includes('--apply');
  const dryRun = argv.includes('--dry-run') || !apply;
  return { apply, dryRun };
}

function resolveAdvancedConfigForTest(advancedMap, testId) {
  if (!advancedMap || typeof advancedMap !== 'object') return null;
  const key = String(testId || '').trim();
  if (!key) return null;
  const direct = advancedMap[key];
  if (direct && typeof direct === 'object') return direct;
  const lower = key.toLowerCase();
  for (const [mapKey, value] of Object.entries(advancedMap)) {
    if (String(mapKey).trim().toLowerCase() === lower && value && typeof value === 'object') {
      return value;
    }
  }
  return null;
}

async function loadJsonSetting(client, key, fallback) {
  const res = await client.query(
    'SELECT setting_value FROM app_settings WHERE setting_key = $1 LIMIT 1',
    [key],
  );
  if (!res.rows.length) return fallback;
  try {
    return JSON.parse(String(res.rows[0].setting_value || ''));
  } catch (_e) {
    return fallback;
  }
}

async function main() {
  const { apply, dryRun } = parseArgs(process.argv.slice(2));
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Copy server/.env.example → .env or set DATABASE_URL.');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl:
      process.env.DATABASE_URL && process.env.DATABASE_URL.includes('render.com')
        ? { rejectUnauthorized: false }
        : false,
  });

  const client = await pool.connect();
  try {
    const hpRes = await client.query(
      `SELECT id::text AS id, title, is_published, exam_date, slot_label,
              dynamic_date_enabled, date_cycle_days, duration_minutes,
              last_cycle_started_at, enrolled_count, updated_at
       FROM tests
       WHERE id = $1::uuid
       LIMIT 1`,
      [HP_GK_TEST_ID],
    );
    let hpRow = hpRes.rows[0] || null;
    if (!hpRow) {
      const byTitle = await client.query(
        `SELECT id::text AS id, title, is_published, exam_date, slot_label,
                dynamic_date_enabled, date_cycle_days, duration_minutes,
                last_cycle_started_at, enrolled_count, updated_at
         FROM tests
         WHERE lower(trim(title)) = lower($1)
         ORDER BY updated_at DESC
         LIMIT 1`,
        [HP_GK_TITLE],
      );
      hpRow = byTitle.rows[0] || null;
      if (hpRow) {
        console.log(`NOTE: HP GK found by title (id=${hpRow.id})`);
      }
    }

    const publishedRes = await client.query(
      `SELECT id::text AS id, title, exam_date, slot_label, is_published
       FROM tests
       WHERE is_published = true
       ORDER BY title ASC`,
    );

    const rawHome = await loadJsonSetting(client, 'homeContent', {});
    const advancedMap = await loadJsonSetting(client, 'testAdvancedConfigs', {});
    const advancedConfig = resolveAdvancedConfigForTest(advancedMap, hpRow?.id || HP_GK_TEST_ID);

    const hpGkValidation = validateHpGkRow(hpRow);
    const timerSafety = assessScheduleTimerSafety(publishedRes.rows);
    const homeEnabled = rawHome?.startSeriesScheduleTimerEnabled === true;
    const homeTimerState = { enabled: homeEnabled, needsEnable: !homeEnabled };
    const patch = buildHomeContentTimerEnablePatch(rawHome);

    let diagnostics = null;
    if (hpRow) {
      diagnostics = await buildAdminTestCycleDiagnostics(pool, hpRow, advancedConfig || {});
    }

    console.log(
      buildPhase0Report({
        hpGkValidation,
        timerSafety,
        homeTimerState,
        diagnostics,
        advancedConfig: advancedConfig || {},
      }),
    );
    console.log('');

    if (hpGkValidation.ok && hpGkValidation.examStartMs) {
      const beforeStart = simulateHpGkStartAccess(hpGkValidation.row, true, hpGkValidation.examStartMs - 60_000);
      const atStart = simulateHpGkStartAccess(hpGkValidation.row, true, hpGkValidation.examStartMs + 1000);
      console.log('Post-apply expectation (schedule timer ON, applied user):');
      console.log(
        `  1 min before exam: canStart=${beforeStart.canStart} (${beforeStart.startBlockReason || 'ready'})`,
      );
      console.log(
        `  at exam start:     canStart=${atStart.canStart} (${atStart.startBlockReason || 'ready'})`,
      );
      console.log('');
    }

    const applyGate = canApplyPhase0({ hpGkValidation, timerSafety, homeTimerState });

    if (dryRun && !apply) {
      if (applyGate.ok) {
        console.log('DRY-RUN: ready to apply. Run with --apply to enable schedule timer.');
      } else if (!homeTimerState.needsEnable) {
        console.log('DRY-RUN: Phase 0 already satisfied (schedule timer ON).');
      } else {
        console.log(`DRY-RUN: cannot apply — ${applyGate.reason}`);
      }
      process.exit(hpGkValidation.ok ? 0 : 1);
    }

    if (!applyGate.ok) {
      console.error(`ABORT: ${applyGate.reason}`);
      process.exit(1);
    }

    if (!patch.ok || !patch.cleaned) {
      console.error(`ABORT: homeContent patch failed — ${patch.error}`);
      process.exit(1);
    }

    await client.query('BEGIN');
    try {
      await client.query(
        `INSERT INTO app_settings (setting_key, setting_value, updated_by)
         VALUES ('homeContent', $1, NULL)
         ON CONFLICT (setting_key)
         DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = now()`,
        [JSON.stringify(patch.cleaned)],
      );
      await client.query('COMMIT');
      console.log('APPLIED: startSeriesScheduleTimerEnabled=true (homeContent saved)');
      console.log('No other settings were changed (HP GK row + advanced config untouched).');
      process.exit(0);
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
