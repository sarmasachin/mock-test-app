#!/usr/bin/env node
'use strict';

const {
  buildTestPublishDedupeKey,
  prependNotificationIfNotDuplicate,
  resolveNotificationDeliveryOutcome,
} = require('../src/lib/notificationScheduling');

function line(ok, msg) {
  console.log(`${ok ? 'OK' : '!!'}  ${msg}`);
  return ok;
}

let ok = true;

ok = line(
  resolveNotificationDeliveryOutcome({ sent: 1, failed: 0, total: 1 }).succeeded === true,
  'sent=1 → success (publish push delivered)',
) && ok;

ok = line(
  resolveNotificationDeliveryOutcome({ sent: 5, failed: 2, total: 7 }).succeeded === true,
  'partial delivery (sent>0, failed>0) → still success',
) && ok;

ok = line(
  resolveNotificationDeliveryOutcome({ sent: 5, failed: 2, total: 7 }).lastError === 'partial_delivery',
  'partial delivery records lastError=partial_delivery',
) && ok;

const noTokens = resolveNotificationDeliveryOutcome({ sent: 0, failed: 0, total: 0 });
ok = line(noTokens.succeeded === false && noTokens.lastError === 'no_device_tokens', 'sent=0 total=0 → no_device_tokens') && ok;

const allFailed = resolveNotificationDeliveryOutcome({ sent: 0, failed: 3, total: 3 });
ok = line(allFailed.succeeded === false && allFailed.lastError === 'all_tokens_failed', 'sent=0 all failed → all_tokens_failed') && ok;

const testId = '22222222-2222-2222-2222-222222222222';
const cycleIso = '2026-07-06T20:00:00.000Z';
const dedupeKey = buildTestPublishDedupeKey(testId, cycleIso);
ok = line(dedupeKey === `test_publish:${testId}:${cycleIso}`, 'publish dedupe key format') && ok;

const enqueue = prependNotificationIfNotDuplicate(
  { items: [] },
  {
    title: 'New Test Published',
    message: 'Sample test is now available.',
    target: 'all',
    deepLink: 'main/tests',
    scheduleAt: new Date().toISOString(),
    dedupeKey,
  },
);
ok = line(enqueue.enqueued === true, 'publish notification enqueues into notificationScheduling') && ok;
ok = line(
  String(enqueue.newItem?.title || '') === 'New Test Published' &&
    String(enqueue.newItem?.status || '') === 'scheduled',
  'queued item has title + scheduled status',
) && ok;

const duplicate = prependNotificationIfNotDuplicate(enqueue.current, {
  title: 'New Test Published',
  message: 'Sample test is now available.',
  target: 'all',
  deepLink: 'main/tests',
  scheduleAt: new Date().toISOString(),
  dedupeKey,
});
ok = line(duplicate.skipped === true, 'same cycle dedupe skips duplicate publish push') && ok;

async function printDbSnapshot() {
  let pool;
  try {
    require('dotenv').config();
    pool = require('../src/db').pool;
    const tokenStats = await pool.query(
      `SELECT COUNT(*)::int AS total, COUNT(DISTINCT user_id)::int AS users
       FROM user_device_tokens
       WHERE is_active = true`,
    );
    const row = tokenStats.rows[0] || { total: 0, users: 0 };
    console.log(`\nINFO  active device tokens: total=${row.total}, users=${row.users}`);
    if (row.total <= 0) {
      console.log('WARN  publish push will queue as failed until a phone logs in and registers a token');
    }

    const fcmProject = String(process.env.FCM_PROJECT_ID || '').trim();
    const fcmJsonLen = String(process.env.FCM_SERVICE_ACCOUNT_JSON || '').trim().length;
    console.log(`INFO  FCM_PROJECT_ID=${fcmProject || '(empty)'} JSON_chars=${fcmJsonLen}`);
    if (!fcmProject || fcmJsonLen <= 0) {
      console.log('WARN  FCM env missing — run: npm run verify:fcm-env');
    }

    const ns = await pool.query(
      `SELECT setting_value FROM app_settings WHERE setting_key = 'notificationScheduling' LIMIT 1`,
    );
    let items = [];
    try {
      items = JSON.parse(String(ns.rows[0]?.setting_value || '{}')).items || [];
    } catch {
      items = [];
    }
    const publishItems = items.filter((it) => String(it.title || '').includes('Test Published'));
    const latest = publishItems[0];
    if (latest) {
      console.log(
        'INFO  latest publish queue item:',
        JSON.stringify({
          status: latest.status,
          lastRunSent: latest.lastRunSent,
          lastRunFailed: latest.lastRunFailed,
          lastError: latest.lastError,
        }),
      );
    } else {
      console.log('INFO  no "Test Published" items in notificationScheduling yet');
    }
  } catch (e) {
    console.log('INFO  DB snapshot skipped:', e.message || e);
  } finally {
    if (pool) await pool.end().catch(() => {});
  }
}

(async () => {
  if (!ok) {
    console.error('PUBLISH_PUSH_PHASE5_VERIFY_FAIL');
    process.exit(1);
  }
  console.log('PUBLISH_PUSH_PHASE5_VERIFY_OK');
  await printDbSnapshot();
})();
