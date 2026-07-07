'use strict';

/**
 * Phase 5 — end-to-end verification for notification / publish scheduling fixes.
 *
 * Usage:
 *   node scripts/verifyNotificationFixPhase5.js
 *
 * Exits 0 when all hard checks pass (warnings may still print).
 */
require('dotenv').config();

const { execSync } = require('child_process');
const path = require('path');
const { pool } = require('../src/db');
const {
  PUBLISH_SCHEDULE_MAX_PUBLISHED_PER_ENTITY,
  NOTIFICATION_SCHEDULE_MAX_ITEMS,
  publishScheduleEntityKey,
  isPublishSchedulePendingStatus,
} = require('../src/lib/schedulingQueueLimits');
const { isActiveDedupeStatus, normalizeDedupeKeyForCompare } = require('../src/lib/notificationScheduling');
const { resolveNotifyOnCycleRepublish } = require('../src/lib/testVisibility');

const SMOKE_SCRIPTS = [
  'verifyPublishSchedulingPhase1.js',
  'verifyNotificationSchedulingPhase2.js',
  'verifySchedulingQueueLimitsPhase3.js',
  'verifyNotifyOnCycleRepublishPhase4.js',
  'verifyPerUserPushDedupePhase2.js',
  'verifyMockTestStartSoonPushPhase3.js',
  'verifyPushTrayDedupePhase4.js',
];

function runSmokeSuites() {
  const scriptsDir = path.join(__dirname);
  for (const script of SMOKE_SCRIPTS) {
    execSync(`node "${path.join(scriptsDir, script)}"`, { stdio: 'inherit' });
  }
}

async function loadSettingItems(key) {
  const res = await pool.query(
    `SELECT setting_value FROM app_settings WHERE setting_key = $1 LIMIT 1`,
    [key],
  );
  if (!res.rows[0]) return [];
  try {
    const parsed = JSON.parse(String(res.rows[0].setting_value || '{}')) || { items: [] };
    return Array.isArray(parsed.items) ? parsed.items : [];
  } catch {
    return [];
  }
}

