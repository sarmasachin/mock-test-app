'use strict';

/**
 * Attempt limits within a single test catalog id (all cycles share attempt count today).
 *
 * - attempts_allowed: max scored submissions per user per test id (default 1).
 * - reattemptCooldownMinutes: wait between tries when attempts_allowed > 1.
 * - New catalog cycle (last_cycle_started_at) does NOT reset attempt count here — it only
 *   changes shuffle seed via questions-attempt (see SHUFFLE_AND_ATTEMPT_RULES.txt §5).
 */

async function countUserTestAttempts(pool, userId, testCatalogId) {
  const uid = String(userId || '').trim();
  const tid = String(testCatalogId || '').trim();
  if (!uid || !tid) return 0;
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM test_attempts
     WHERE user_id = $1::uuid AND test_catalog_id = $2::uuid`,
    [uid, tid],
  );
  return Math.max(0, Number(rows[0]?.count || 0));
}

async function lastUserTestAttemptAt(pool, userId, testCatalogId) {
  const uid = String(userId || '').trim();
  const tid = String(testCatalogId || '').trim();
  if (!uid || !tid) return null;
  const { rows } = await pool.query(
    `SELECT completed_at
     FROM test_attempts
     WHERE user_id = $1::uuid AND test_catalog_id = $2::uuid
     ORDER BY completed_at DESC
     LIMIT 1`,
    [uid, tid],
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
  const [attemptCount, lastAttemptAtMs] = await Promise.all([
    countUserTestAttempts(pool, userId, testId),
    lastUserTestAttemptAt(pool, userId, testId),
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
  countUserTestAttempts,
  lastUserTestAttemptAt,
  evaluateAttemptAccess,
  assertUserCanStartAttempt,
};
