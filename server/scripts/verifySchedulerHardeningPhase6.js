'use strict';
/**
 * Phase 6 verify — publish schedule diagnostics + overdue detection (no DB writes).
 */
const {
  buildPublishSchedulingDiagnostics,
  getRepublishOverdueAlertMinutes,
  isScheduleItemOverdue,
  isStaleProcessingItem,
  overdueMinutesForItem,
} = require('../src/lib/publishScheduleDiagnostics');
const { PUBLISH_SCHEDULE_STALE_PROCESSING_MS } = require('../src/lib/testVisibility');

function line(ok, msg) {
  console.log(`${ok ? 'OK' : '!!'}  ${msg}`);
  return ok;
}

const nowMs = Date.parse('2026-07-01T12:00:00.000Z');
let ok = true;

ok = line(getRepublishOverdueAlertMinutes() === 5, 'default overdue alert = 5 min') && ok;

const futureItem = {
  id: 'future',
  entityType: 'test',
  entityId: '11111111-1111-1111-1111-111111111111',
  status: 'scheduled',
  scheduleAt: '2026-07-01T13:00:00.000Z',
};
ok = line(isScheduleItemOverdue(futureItem, nowMs) === false, 'future schedule not overdue') && ok;

const overdueItem = {
  id: 'late',
  entityType: 'test',
  entityId: '22222222-2222-2222-2222-222222222222',
  status: 'scheduled',
  scheduleAt: '2026-07-01T11:50:00.000Z',
  action: 'publish',
};
ok = line(isScheduleItemOverdue(overdueItem, nowMs) === true, 'past scheduled item overdue') && ok;
ok = line(overdueMinutesForItem(overdueItem, nowMs) === 10, 'overdue minutes computed') && ok;

const staleProcessing = {
  id: 'stale',
  status: 'processing',
  processingStartedAt: new Date(nowMs - PUBLISH_SCHEDULE_STALE_PROCESSING_MS - 5000).toISOString(),
  scheduleAt: '2026-07-01T11:00:00.000Z',
};
ok = line(isStaleProcessingItem(staleProcessing, nowMs) === true, 'stale processing detected') && ok;

const { enrichedItems, diagnostics } = buildPublishSchedulingDiagnostics(
  [futureItem, overdueItem, staleProcessing],
  nowMs,
  { [overdueItem.entityId]: 'Gap Test' },
);
ok = line(diagnostics.overdueCount === 2, 'diagnostics counts overdue scheduled + processing') && ok;
ok = line(diagnostics.staleProcessingCount === 1, 'diagnostics stale processing count') && ok;
ok = line(diagnostics.alertWorthyCount === 2, 'alert worthy when overdue >= 5 min') && ok;
ok = line(diagnostics.healthy === false, 'not healthy when issues present') && ok;
ok = line(diagnostics.overdueSamples[0]?.entityLabel === 'Gap Test', 'entity label in overdue sample') && ok;
ok =
  line(
    enrichedItems.find((x) => x.id === 'late')?.scheduleHealth?.isOverdue === true,
    'enriched item has scheduleHealth.isOverdue',
  ) && ok;

const healthy = buildPublishSchedulingDiagnostics([futureItem], nowMs).diagnostics;
ok = line(healthy.healthy === true, 'healthy when only future schedules') && ok;

if (ok) {
  console.log('PHASE6_VERIFY_OK');
  process.exit(0);
}
console.error('PHASE6_VERIFY_FAILED');
process.exit(1);
