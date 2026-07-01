'use strict';
/**
 * Phase 5 verify — admin cycle status + republish eligibility (no DB writes).
 */
const {
  buildAdminTestCycleFields,
  countOverduePublishSchedules,
} = require('../src/lib/adminTestCycleStatus');

function line(ok, msg) {
  console.log(`${ok ? 'OK' : '!!'}  ${msg}`);
  return ok;
}

const nowMs = Date.parse('2026-07-01T12:00:00.000Z');
const betweenNowMs = Date.parse('2026-07-01T11:20:00.000Z');
let ok = true;

const liveRow = {
  id: '11111111-1111-1111-1111-111111111111',
  is_published: true,
  duration_minutes: 60,
  last_cycle_started_at: '2026-07-01T11:30:00.000Z',
  valid_until: null,
};

const liveFields = buildAdminTestCycleFields(liveRow, {}, [], nowMs);
ok = line(liveFields.cycle_status === 'live', 'live row → cycle_status live') && ok;
ok = line(liveFields.can_republish_now === false, 'live row cannot republish now') && ok;

const betweenRow = {
  id: '22222222-2222-2222-2222-222222222222',
  is_published: false,
  duration_minutes: 12,
  last_cycle_started_at: '2026-07-01T11:00:00.000Z',
  valid_until: null,
};

const betweenFields = buildAdminTestCycleFields(betweenRow, {}, [], betweenNowMs);
ok = line(betweenFields.cycle_status === 'between_cycles', 'between cycles badge') && ok;
ok = line(betweenFields.can_republish_now === true, 'between cycles can republish now') && ok;

const overdueSchedule = [
  {
    entityType: 'test',
    entityId: betweenRow.id,
    status: 'scheduled',
    scheduleAt: '2026-07-01T11:45:00.000Z',
    action: 'publish',
  },
];
const overdueFields = buildAdminTestCycleFields(betweenRow, {}, overdueSchedule, nowMs);
ok = line(overdueFields.cycle_status === 'republish_overdue', 'past schedule → republish_overdue') && ok;
ok = line(overdueFields.republish_overdue === true, 'republish_overdue flag') && ok;

const stuckPublishedRow = {
  id: '33333333-3333-3333-3333-333333333333',
  is_published: true,
  duration_minutes: 12,
  last_cycle_started_at: '2026-07-01T11:00:00.000Z',
  valid_until: null,
};
const stuckFields = buildAdminTestCycleFields(stuckPublishedRow, {}, [], nowMs);
ok = line(stuckFields.cycle_status === 'republish_overdue', 'stuck published after cycle → overdue') && ok;
ok = line(stuckFields.can_republish_now === true, 'stuck published can republish now') && ok;

ok =
  line(
    countOverduePublishSchedules(overdueSchedule, nowMs) === 1,
    'countOverduePublishSchedules detects overdue item',
  ) && ok;

if (ok) {
  console.log('PHASE5_VERIFY_OK');
  process.exit(0);
}
console.error('PHASE5_VERIFY_FAILED');
process.exit(1);
