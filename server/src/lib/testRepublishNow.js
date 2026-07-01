'use strict';

const {
  getPublishSchedulingItems,
  savePublishSchedulingItems,
  isPublishScheduleItemPending,
} = require('./testVisibility');

/**
 * Promote waitlisted users when a test opens — shared by scheduler and admin republish-now.
 */
async function promoteWaitlistForTest(pool, testId) {
  const id = String(testId || '').trim();
  if (!id) return { promotedCount: 0, waitingLeft: 0 };
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const testRes = await client.query(
      `SELECT id, capacity_total, enrolled_count
       FROM tests
       WHERE id = $1::uuid
       LIMIT 1
       FOR UPDATE`,
      [id],
    );
    const test = testRes.rows[0];
    if (!test) {
      await client.query('COMMIT');
      return { promotedCount: 0, waitingLeft: 0 };
    }
    const capacity = Math.max(0, Number(test.capacity_total || 0));
    const currentEnrolled = Math.max(0, Number(test.enrolled_count || 0));
    let availableSeats = capacity > 0 ? Math.max(0, capacity - currentEnrolled) : Number.MAX_SAFE_INTEGER;
    if (availableSeats <= 0) {
      await client.query('COMMIT');
      return { promotedCount: 0, waitingLeft: 0 };
    }

    const waitRes = await client.query(
      `SELECT id, user_id
       FROM test_waitlist
       WHERE test_id = $1::uuid AND status = 'waiting'
       ORDER BY created_at ASC, id ASC
       FOR UPDATE`,
      [id],
    );
    const waitingRows = waitRes.rows || [];
    if (!waitingRows.length) {
      await client.query('COMMIT');
      return { promotedCount: 0, waitingLeft: 0 };
    }

    const toPromote = waitingRows.slice(0, Math.min(availableSeats, waitingRows.length));
    let promotedCount = 0;
    const promotedIds = [];
    for (const row of toPromote) {
      const insertRes = await client.query(
        `INSERT INTO test_applications (user_id, test_id)
         VALUES ($1::uuid, $2::uuid)
         ON CONFLICT (user_id, test_id) DO NOTHING`,
        [String(row.user_id), id],
      );
      if (insertRes.rowCount > 0) {
        promotedCount += 1;
        promotedIds.push(Number(row.id));
      }
      availableSeats -= 1;
      if (availableSeats <= 0) break;
    }

    if (promotedIds.length > 0) {
      await client.query(
        `UPDATE test_waitlist
         SET status = 'promoted', promoted_at = now()
         WHERE id = ANY($1::bigint[])`,
        [promotedIds],
      );
    }
    if (promotedCount > 0) {
      await client.query(
        `UPDATE tests
         SET enrolled_count = enrolled_count + $2, updated_at = now()
         WHERE id = $1::uuid`,
        [id, promotedCount],
      );
    }
    const leftRes = await client.query(
      `SELECT COUNT(*)::int AS total
       FROM test_waitlist
       WHERE test_id = $1::uuid AND status = 'waiting'`,
      [id],
    );
    const waitingLeft = Number(leftRes.rows?.[0]?.total || 0);
    await client.query('COMMIT');
    return { promotedCount, waitingLeft };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Mark pending auto-republish schedule rows as published so manual republish does not double-fire.
 */
async function finalizePendingRepublishSchedules(pool, testId) {
  const id = String(testId || '').trim();
  if (!id) return { updatedCount: 0 };
  const items = await getPublishSchedulingItems(pool);
  const nowIso = new Date().toISOString();
  let updatedCount = 0;
  const nextItems = items.map((raw) => {
    const item = raw || {};
    if (String(item.entityType || '').toLowerCase() !== 'test') return item;
    if (String(item.entityId || '').trim() !== id) return item;
    const action = String(item.action || 'publish').trim().toLowerCase();
    if (action === 'unpublish') return item;
    if (!isPublishScheduleItemPending(item)) return item;
    updatedCount += 1;
    return {
      ...item,
      status: 'published',
      processedAt: nowIso,
      processingStartedAt: String(item.processingStartedAt || nowIso),
      lastError: '',
    };
  });
  if (updatedCount > 0) {
    await savePublishSchedulingItems(nextItems, null, pool);
  }
  return { updatedCount };
}

/**
 * Start a new live cycle immediately (no push notification — admin manual action).
 *
 * @param {object} options
 * @param {import('pg').Pool} options.pool
 * @param {string} options.testId
 * @param {(testId: string) => Promise<void>} [options.regenerateTestFromSubcategoryPool]
 */
async function republishTestNow({ pool, testId, regenerateTestFromSubcategoryPool }) {
  const id = String(testId || '').trim();
  if (!id) throw new Error('test_id_required');

  if (typeof regenerateTestFromSubcategoryPool === 'function') {
    await regenerateTestFromSubcategoryPool(id);
  }

  await pool.query(
    `UPDATE tests
     SET is_published = true, last_cycle_started_at = now(), updated_at = now()
     WHERE id = $1::uuid`,
    [id],
  );

  const waitlist = await promoteWaitlistForTest(pool, id);
  const schedules = await finalizePendingRepublishSchedules(pool, id);

  return { waitlist, schedules };
}

module.exports = {
  promoteWaitlistForTest,
  finalizePendingRepublishSchedules,
  republishTestNow,
};
