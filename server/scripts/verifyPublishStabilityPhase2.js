'use strict';

/**
 * Phase 2 verify — catalog stays published when exam cycle ends (default rollover).
 * Offline: mirrors processTestCycleAutoReschedule + catalog visibility rules.
 */

const fs = require('fs');
const path = require('path');
const { isTestCatalogVisible } = require('../src/lib/testVisibility');
const {
  getApplyCycleTimeline,
  evaluateApplyCyclePhase,
} = require('../src/lib/applyCycleE2eScenarios');

const ROOT = path.join(__dirname, '..');

function line(ok, msg) {
  console.log(`${ok ? 'OK' : 'FAIL'}  ${msg}`);
  return ok;
}

function simulateCycleSchedulerAction({ row, advancedConfig }) {
  const useLegacy = advancedConfig?.autoCatalogUnpublish === true;
  if (useLegacy) {
    return {
      is_published: false,
      enrolled_count: 0,
      last_cycle_started_at: row.last_cycle_started_at,
      schedulesRepublish: true,
    };
  }
  return {
    is_published: true,
    enrolled_count: 0,
    last_cycle_started_at: new Date().toISOString(),
    schedulesRepublish: false,
  };
}

function readSchedulerSource() {
  return fs.readFileSync(path.join(ROOT, 'src/index.js'), 'utf8');
}

function main() {
  let ok = true;
  console.log('=== Phase 2: Publish stability (catalog rollover) ===\n');

  const src = readSchedulerSource();
  ok = line(
    src.includes('enrolled_count = 0, last_cycle_started_at = now()'),
    'scheduler: default rollover keeps catalog published',
  ) && ok;
  ok = line(
    src.includes('autoCatalogUnpublish === true'),
    'scheduler: legacy autoCatalogUnpublish opt-in preserved',
  ) && ok;
  ok = line(
    /useLegacyCatalogUnpublish[\s\S]*is_published = false/.test(src),
    'scheduler: legacy path still unpublishes catalog',
  ) && ok;

  const timeline = getApplyCycleTimeline({
    cycleStartMs: Date.parse('2026-07-01T10:00:00.000Z'),
    durationMinutes: 30,
    gapMinutes: 30,
  });

  const rolledPhase = timeline.phases.find((p) => p.key === 'cycle_rolled_over');
  ok = line(Boolean(rolledPhase), 'timeline includes cycle_rolled_over phase') && ok;

  const rolledEval = evaluateApplyCyclePhase({
    row: rolledPhase.row,
    advancedConfig: timeline.advancedConfig,
    publishScheduleItems: rolledPhase.publishScheduleItems,
    nowMs: rolledPhase.nowMs,
    appliedAtIso: rolledPhase.appliedAtIso,
  });
  ok = line(rolledEval.catalogListed === true, 'after rollover: GET /tests would list test') && ok;
  ok = line(rolledPhase.row.is_published === true, 'after rollover: is_published stays true') && ok;
  ok = line(rolledEval.resolve.cyclePhase === 'live', 'after rollover: resolve cyclePhase=live') && ok;
  ok = line(rolledEval.mayReapplyForNewCycle === true, 'after rollover: user may re-apply') && ok;

  const legacyPhase = timeline.phases.find((p) => p.key === 'legacy_between_cycles');
  const legacyEval = evaluateApplyCyclePhase({
    row: legacyPhase.row,
    advancedConfig: legacyPhase.advancedConfig,
    publishScheduleItems: legacyPhase.publishScheduleItems,
    nowMs: legacyPhase.nowMs,
    appliedAtIso: legacyPhase.appliedAtIso,
  });
  ok = line(legacyEval.catalogListed === false, 'legacy autoCatalogUnpublish: catalog hidden') && ok;
  ok = line(legacyEval.resolve.cyclePhase === 'between_cycles', 'legacy: between_cycles phase') && ok;

  const beforeEnd = evaluateApplyCyclePhase({
    row: timeline.phases[0].row,
    advancedConfig: timeline.advancedConfig,
    publishScheduleItems: [],
    nowMs: timeline.cycleStartMs + 60 * 1000,
    appliedAtIso: null,
  });
  ok = line(beforeEnd.catalogListed === true, 'during cycle: catalog listed') && ok;

  const schedulerDefault = simulateCycleSchedulerAction({
    row: { is_published: true, last_cycle_started_at: new Date().toISOString() },
    advancedConfig: {},
  });
  ok = line(schedulerDefault.is_published === true, 'sim: default rollover is_published=true') && ok;
  ok = line(schedulerDefault.schedulesRepublish === false, 'sim: default rollover skips republish schedule') && ok;

  const schedulerLegacy = simulateCycleSchedulerAction({
    row: { is_published: true, last_cycle_started_at: new Date().toISOString() },
    advancedConfig: { autoCatalogUnpublish: true },
  });
  ok = line(schedulerLegacy.is_published === false, 'sim: legacy rollover is_published=false') && ok;
  ok = line(schedulerLegacy.schedulesRepublish === true, 'sim: legacy rollover schedules republish') && ok;

  const hpGkRow = {
    is_published: true,
    valid_until: '2027-07-31',
    duration_minutes: 30,
    last_cycle_started_at: '2026-07-07T18:09:25.150Z',
  };
  const afterHpCycle = {
    ...hpGkRow,
    enrolled_count: 0,
    last_cycle_started_at: new Date(Date.parse(hpGkRow.last_cycle_started_at) + 30 * 60 * 1000).toISOString(),
  };
  ok = line(
    isTestCatalogVisible(afterHpCycle, {}, Date.parse(afterHpCycle.last_cycle_started_at) + 60 * 1000),
    'HP GK style row: still catalog-visible after rollover',
  ) && ok;

  if (!ok) {
    console.error('\nPUBLISH_STABILITY_PHASE2_FAILED');
    process.exit(1);
  }
  console.log('\nPUBLISH_STABILITY_PHASE2_OK');
}

main();
