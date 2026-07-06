'use strict';

/**
 * Attempt limits within the current test catalog cycle.
 *
 * - attempts_allowed: max scored submissions per user per test id per cycle (default 1).
 * - reattemptCooldownMinutes: wait between tries when attempts_allowed > 1 (same cycle).
 * - Cycle boundary: tests.last_cycle_started_at — new cycle ⇒ attempt count resets.
 */

function parseCycleStartedAtMs(testRow) {
  const raw = String(testRow?.last_cycle_started_at || '').trim();
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Pure helper for offline verify — filters attempt timestamps to the active cycle.
 * When [cycleStartedAtMs] is null, all attempts count (legacy tests without cycle metadata).
 */
function filterAttemptTimestampsForCycle(attemptTimestampsMs, cycleStartedAtMs) {
  const list = Array.isArray(attemptTimestampsMs) ? attemptTimestampsMs : [];
  if (!Number.isFinite(cycleStartedAtMs)) {
    return list.filter((ms) => Number.isFinite(ms));
  }
  return list.filter((ms) => Number.isFinite(ms) && ms >= cycleStartedAtMs);
}

async function countUserTestAttempts(pool, userId, testCatalogId, cycleStartedAtMs = null) {
  const uid = String(userId || '').trim();
  const tid = String(testCatalogId || '').trim();
  if (!uid || !tid) return 0;
  const params = [uid, tid];
  let cycleSql = '';
  if (Number.isFinite(cycleStartedAtMs)) {
    params.push(new Date(cycleStartedAtMs).toISOString());
    cycleSql = ' AND completed_at >= $3::timestamptz';
  }
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM test_attempts
     WHERE user_id = $1::uuid AND test_catalog_id = $2::uuid${cycleSql}`,
    params,
  );
  return Math.max(0, Number(rows[0]?.count || 0));
}

async function lastUserTestAttemptAt(pool, userId, testCatalogId, cycleStartedAtMs = null) {
  const uid = String(userId || '').trim();
  const tid = String(testCatalogId || '').trim();
  if (!uid || !tid) return null;
  const params = [uid, tid];
  let cycleSql = '';
  if (Number.isFinite(cycleStartedAtMs)) {
    params.push(new Date(cycleStartedAtMs).toISOString());
    cycleSql = ' AND completed_at >= $3::timestamptz';
  }
  const { rows } = await pool.query(
    `SELECT completed_at
     FROM test_attempts
     WHERE user_id = $1::uuid AND test_catalog_id = $2::uuid${cycleSql}
     ORDER BY completed_at DESC
     LIMIT 1`,
    params,
  );
  const raw = rows[0]?.completed_at;
  if (!raw) return null;
  const ms = Date.parse(String(raw));
  return Number.isFinite(ms) ? ms : null;
}

function evaluateAttemptAccess({
  attemptsAllowed,
  reattemptCooldownMinutes,
  attemptCount,
  lastAttemptAtMs,
  nowMs = Date.now(),
}) {
  const allowedAttempts = Math.max(1, Number(attemptsAllowed || 1));
  const used = Math.max(0, Number(attemptCount || 0));
  if (used >= allowedAttempts) {
    return {
      allowed: false,
      error: 'You have used all allowed attempts for this test',
      attemptsUsed: used,
      attemptsAllowed: allowedAttempts,
    };
  }
  const cooldownMinutes = Math.max(0, Number(reattemptCooldownMinutes || 0));
  if (cooldownMinutes > 0 && used > 0 && Number.isFinite(lastAttemptAtMs)) {
    const retryAtMs = lastAttemptAtMs + cooldownMinutes * 60 * 1000;
    if (nowMs < retryAtMs) {
      return {
        allowed: false,
        error: 'Please wait before reattempting this test',
        retryAt: new Date(retryAtMs).toISOString(),
        attemptsUsed: used,
        attemptsAllowed: allowedAttempts,
      };
    }
  }
  return {
    allowed: true,
    attemptsUsed: used,
    attemptsAllowed: allowedAttempts,
    attemptsRemaining: Math.max(0, allowedAttempts - used),
  };
}

async function assertUserCanStartAttempt(pool, userId, testRow, advancedConfig, nowMs = Date.now()) {
  const testId = String(testRow?.id || '').trim();
  if (!testId) {
    return { allowed: false, error: 'Test not found' };
  }
  const cycleStartedAtMs = parseCycleStartedAtMs(testRow);
  const [attemptCount, lastAttemptAtMs] = await Promise.all([
    countUserTestAttempts(pool, userId, testId, cycleStartedAtMs),
    lastUserTestAttemptAt(pool, userId, testId, cycleStartedAtMs),
  ]);
  return evaluateAttemptAccess({
    attemptsAllowed: testRow?.attempts_allowed,
    reattemptCooldownMinutes: advancedConfig?.reattemptCooldownMinutes,
    attemptCount,
    lastAttemptAtMs,
    nowMs,
  });
}

module.exports = {
  parseCycleStartedAtMs,
  filterAttemptTimestampsForCycle,
  countUserTestAttempts,
  lastUserTestAttemptAt,
  evaluateAttemptAccess,
  assertUserCanStartAttempt,
};
