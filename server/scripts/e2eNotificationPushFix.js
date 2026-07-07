'use strict';

/**
 * Notification fix — integrated E2E (DB + mocked FCM, no real push spam).
 *
 * Usage:
 *   node scripts/e2eNotificationPushFix.js
 */
require('dotenv').config();

const {
  buildTestPublishDedupeKey,
  prependNotificationIfNotDuplicate,
} = require('../src/lib/notificationScheduling');
const {
  resolvePushDedupeKey,
  androidNotificationTagFromDedupeKey,
} = require('../src/notificationDispatch');
const {
  sendPushToAudience,
  recordUserPushDelivery,
  loadDeliveredUserIdsForDedupe,
  filterRecipientsAlreadyDelivered,
} = require('../src/lib/pushAudienceDelivery');
const { pool } = require('../src/db');

function line(ok, msg) {
  console.log(`${ok ? 'OK' : 'FAIL'}  ${msg}`);
  return ok;
}

async function auditLiveDb(client) {
  let ok = true;
  const tokens = await client.query(
    `SELECT COUNT(*)::int AS total, COUNT(DISTINCT user_id)::int AS users
     FROM user_device_tokens WHERE is_active = true`,
  );
  const row = tokens.rows[0] || { total: 0, users: 0 };
  ok = line(true, `active device tokens: total=${row.total}, users=${row.users}`) && ok;
  if (row.total <= 0) {
    console.log('WARN  no active tokens in this DB — live phone push needs login + token sync');
  }

  const deliveries = await client.query(`SELECT COUNT(*)::int AS total FROM user_push_deliveries`);
  ok = line(true, `user_push_deliveries rows: ${deliveries.rows[0]?.total ?? 0}`) && ok;

  const tableCheck = await client.query(
    `SELECT to_regclass('public.user_push_deliveries') AS reg`,
  );
  ok = line(Boolean(tableCheck.rows[0]?.reg), 'user_push_deliveries table exists') && ok;

  const ns = await client.query(
    `SELECT setting_value FROM app_settings WHERE setting_key = 'notificationScheduling' LIMIT 1`,
  );
  let items = [];
  try {
    items = JSON.parse(String(ns.rows[0]?.setting_value || '{}')).items || [];
  } catch {
    items = [];
  }
  const activeDupes = new Map();
  const nowMs = Date.now();
  for (const item of items) {
    const status = String(item.status || '').trim().toLowerCase();
    if (!['scheduled', 'processing', 'sent', 'failed'].includes(status)) continue;
    const key = String(item.dedupeKey || '').trim();
    if (!key) continue;
    const refMs = Date.parse(String(item.sentAt || item.scheduleAt || item.createdAt || ''));
    if (Number.isFinite(refMs) && nowMs - refMs > 24 * 60 * 60 * 1000) continue;
    if (!activeDupes.has(key)) activeDupes.set(key, 0);
    activeDupes.set(key, activeDupes.get(key) + 1);
  }
  const dupeViolations = [...activeDupes.entries()].filter(([, count]) => count > 1);
  ok = line(dupeViolations.length === 0, 'notificationScheduling has no active duplicate dedupe keys') && ok;
  if (dupeViolations.length) {
    console.log('FAIL detail', dupeViolations.slice(0, 3));
  }

  const failedPublish = items.filter(
    (it) =>
      String(it.status || '').toLowerCase() === 'failed' &&
      String(it.title || '').includes('Test Published'),
  );
  if (failedPublish.length) {
    console.log(
      `INFO  ${failedPublish.length} failed "Test Published" queue item(s) — usually no_device_tokens or FCM error at send time`,
    );
  }
  return ok;
}

async function simulatePublishDedupeChain() {
  let ok = true;
  const testId = 'e2e-notif-0000-0000-0000-000000000001';
  const cycleIso = '2026-07-07T15:30:00.000Z';
  const dedupeKey = buildTestPublishDedupeKey(testId, cycleIso);
  const first = prependNotificationIfNotDuplicate({ items: [] }, {
    title: 'New Test Published',
    message: 'E2E sample',
    target: 'all',
    deepLink: 'main/tests',
    scheduleAt: new Date().toISOString(),
    dedupeKey,
  });
  const second = prependNotificationIfNotDuplicate(first.current, {
    title: 'New Test Published',
    message: 'E2E sample duplicate',
    target: 'all',
    deepLink: 'main/tests',
    scheduleAt: new Date().toISOString(),
    dedupeKey,
  });
  ok = line(first.enqueued === true, 'publish enqueue: first item accepted') && ok;
  ok = line(second.skipped === true, 'publish enqueue: duplicate cycle blocked') && ok;
  ok = line(
    resolvePushDedupeKey({ dedupeKey }) === dedupeKey,
    'FCM payload resolves same dedupeKey',
  ) && ok;
  ok = line(
    androidNotificationTagFromDedupeKey(dedupeKey).length > 0,
    'FCM android tag derived from dedupeKey',
  ) && ok;
  return ok;
}

