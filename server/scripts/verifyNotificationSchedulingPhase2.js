'use strict';

const assert = require('assert');
const {
  buildTestPublishDedupeKey,
  prependNotificationIfNotDuplicate,
  NOTIFICATION_DEDUPE_WINDOW_MS,
} = require('../src/lib/notificationScheduling');

function testDedupeKey() {
  const key = buildTestPublishDedupeKey('abc-123', '2026-07-01T05:21:03.095Z');
  assert.strictEqual(key, 'test_publish:abc-123:2026-07-01T05:21:03.095Z');
  assert.strictEqual(buildTestPublishDedupeKey('', 'x'), '');
}

function testSkipDuplicateEnqueue() {
  const nowMs = Date.parse('2026-07-01T12:00:00.000Z');
  const dedupeKey = buildTestPublishDedupeKey('t1', '2026-07-01T05:21:03.095Z');
  const current = {
    items: [
      {
        id: 'existing',
        title: 'New Test Published',
        message: 'rr is now available.',
        status: 'scheduled',
        dedupeKey,
        scheduleAt: '2026-07-01T05:21:03.095Z',
        createdAt: '2026-07-01T05:21:03.095Z',
      },
    ],
  };
  const skipped = prependNotificationIfNotDuplicate(
    current,
    {
      title: 'New Test Published',
      message: 'rr is now available.',
      dedupeKey,
    },
    nowMs,
  );
  assert.strictEqual(skipped.enqueued, false);
  assert.strictEqual(skipped.skipped, true);
  assert.strictEqual(skipped.current.items.length, 1);
}

function testAllowsNewCycleKey() {
  const nowMs = Date.parse('2026-07-01T12:00:00.000Z');
  const oldKey = buildTestPublishDedupeKey('t1', '2026-07-01T05:21:03.095Z');
  const newKey = buildTestPublishDedupeKey('t1', '2026-07-01T06:30:00.000Z');
  const current = {
    items: [
      {
        id: 'old',
        title: 'New Test Published',
        message: 'rr is now available.',
        status: 'sent',
        dedupeKey: oldKey,
        sentAt: '2026-07-01T05:21:10.000Z',
      },
    ],
  };
  const enqueued = prependNotificationIfNotDuplicate(
    current,
    {
      title: 'New Test Published',
      message: 'rr is now available.',
      dedupeKey: newKey,
    },
    nowMs,
  );
  assert.strictEqual(enqueued.enqueued, true);
  assert.strictEqual(enqueued.skipped, false);
  assert.strictEqual(enqueued.current.items.length, 2);
}

function testExpiredDedupeAllowsReenqueue() {
  const nowMs = Date.parse('2026-07-03T12:00:00.000Z');
  const dedupeKey = buildTestPublishDedupeKey('t1', '2026-07-01T05:21:03.095Z');
  const current = {
    items: [
      {
        id: 'old',
        title: 'New Test Published',
        message: 'rr is now available.',
        status: 'sent',
        dedupeKey,
        sentAt: '2026-07-01T05:21:10.000Z',
      },
    ],
  };
  const enqueued = prependNotificationIfNotDuplicate(
    current,
    {
      title: 'New Test Published',
      message: 'rr is now available.',
      dedupeKey,
    },
    nowMs,
  );
  assert.strictEqual(enqueued.enqueued, true);
  assert(nowMs - Date.parse('2026-07-01T05:21:10.000Z') > NOTIFICATION_DEDUPE_WINDOW_MS);
}

testDedupeKey();
testSkipDuplicateEnqueue();
testAllowsNewCycleKey();
testExpiredDedupeAllowsReenqueue();
console.log('notification_scheduling_phase2_smoke_ok');
