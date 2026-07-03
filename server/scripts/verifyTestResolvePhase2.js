'use strict';
/**
 * Phase 2 verify — test resolve helpers (no DB writes).
 */
const {
  resolveTestCyclePhase,
  buildTestResolvePayload,
} = require('../src/lib/testResolve');

function line(ok, msg) {
  console.log(`${ok ? 'OK' : '!!'}  ${msg}`);
  return ok;
}

const nowMs = Date.parse('2026-07-01T12:00:00.000Z');
let ok = true;

const liveRow = {
  id: '11111111-1111-1111-1111-111111111111',
  title: 'Live Test',
  slug: 'live-test',
  subcategory: 'GK',
  is_published: true,
  duration_minutes: 60,
  last_cycle_started_at: '2026-07-01T11:30:00.000Z',
  valid_until: null,
};

ok = line(
  resolveTestCyclePhase(liveRow, {}, nowMs, []) === 'live',
  'published in-cycle → live',
) && ok;

const betweenRow = {
  id: '22222222-2222-2222-2222-222222222222',
  title: 'Gap Test',
  slug: 'gap-test',
  subcategory: 'GK',
  is_published: false,
  duration_minutes: 12,
  last_cycle_started_at: '2026-07-01T11:00:00.000Z',
  valid_until: null,
};

ok = line(
  resolveTestCyclePhase(betweenRow, {}, nowMs, []) === 'between_cycles',
  'unpublished after cycle end → between_cycles',
) && ok;

const livePayload = buildTestResolvePayload({
  row: liveRow,
  advancedConfig: {},
  nowMs,
  publishScheduleItems: [],
  alreadyAppliedInCurrentCycle: false,
});

ok = line(livePayload.found === true && livePayload.canApply === true, 'live test canApply=true') && ok;
ok = line(livePayload.catalogVisible === true, 'live test catalogVisible=true') && ok;

const betweenPayload = buildTestResolvePayload({
  row: betweenRow,
  advancedConfig: {},
  nowMs,
  publishScheduleItems: [
    {
      entityType: 'test',
      entityId: betweenRow.id,
      status: 'scheduled',
      scheduleAt: '2026-07-01T12:30:00.000Z',
      action: 'publish',
    },
  ],
});

ok = line(betweenPayload.cyclePhase === 'between_cycles', 'between_cycles phase') && ok;
ok = line(betweenPayload.canApply === false, 'between_cycles canApply=false') && ok;
ok = line(
  String(betweenPayload.blockReason || '').includes('between cycles'),
  'between_cycles friendly blockReason',
) && ok;
ok = line(betweenPayload.republishAt === '2026-07-01T12:30:00.000Z', 'republishAt from schedule') && ok;
ok = line(betweenPayload.id === betweenRow.id, 'resolve returns test id when unpublished') && ok;

const missing = buildTestResolvePayload({ row: null });
ok = line(missing.found === false && missing.cyclePhase === 'not_found', 'null row → not_found') && ok;

const appliedPayload = buildTestResolvePayload({
  row: liveRow,
  advancedConfig: {},
  nowMs,
  alreadyAppliedInCurrentCycle: true,
});
ok = line(appliedPayload.canApply === false, 'already applied → canApply=false') && ok;
ok = line(appliedPayload.alreadyAppliedInCurrentCycle === true, 'alreadyApplied flag') && ok;
ok = line(appliedPayload.canStart === true, 'already applied timer off → canStart=true') && ok;

const reapplyPayload = buildTestResolvePayload({
  row: liveRow,
  advancedConfig: {},
  nowMs,
  mayReapplyForNewCycle: true,
});
ok = line(reapplyPayload.canApply === true && reapplyPayload.mayReapplyForNewCycle === true, 'reapply new cycle') && ok;

if (ok) {
  console.log('\nPHASE2_VERIFY_OK');
  process.exit(0);
}
console.log('\nPHASE2_VERIFY_FAILED');
process.exit(1);