async function loadTestAdvancedConfigs() {
  const res = await pool.query(
    `SELECT setting_value FROM app_settings WHERE setting_key = 'testAdvancedConfigs' LIMIT 1`,
  );
  if (!res.rows[0]) return {};
  try {
    const parsed = JSON.parse(String(res.rows[0].setting_value || '{}'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function resolveAdvancedConfigForTest(advancedMap, testId) {
  const key = String(testId || '').trim();
  if (!key || !advancedMap || typeof advancedMap !== 'object') return null;
  if (advancedMap[key] && typeof advancedMap[key] === 'object') return advancedMap[key];
  const lower = key.toLowerCase();
  for (const [mapKey, value] of Object.entries(advancedMap)) {
    if (String(mapKey).trim().toLowerCase() === lower && value && typeof value === 'object') {
      return value;
    }
  }
  return null;
}

function auditPublishScheduling(items, advancedMap, nowMs) {
  const failures = [];
  const warnings = [];
  const stats = {
    total: items.length,
    scheduled: 0,
    processing: 0,
    published: 0,
    overduePending: 0,
    autoCyclePending: 0,
  };

  const publishedByEntity = new Map();
  for (const raw of items) {
    const item = raw || {};
    const status = String(item.status || '').trim().toLowerCase();
    if (status === 'scheduled') stats.scheduled += 1;
    if (status === 'processing') stats.processing += 1;
    if (status === 'published') {
      stats.published += 1;
      const key = publishScheduleEntityKey(item);
      publishedByEntity.set(key, (publishedByEntity.get(key) || 0) + 1);
    }

    if (isPublishSchedulePendingStatus(status)) {
      const scheduleMs = Date.parse(String(item.scheduleAt || ''));
      if (Number.isFinite(scheduleMs) && scheduleMs <= nowMs) {
        stats.overduePending += 1;
        warnings.push({
          check: 'publish_overdue_pending',
          id: item.id,
          entityId: item.entityId,
          scheduleAt: item.scheduleAt,
          hint: 'Run node scripts/cleanupSchedulingQueues.js --apply if stale',
        });
      }
      if (String(item.source || '') === 'autoCycle') {
        stats.autoCyclePending += 1;
        const adv = resolveAdvancedConfigForTest(advancedMap, String(item.entityId || ''));
        const expectedNotify = resolveNotifyOnCycleRepublish(adv);
        const actualNotify = item.notifyOnPublish !== false;
        if (actualNotify !== expectedNotify) {
          warnings.push({
            check: 'auto_cycle_notify_mismatch',
            id: item.id,
            entityId: item.entityId,
            expectedNotifyOnPublish: expectedNotify,
            actualNotifyOnPublish: actualNotify,
            hint: 'Legacy queue row or config changed after schedule was created',
          });
        }
      }
    }
  }

  for (const [entityKey, count] of publishedByEntity.entries()) {
    if (count > PUBLISH_SCHEDULE_MAX_PUBLISHED_PER_ENTITY) {
      warnings.push({
        check: 'publish_history_cap',
        entityKey,
        count,
        max: PUBLISH_SCHEDULE_MAX_PUBLISHED_PER_ENTITY,
        hint: 'Run node scripts/cleanupSchedulingQueues.js --apply to trim history',
      });
    }
  }

  return { failures, warnings, stats };
}

function auditNotificationScheduling(items, nowMs) {
  const failures = [];
  const warnings = [];
  const stats = {
    total: items.length,
    scheduled: 0,
    sent: 0,
    failed: 0,
    testPublishTitles: 0,
  };

  if (items.length > NOTIFICATION_SCHEDULE_MAX_ITEMS) {
    failures.push({
      check: 'notification_queue_cap',
      count: items.length,
      max: NOTIFICATION_SCHEDULE_MAX_ITEMS,
    });
  }

  const activeDedupe = new Map();
  for (const raw of items) {
    const item = raw || {};
    const status = String(item.status || '').trim().toLowerCase();
    if (status === 'scheduled') stats.scheduled += 1;
    if (status === 'sent') stats.sent += 1;
    if (status === 'failed') stats.failed += 1;
    if (String(item.title || '').includes('Test Published') || String(item.title || '').includes('New Test Published')) {
      stats.testPublishTitles += 1;
    }

    const dedupeKey = normalizeDedupeKeyForCompare(String(item.dedupeKey || '').trim());
    if (!dedupeKey || !isActiveDedupeStatus(status)) continue;
    const refMs = Date.parse(String(item.sentAt || item.scheduleAt || item.createdAt || ''));
    if (Number.isFinite(refMs) && nowMs - refMs > 24 * 60 * 60 * 1000) continue;
    if (!activeDedupe.has(dedupeKey)) {
      activeDedupe.set(dedupeKey, []);
    }
    activeDedupe.get(dedupeKey).push(item.id);
  }

  for (const [dedupeKey, ids] of activeDedupe.entries()) {
    if (ids.length > 1) {
      failures.push({
        check: 'notification_duplicate_dedupe_key',
        dedupeKey,
        ids,
      });
    }
  }

  const overdueScheduled = items.filter((item) => {
    if (String(item.status || '').trim().toLowerCase() !== 'scheduled') return false;
    const ms = Date.parse(String(item.scheduleAt || ''));
    return Number.isFinite(ms) && ms <= nowMs;
  });
  if (overdueScheduled.length > 3) {
    warnings.push({
      check: 'notification_backlog',
      overdueScheduled: overdueScheduled.length,
      hint: 'NOTIFICATION_SCHEDULER_DEFER_MS may space sends; check FCM if phone still spammed',
    });
  }

  return { failures, warnings, stats };
}

async function main() {
  console.log('=== Phase 5: notification fix verification ===\n');

  console.log('-- Unit smoke suites (phases 1–4) --');
  runSmokeSuites();

  console.log('\n-- Live DB audit --');
  const nowMs = Date.now();
  const publishItems = await loadSettingItems('publishScheduling');
  const notificationItems = await loadSettingItems('notificationScheduling');
  const advancedMap = await loadTestAdvancedConfigs();

  const publishAudit = auditPublishScheduling(publishItems, advancedMap, nowMs);
  const notificationAudit = auditNotificationScheduling(notificationItems, nowMs);

  const allFailures = [...publishAudit.failures, ...notificationAudit.failures];
  const allWarnings = [...publishAudit.warnings, ...notificationAudit.warnings];

  const report = {
    ok: allFailures.length === 0,
    publishScheduling: publishAudit.stats,
    notificationScheduling: notificationAudit.stats,
    failures: allFailures,
    warnings: allWarnings,
    manualQa: [
      'Admin manual publish → max 1 push per test/cycle (dedupeKey)',
      'Auto-cycle republish (default) → no push unless notifyOnCycleRepublish ON',
      'Phone: no repeated New Test Published spam after server restart + optional cleanup --apply',
    ],
  };

  console.log(JSON.stringify(report, null, 2));

  await pool.end();

  if (!report.ok) {
    console.error('\nPHASE5_VERIFY_FAILED');
    process.exit(1);
  }

  if (allWarnings.length) {
    console.log(`\nPHASE5_VERIFY_OK_WITH_${allWarnings.length}_WARNING(S)`);
  } else {
    console.log('\nPHASE5_VERIFY_OK');
  }
}

main().catch(async (e) => {
  console.error('phase5_verify_error', e.message || e);
  try {
    await pool.end();
  } catch {
    // ignore
  }
  process.exit(1);
});
