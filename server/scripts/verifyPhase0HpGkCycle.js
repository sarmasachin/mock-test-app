#!/usr/bin/env node
'use strict';

/**
 * Offline verify — Phase 0 HP GK cycle setup helpers (no DB).
 *
 * Usage:
 *   node scripts/verifyPhase0HpGkCycle.js
 */

const {
  HP_GK_TEST_ID,
  validateHpGkRow,
  assessScheduleTimerSafety,
  buildHomeContentTimerEnablePatch,
  simulateHpGkStartAccess,
  canApplyPhase0,
  isNinePmSlot,
} = require('../src/lib/phase0HpGkCycleSetup');
const { sanitizeHomeContentForPublicApi } = require('../src/lib/homeContentPublicSanitize');

const HP_GK_ROW = {
  id: HP_GK_TEST_ID,
  title: 'HP GK',
  is_published: true,
  exam_date: '2026-07-10',
  slot_label: '09:00 PM',
  dynamic_date_enabled: true,
  date_cycle_days: 1,
  duration_minutes: 30,
  last_cycle_started_at: '2026-07-10T16:00:54.461Z',
};

function line(ok, msg) {
  console.log(`${ok ? 'OK' : 'FAIL'}  ${msg}`);
  return ok;
}

function main() {
  console.log('=== Verify Phase 0 HP GK cycle setup ===\n');
  let ok = true;

  ok = line(isNinePmSlot('09:00 PM'), '9 PM slot recognized') && ok;
  ok = line(isNinePmSlot('9:00 pm'), '9 PM slot variant recognized') && ok;
  ok = line(!isNinePmSlot('10:00 am'), 'non-9PM slot not matched as 9PM') && ok;

  const valid = validateHpGkRow(HP_GK_ROW);
  ok = line(valid.ok, 'production-shaped HP GK row validates') && ok;
  ok = line(Boolean(valid.resolvedExamDate), 'resolvedExamDate computed') && ok;

  const bad = validateHpGkRow({ ...HP_GK_ROW, dynamic_date_enabled: false });
  ok = line(!bad.ok, 'invalid dynamic_date_enabled rejected') && ok;

  const safety = assessScheduleTimerSafety([
    { title: 'HP GK', exam_date: '2026-07-10', slot_label: '09:00 PM' },
    { title: 'Bihar GK', exam_date: null, slot_label: null },
    { title: 'ff', exam_date: '', slot_label: '' },
  ]);
  ok = line(safety.safe === true, 'timer ON safe with mixed catalog') && ok;
  ok = line(safety.withExamDateCount === 1, 'one scheduled test counted') && ok;
  ok = line(safety.withoutExamDateCount === 2, 'manual tests counted as no-slot') && ok;

  const patchOff = buildHomeContentTimerEnablePatch({ startSeriesScheduleTimerEnabled: false, sections: [] });
  ok = line(patchOff.ok && patchOff.changed === true, 'patch enables timer from OFF') && ok;
  ok =
    line(
      patchOff.cleaned?.startSeriesScheduleTimerEnabled === true,
      'sanitized homeContent has timer true',
    ) && ok;

  const patchOn = buildHomeContentTimerEnablePatch({ startSeriesScheduleTimerEnabled: true });
  ok = line(patchOn.ok && patchOn.changed === false, 'patch no-op when already ON') && ok;

  ok =
    line(
      !Object.prototype.hasOwnProperty.call(
        patchOff.cleaned,
        'startSeriesLockSeconds',
      ),
      'legacy timer keys stripped from sanitized homeContent',
    ) && ok;

  const gate = canApplyPhase0({
    hpGkValidation: valid,
    timerSafety: safety,
    homeTimerState: { enabled: false, needsEnable: true },
  });
  ok = line(gate.ok, 'canApply when HP GK valid and timer needs enable') && ok;

  const gateAlready = canApplyPhase0({
    hpGkValidation: valid,
    timerSafety: safety,
    homeTimerState: { enabled: true, needsEnable: false },
  });
  ok = line(!gateAlready.ok, 'cannotApply when timer already ON') && ok;

  const examStartMs = valid.examStartMs;
  const before = simulateHpGkStartAccess(HP_GK_ROW, true, examStartMs - 60_000);
  const after = simulateHpGkStartAccess(HP_GK_ROW, true, examStartMs + 1000);
  ok = line(before.canStart === false, 'timer ON: blocked 1 min before 9 PM') && ok;
  ok = line(after.canStart === true, 'timer ON: allowed at exam start') && ok;

  const manualRow = { title: 'ff', is_published: true, exam_date: null, slot_label: null };
  const manualStart = simulateHpGkStartAccess(manualRow, true, Date.now());
  ok = line(manualStart.canStart === true, 'timer ON: manual test without slot still canStart') && ok;

  const roundTrip = sanitizeHomeContentForPublicApi(patchOff.cleaned);
  ok =
    line(
      roundTrip?.startSeriesScheduleTimerEnabled === true,
      'idempotent sanitize on timer-enabled homeContent',
    ) && ok;

  console.log('');
  if (ok) {
    console.log('VERIFY_PHASE0_HP_GK_CYCLE_OK');
    process.exit(0);
  }
  console.log('VERIFY_PHASE0_HP_GK_CYCLE_FAILED');
  process.exit(1);
}

main();
