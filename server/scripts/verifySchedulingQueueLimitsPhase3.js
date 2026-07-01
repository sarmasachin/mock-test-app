'use strict';

const assert = require('assert');
const {
  trimPublishSchedulingItems,
  trimNotificationSchedulingItems,
  reconcilePublishSchedulingItems,
  PUBLISH_SCHEDULE_MAX_PUBLISHED_PER_ENTITY,
  NOTIFICATION_SCHEDULE_MAX_ITEMS,
} = require('../src/lib/schedulingQueueLimits');

function testTrimPublishPerEntity() {
  const entityId = 'test-1';
  const items = [];
  for (let i = 0; i < 55; i += 1) {
    items.push({
      id: `pub-${i}`,
      entityType: 'test',
      entityId,
      status: 'published',
      processedAt: new Date(Date.parse('2026-01-01T00:00:00.000Z') + i * 60000).toISOString(),
    });
  }
  items.push({
    id: 'pending-1',
    entityType: 'test',
    entityId,
    status: 'scheduled',
    scheduleAt: '2026-12-31T00:00:00.000Z',
  });
  const trimmed = trimPublishSchedulingItems(items);
  const published = trimmed.filter((x) => x.status === 'published');
  assert.strictEqual(published.length, PUBLISH_SCHEDULE_MAX_PUBLISHED_PER_ENTITY);
  assert.strictEqual(trimmed.some((x) => x.id === 'pending-1'), true);
}

function testTrimNotificationsKeepsScheduled() {
  const nowMs = Date.parse('2026-07-01T12:00:00.000Z');
  const items = [];
  for (let i = 0; i < NOTIFICATION_SCHEDULE_MAX_ITEMS; i += 1) {
    items.push({
      id: `failed-${i}`,
      status: 'failed',
      createdAt: new Date(nowMs - i * 60 * 1000).toISOString(),
    });
  }
  items.unshift({
    id: 'scheduled-1',
    status: 'scheduled',
    createdAt: new Date(nowMs).toISOString(),
  });
  const trimmed = trimNotificationSchedulingItems(items, NOTIFICATION_SCHEDULE_MAX_ITEMS, nowMs);
  assert.strictEqual(trimmed.length, NOTIFICATION_SCHEDULE_MAX_ITEMS);
  assert.strictEqual(trimmed.some((x) => x.id === 'scheduled-1'), true);
}

function testReconcileMarksPublishedFromDb() {
  const nowMs = Date.parse('2026-07-01T12:00:00.000Z');
  const testId = 'abc-123';
  const items = [
    {
      id: 'stuck-1',
      entityType: 'test',
      entityId: testId,
      status: 'scheduled',
      scheduleAt: '2026-07-01T05:00:00.000Z',
    },
  ];
  const testRowsById = new Map([
    [
      testId,
      {
        id: testId,
        is_published: true,
        last_cycle_started_at: '2026-07-01T05:21:00.000Z',
      },
    ],
  ]);
  const result = reconcilePublishSchedulingItems(items, testRowsById, nowMs);
  assert.strictEqual(result.items[0].status, 'published');
  assert.strictEqual(result.changes.some((x) => x.action === 'mark_published_from_db'), true);
}

testTrimPublishPerEntity();
testTrimNotificationsKeepsScheduled();
testReconcileMarksPublishedFromDb();
console.log('scheduling_queue_limits_phase3_smoke_ok');
