'use strict';

/**
 * Phase 3 verify — server-authoritative canStart / joinClosesAt (offline, no DB).
 */

const {
  evaluateTestStartAccess,
  resolveJoinClosesAtMs,
  DEFAULT_NO_SCHEDULE_TTL_MS,
} = require('../src/lib/testStartAccess');
const { buildTestResolvePayload } = require('../src/lib/testResolve');

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
  is_published: true,
  duration_minutes: 60,
  last_cycle_started_at: '2026-07-01T11:30:00.000Z',
  valid_until: null,
  slot_label: '',
};

ok = line(
  evaluateTestStartAccess({
    alreadyAppliedInCurrentCycle: true,
    scheduleTimerEnabled: false,
    cyclePhase: 'live',
    catalogError: null,
    examDate: '2026-07-01',
    slotLabel: '',
    lateJoinMinutes: 0,
    attemptAccess: { allowed: true },
    nowMs,
    row: liveRow,
    advancedConfig: {},
  }).canStart === true,
  'timer off + applied + live → canStart true',
) && ok;

const beforeStart = evaluateTestStartAccess({
  alreadyAppliedInCurrentCycle: true,
  scheduleTimerEnabled: true,
  cyclePhase: 'live',
  catalogError: null,
  examDate: '2026-07-02',
  slotLabel: '10:00 am',
  lateJoinMinutes: 30,
  attemptAccess: { allowed: true },
  nowMs,
  row: liveRow,
  advancedConfig: {},
});
ok = line(beforeStart.canStart === false, 'timer on + before exam → canStart false') && ok;
ok = line(
  String(beforeStart.startBlockReason || '').includes('Test starts on'),
  'timer on + before exam → startBlockReason',
) && ok;
ok = line(beforeStart.joinClosesAt != null, 'timer on → joinClosesAt set') && ok;

const scheduledGlobalOff = evaluateTestStartAccess({
  alreadyAppliedInCurrentCycle: true,
  scheduleTimerEnabled: false,
  cyclePhase: 'live',
  catalogError: null,
  examDate: '2026-07-02',
  slotLabel: '10:00 am',
  lateJoinMinutes: 30,
  attemptAccess: { allowed: true },
  nowMs,
  row: liveRow,
  advancedConfig: {},
});
ok = line(scheduledGlobalOff.canStart === false, 'Phase 1: scheduled + global timer off → blocked before exam') && ok;

const afterLateJoin = evaluateTestStartAccess({
  alreadyAppliedInCurrentCycle: true,
  scheduleTimerEnabled: true,
  cyclePhase: 'live',
  catalogError: null,
  examDate: '2026-07-01',
  slotLabel: '10:00 am',
  lateJoinMinutes: 30,
  attemptAccess: { allowed: true },
  nowMs: Date.parse('2026-07-01T15:00:00.000+05:30'),
  row: liveRow,
  advancedConfig: {},
});
ok = line(afterLateJoin.canStart === false, 'after late join window → canStart false') && ok;

const notApplied = evaluateTestStartAccess({
  alreadyAppliedInCurrentCycle: false,
  scheduleTimerEnabled: false,
  cyclePhase: 'live',
  catalogError: null,
  examDate: null,
  slotLabel: '',
  lateJoinMinutes: 0,
  attemptAccess: null,
  nowMs,
  row: liveRow,
  advancedConfig: {},
});
ok = line(notApplied.canStart === false, 'not applied → canStart false') && ok;

const joinCloses = resolveJoinClosesAtMs({
  examDate: null,
  slotLabel: '',
  lateJoinMinutes: 0,
  scheduleTimerEnabled: false,
  cycleEndMs: null,
  nowMs,
});
ok = line(
  joinCloses === nowMs + DEFAULT_NO_SCHEDULE_TTL_MS,
  'timer off joinClosesAt uses 90d TTL',
) && ok;

const resolveApplied = buildTestResolvePayload({
  row: liveRow,
  advancedConfig: {},
  nowMs,
  alreadyAppliedInCurrentCycle: true,
  scheduleTimerEnabled: false,
  examDate: '2026-07-01',
  attemptAccess: { allowed: true },
});
ok = line(resolveApplied.canStart === true, 'buildTestResolvePayload exposes canStart') && ok;
ok = line(resolveApplied.joinClosesAt != null, 'buildTestResolvePayload exposes joinClosesAt') && ok;

if (ok) {
  console.log('\nPHASE3_START_ACCESS_VERIFY_OK');
  process.exit(0);
}
console.log('\nPHASE3_START_ACCESS_VERIFY_FAILED');
process.exit(1);
