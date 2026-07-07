'use strict';

/**
 * Phase 2 — per-user push dedupe + one token per user.
 *
 * Usage:
 *   node scripts/verifyPerUserPushDedupePhase2.js
 */
require('dotenv').config();

const assert = require('assert');
const {
  normalizeDeliveryDedupeKey,
  buildNotificationScheduleDedupeKey,
  buildCampaignDedupeKey,
  filterRecipientsAlreadyDelivered,
  ensureUserPushDeliveriesTable,
  recordUserPushDelivery,
  loadDeliveredUserIdsForDedupe,
} = require('../src/lib/pushAudienceDelivery');
const { buildTestPublishDedupeKey } = require('../src/lib/notificationScheduling');

function line(ok, msg) {
  const tag = ok ? 'OK ' : 'FAIL';
  console.log(`${tag}  ${msg}`);
  return ok;
}

let ok = true;

ok = line(
  normalizeDeliveryDedupeKey(buildTestPublishDedupeKey('t1', '2026-07-01T05:21:03.095Z')) ===
    'test_publish:t1:2026-07-01T05:21:03.000Z',
  'delivery dedupe key normalizes test_publish cycle to second bucket',
) && ok;

ok = line(
  buildNotificationScheduleDedupeKey({
    id: 'schedule-1',
    dedupeKey: buildTestPublishDedupeKey('t1', '2026-07-01T05:21:03.095Z'),
  }) === 'test_publish:t1:2026-07-01T05:21:03.000Z',
  'schedule item prefers explicit dedupeKey',
) && ok;

ok = line(
  buildNotificationScheduleDedupeKey({ id: 'schedule-abc', dedupeKey: '' }) === 'notif_schedule:schedule-abc',
  'schedule item falls back to notif_schedule:id',
) && ok;

ok = line(
  buildCampaignDedupeKey('cmp-123') === 'campaign:cmp-123',
  'campaign dedupe key format',
) && ok;

const recipients = [
  { user_id: 'u1', token: 'a' },
  { user_id: 'u2', token: 'b' },
  { user_id: 'u3', token: 'c' },
];
const filtered = filterRecipientsAlreadyDelivered(recipients, new Set(['u2']));
ok = line(filtered.skipped === 1 && filtered.recipients.length === 2, 'filterRecipientsAlreadyDelivered skips delivered users') && ok;
ok = line(
  filtered.recipients.every((r) => String(r.user_id) !== 'u2'),
  'filtered list excludes delivered user',
) && ok;

async function dbChecks() {
  if (!process.env.DATABASE_URL) {
    console.log('INFO  DATABASE_URL unset — skipping live DB checks');
    return true;
  }
  const { pool } = require('../src/db');
  let dbOk = true;
  try {
    await ensureUserPushDeliveriesTable(pool);
    const dedupeKey = `phase2_verify:${Date.now()}`;
    const userRes = await pool.query(`SELECT id::text AS id FROM users ORDER BY created_at ASC LIMIT 1`);
    const userId = String(userRes.rows[0]?.id || '').trim();
    if (!userId) {
      console.log('INFO  no users in DB — skipping delivery row checks');
      return dbOk;
    }
    await recordUserPushDelivery({ db: pool, userId, dedupeKey });
    const delivered = await loadDeliveredUserIdsForDedupe({
      db: pool,
      dedupeKey,
      userIds: [userId],
    });
    dbOk = line(delivered.has(userId), 'recordUserPushDelivery persists row') && dbOk;
    const secondInsert = await recordUserPushDelivery({ db: pool, userId, dedupeKey });
    dbOk = line(secondInsert === true, 'recordUserPushDelivery is idempotent on conflict') && dbOk;
    await pool.query(`DELETE FROM user_push_deliveries WHERE user_id = $1::uuid AND dedupe_key = $2`, [
      userId,
      dedupeKey,
    ]);
  } finally {
    await pool.end();
  }
  return dbOk;
}

(async () => {
  console.log('=== Phase 2: per-user push dedupe verification ===\n');
  ok = (await dbChecks()) && ok;
  if (!ok) {
    console.error('\nPER_USER_PUSH_DEDUPE_PHASE2_VERIFY_FAILED');
    process.exit(1);
  }
  console.log('\nPER_USER_PUSH_DEDUPE_PHASE2_VERIFY_OK');
})().catch(async (e) => {
  console.error('per_user_push_dedupe_phase2_verify_error', e.message || e);
  try {
    const { pool } = require('../src/db');
    await pool.end();
  } catch {
    // ignore
  }
  process.exit(1);
});
