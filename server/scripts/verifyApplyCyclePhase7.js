'use strict';
/**
 * Phase 7 verify — apply cycle E2E scenarios (offline, no DB/API writes).
 */
const {
  getApplyCycleTimeline,
  evaluateApplyCyclePhase,
} = require('../src/lib/applyCycleE2eScenarios');

function line(ok, msg) {
  console.log(`${ok ? 'OK' : '!!'}  ${msg}`);
  return ok;
}

let ok = true;
const timeline = getApplyCycleTimeline({
  cycleStartMs: Date.parse('2026-07-01T10:00:00.000Z'),
  durationMinutes: 2,
  gapMinutes: 3,
});

const byKey = Object.fromEntries(timeline.phases.map((p) => [p.key, p]));

function evalPhase(key) {
  const phase = byKey[key];
  return evaluateApplyCyclePhase({
    row: phase.row,
    advancedConfig: phase.advancedConfig || timeline.advancedConfig,
    publishScheduleItems: phase.publishScheduleItems,
    nowMs: phase.nowMs,
    appliedAtIso: phase.appliedAtIso,
  });
}

const live = evalPhase('live_in_cycle');
ok = line(live.catalogListed === true, 'step1: live cycle → catalog listed') && ok;
ok = line(live.resolve.cyclePhase === 'live', 'step1: live cycle phase') && ok;
ok = line(live.resolve.canApply === true, 'step1: canApply=true') && ok;
ok = line(live.applyAllowed === true && live.applyHttpStatus === 201, 'step1: POST /apply would succeed') && ok;

const applied = evalPhase('live_already_applied');
ok = line(applied.resolve.canApply === false, 'step2: already applied → canApply=false') && ok;
ok = line(applied.alreadyAppliedInCurrentCycle === true, 'step2: alreadyAppliedInCurrentCycle') && ok;
ok = line(applied.applyAllowed === false, 'step2: apply blocked (already applied)') && ok;

const between = evalPhase('legacy_between_cycles');
ok = line(between.catalogListed === false, 'step3 legacy: between cycles → catalog empty') && ok;
ok = line(between.resolve.cyclePhase === 'between_cycles', 'step3 legacy: between_cycles phase') && ok;
ok = line(between.resolve.canApply === false, 'step3 legacy: canApply=false') && ok;
ok = line(between.resolve.found === true && between.resolve.id, 'step3 legacy: resolve still finds test id') && ok;
ok =
  line(
    String(between.resolve.blockReason || '').toLowerCase().includes('between cycles'),
    'step3 legacy: blockReason mentions between cycles',
  ) && ok;
ok = line(between.applyAllowed === false && between.applyHttpStatus === 403, 'step3 legacy: POST /apply → 403') && ok;
ok = line(Boolean(between.resolve.republishAt), 'step3 legacy: republishAt present') && ok;

const rolled = evalPhase('cycle_rolled_over');
ok = line(rolled.catalogListed === true, 'step4: cycle rollover → catalog still listed') && ok;
ok = line(rolled.resolve.cyclePhase === 'live', 'step4: rollover → live cycle phase') && ok;
ok = line(rolled.mayReapplyForNewCycle === true, 'step4: may re-apply for new cycle') && ok;
ok = line(rolled.applyAllowed === true && rolled.applyHttpStatus === 201, 'step4: re-apply allowed (201)') && ok;
ok = line(rolled.fromOlderCycle === true, 'step4: application from older cycle detected') && ok;

ok = line(timeline.phases.length === 4, 'timeline has 4 phases') && ok;
ok =
  line(
    timeline.republishMs > timeline.cycleEndMs,
    'republish scheduled after cycle end',
  ) && ok;

if (ok) {
  console.log('PHASE7_VERIFY_OK');
  process.exit(0);
}
console.error('PHASE7_VERIFY_FAILED');
process.exit(1);