async function simulatePerUserDeliveryWithMockFcm(client) {
  let ok = true;
  const capturedPayloads = [];
  const dedupeKey = `e2e_notif_push:${Date.now()}`;
  const userId = 'e2e00000-0000-4000-8000-000000000099';
  const token = `e2e-fcm-token-${Date.now()}`;

  const dispatchPath = require.resolve('../src/notificationDispatch');
  const audiencePath = require.resolve('../src/lib/pushAudienceDelivery');
  const originalDispatch = require(dispatchPath);
  const originalSend = originalDispatch.sendPushToToken;

  require.cache[dispatchPath].exports.sendPushToToken = async (deviceToken, payload) => {
    capturedPayloads.push({ deviceToken, payload: { ...payload } });
    return { ok: true };
  };
  delete require.cache[audiencePath];

  await client.query('BEGIN');
  try {
    const publicId = 100000 + Math.floor(Math.random() * 89999999);
    await client.query(
      `INSERT INTO users (id, email, password_hash, display_name, phone, six_digit_public_id)
       VALUES ($1, $2, 'e2e-hash', 'E2E Push User', '', $3)
       ON CONFLICT (id) DO NOTHING`,
      [userId, `e2e-push-${Date.now()}@mocktest.local`, publicId],
    );
    await client.query(
      `INSERT INTO user_device_tokens (user_id, device_token, platform, is_active, updated_at)
       VALUES ($1, $2, 'android', true, NOW())
       ON CONFLICT (device_token) DO UPDATE
         SET user_id = EXCLUDED.user_id, is_active = true, updated_at = NOW()`,
      [userId, token],
    );

    const { sendPushToAudience: sendFresh } = require('../src/lib/pushAudienceDelivery');

    const first = await sendFresh({
      title: 'E2E Publish Push',
      message: 'First delivery',
      target: 'all',
      deepLink: 'main/tests',
      dedupeKey,
      db: client,
    });
    ok = line(first.sent === 1 && first.skipped === 0, 'per-user send: first delivery sent=1') && ok;
    ok = line(capturedPayloads.length === 1, 'mock FCM: exactly one HTTP send') && ok;
    ok = line(
      capturedPayloads[0]?.payload?.dedupeKey === dedupeKey,
      'mock FCM payload includes dedupeKey',
    ) && ok;

    const second = await sendFresh({
      title: 'E2E Publish Push',
      message: 'Duplicate attempt',
      target: 'all',
      deepLink: 'main/tests',
      dedupeKey,
      db: client,
    });
    ok = line(second.sent === 0 && second.skipped === 1, 'per-user send: duplicate skipped') && ok;
    ok = line(capturedPayloads.length === 1, 'mock FCM: no second send on duplicate') && ok;

    const delivered = await loadDeliveredUserIdsForDedupe({
      db: client,
      dedupeKey,
      userIds: [userId],
    });
    ok = line(delivered.has(userId), 'user_push_deliveries recorded for user') && ok;

    const filtered = filterRecipientsAlreadyDelivered(
      [{ user_id: userId, token }],
      delivered,
    );
    ok = line(filtered.skipped === 1 && filtered.recipients.length === 0, 'recipient filter blocks re-delivery') && ok;

    const idempotent = await recordUserPushDelivery({ db: client, userId, dedupeKey });
    ok = line(idempotent === true, 'recordUserPushDelivery is idempotent on conflict') && ok;
  } finally {
    await client.query('ROLLBACK');
    require.cache[dispatchPath].exports.sendPushToToken = originalSend;
    delete require.cache[audiencePath];
  }
  return ok;
}

async function main() {
  console.log('=== E2E: Notification Push Fix ===\n');
  let ok = true;

  console.log('-- Offline publish dedupe chain --');
  ok = (await simulatePublishDedupeChain()) && ok;

  if (!process.env.DATABASE_URL) {
    console.log('\nINFO  DATABASE_URL unset — skipping DB integration block');
    if (!ok) process.exit(1);
    console.log('\nE2E_NOTIFICATION_PUSH_FIX_OK (offline only)');
    return;
  }

  const client = await pool.connect();
  try {
    console.log('\n-- Live DB audit (read-only) --');
    ok = (await auditLiveDb(client)) && ok;

    console.log('\n-- DB integration (transaction rollback, mocked FCM) --');
    ok = (await simulatePerUserDeliveryWithMockFcm(client)) && ok;
  } finally {
    client.release();
    await pool.end();
  }

  if (!ok) {
    console.error('\nE2E_NOTIFICATION_PUSH_FIX_FAILED');
    process.exit(1);
  }
  console.log('\nE2E_NOTIFICATION_PUSH_FIX_OK');
}

main().catch(async (e) => {
  console.error('e2e_notification_push_fix_error', e.message || e);
  try {
    await pool.end();
  } catch {
    // ignore
  }
  process.exit(1);
});
