'use strict';
/**
 * Phase 5 verify — admin cycle status + republish eligibility (no DB writes).
 * Phase 8: uses canonical scheduler cycle end (not duration_minutes alone).
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

/** Manual mode (ff-like): duration must NOT trigger cycle expired. */
const manualLiveRow = {
  id: '11111111-1111-1111-1111-111111111111',
  is_published: true,
  duration_minutes: 60,
  last_cycle_started_at: '2026-06-01T11:30:00.000Z',
  dynamic_date_enabled: false,
  exam_date: null,
  valid_until: null,
};

const manualLiveFields = buildAdminTestCycleFields(manualLiveRow, {}, [], nowMs);
ok = line(manualLiveFields.cycle_status === 'live', 'manual mode published → live (not duration-expired)') && ok;
ok = line(manualLiveFields.can_republish_now === false, 'manual live cannot republish now') && ok;

/** Rolling 1d: unpublished after cycle end → between_cycles. */
const betweenRow = {
  id: '22222222-2222-2222-2222-222222222222',
  is_published: false,
  duration_minutes: 12,
  dynamic_date_enabled: true,
  date_cycle_days: 1,
  last_cycle_started_at: '2026-06-29T11:00:00.000Z',
  valid_until: null,
};

const betweenFields = buildAdminTestCycleFields(betweenRow, {}, [], betweenNowMs);
ok = line(betweenFields.cycle_phase === 'between_cycles', 'rolling cycle ended → between_cycles phase') && ok;
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

/** Rolling 1d: still published after cycle end → Cycle expired / republish overdue. */
const stuckPublishedRow = {
  id: '33333333-3333-3333-3333-333333333333',
  is_published: true,
  duration_minutes: 12,
  dynamic_date_enabled: true,
  date_cycle_days: 1,
  last_cycle_started_at: '2026-06-29T11:00:00.000Z',
  valid_until: null,
};
const stuckFields = buildAdminTestCycleFields(stuckPublishedRow, {}, [], nowMs);
ok = line(stuckFields.cycle_status === 'republish_overdue', 'stuck published after rolling cycle → overdue') && ok;
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
