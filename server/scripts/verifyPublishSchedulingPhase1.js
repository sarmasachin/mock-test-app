'use strict';

/**
 * Phase-1 smoke test: publish scheduling lock + claim helpers (no FCM / no full server).
 */
const assert = require('assert');
const {
  recoverStalePublishScheduleItems,
  isPublishScheduleItemPending,
  PUBLISH_SCHEDULE_STALE_PROCESSING_MS,
} = require('../src/lib/testVisibility');

function testRecoverStaleProcessing() {
  const nowMs = Date.parse('2026-07-01T12:00:00.000Z');
  const fresh = {
    id: 'a',
    status: 'processing',
    processingStartedAt: new Date(nowMs - 60 * 1000).toISOString(),
  };
  const stale = {
    id: 'b',
    status: 'processing',
    processingStartedAt: new Date(nowMs - PUBLISH_SCHEDULE_STALE_PROCESSING_MS - 1000).toISOString(),
  };
  const out = recoverStalePublishScheduleItems([fresh, stale], nowMs);
  assert.strictEqual(out[0].status, 'processing');
  assert.strictEqual(out[1].status, 'scheduled');
  assert.strictEqual(out[1].lastError, 'stale_processing_recovered');
}

function testPendingIncludesProcessing() {
  assert.strictEqual(isPublishScheduleItemPending({ status: 'scheduled' }), true);
  assert.strictEqual(isPublishScheduleItemPending({ status: 'processing' }), true);
  assert.strictEqual(isPublishScheduleItemPending({ status: 'published' }), false);
}

testRecoverStaleProcessing();
testPendingIncludesProcessing();
console.log('publish_scheduling_phase1_smoke_ok');
