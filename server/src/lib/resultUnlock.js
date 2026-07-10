'use strict';

/**
 * Shared result-unlock timing for email scheduler and cycle rollover deferral.
 * Matches app rule: after_result_time uses resultReleaseAt or completed_at + delayHours.
 */

const DEFAULT_DELAY_HOURS = 3;

function parseResultUnlockEmailSettings(raw) {
  if (!raw) {
    return { enabled: true, delayHours: DEFAULT_DELAY_HOURS };
  }
  try {
    const parsed = typeof raw === 'object' ? raw : JSON.parse(String(raw || '{}'));
    return {
      enabled: parsed?.enabled !== false,
      delayHours: Math.max(0, Math.min(168, Number(parsed?.delayHours ?? DEFAULT_DELAY_HOURS))),
    };
  } catch (_e) {
    return { enabled: true, delayHours: DEFAULT_DELAY_HOURS };
  }
}

async function loadResultUnlockEmailSettings(pool) {
  const res = await pool.query(
    `SELECT setting_value FROM app_settings WHERE setting_key = 'resultUnlockEmailSettings' LIMIT 1`,
  );
  return parseResultUnlockEmailSettings(res.rows[0]?.setting_value);
}

function isResultVisibilityDeferred(resultVisibility) {
  return String(resultVisibility || '')
    .trim()
    .toLowerCase() === 'after_result_time';
}

/**
 * When false, scheduler rolls over at exam end even if deferred results are pending (legacy).
 * Default: enabled unless explicitly set to 0/false/off.
 */
function isCycleRolloverDeferEnabled() {
  const raw = String(process.env.CYCLE_ROLLOVER_DEFER_RESULTS ?? 'true')
    .trim()
    .toLowerCase();
  return !['0', 'false', 'no', 'off'].includes(raw);
}

/**
 * @param {Date|string|number} completedAt
 * @param {Date|string|null|undefined} resultReleaseAt
 * @param {number} delayHours
 * @returns {number} epoch ms
 */
function resolveAttemptUnlockAtMs(completedAt, resultReleaseAt, delayHours) {
  const releaseMs = Date.parse(String(resultReleaseAt || ''));
  if (Number.isFinite(releaseMs)) return releaseMs;
  let completedMs;
  if (completedAt instanceof Date) {
    completedMs = completedAt.getTime();
  } else if (typeof completedAt === 'number' && Number.isFinite(completedAt)) {
    completedMs = completedAt;
  } else {
    completedMs = Date.parse(String(completedAt || ''));
  }
  if (!Number.isFinite(completedMs)) return Number.NaN;
  const hours = Math.max(0, Math.min(168, Number(delayHours ?? DEFAULT_DELAY_HOURS)));
  return completedMs + hours * 60 * 60 * 1000;
}

/**
 * True when any attempt in the current catalog cycle still awaits result unlock.
 * Used to defer processTestCycleAutoReschedule until results are released.
 */
async function hasPendingDeferredResultsInCycle({
  db,
  testId,
  lastCycleStartedAt,
  delayHours,
  now = new Date(),
}) {
  const id = String(testId || '').trim();
  if (!id) return false;
  const cycleIso = lastCycleStartedAt
    ? new Date(lastCycleStartedAt).toISOString()
    : null;
  const nowIso = now instanceof Date ? now.toISOString() : new Date(now).toISOString();
  const delay = Math.max(0, Math.min(168, Number(delayHours ?? DEFAULT_DELAY_HOURS)));
  const { rows } = await db.query(
    `SELECT EXISTS (
       SELECT 1
       FROM test_attempts ta
       INNER JOIN tests t ON t.id = ta.test_catalog_id
       WHERE ta.test_catalog_id = $1::uuid
         AND ($2::timestamptz IS NULL OR ta.completed_at >= $2::timestamptz)
         AND COALESCE(
               t.result_release_at,
               ta.completed_at + make_interval(hours => $3::int)
             ) > $4::timestamptz
       LIMIT 1
     ) AS pending`,
    [id, cycleIso, delay, nowIso],
  );
  return rows[0]?.pending === true;
}

/**
 * Pure helper for offline verify — should scheduler skip rollover now?
 */
function shouldDeferCycleRolloverForTest({
  resultVisibility,
  deferEnabled = true,
  hasPendingResults,
}) {
  if (!deferEnabled) return false;
  if (!isResultVisibilityDeferred(resultVisibility)) return false;
  return Boolean(hasPendingResults);
}

module.exports = {
  DEFAULT_DELAY_HOURS,
  parseResultUnlockEmailSettings,
  loadResultUnlockEmailSettings,
  isResultVisibilityDeferred,
  isCycleRolloverDeferEnabled,
  resolveAttemptUnlockAtMs,
  hasPendingDeferredResultsInCycle,
  shouldDeferCycleRolloverForTest,
};
