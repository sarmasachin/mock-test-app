'use strict';

const {
  isTestCatalogVisible,
  catalogVisibilityError,
  isBeforeScheduledPublish,
  isAfterScheduledUnpublish,
  isPastValidUntil,
  getPublishSchedulingItems,
  isPublishScheduleItemPending,
} = require('./testVisibility');
const { cycleRepublishAtMs } = require('./cycleRepublishGap');
const { evaluateTestStartAccess } = require('./testStartAccess');
const {
  resolveApplyWindowState,
  resolveSchedulerCycleEndMs,
} = require('./testCycleWindow');

/**
 * @typedef {'live'|'between_cycles'|'unpublished'|'scheduled'|'closed'|'not_found'} TestCyclePhase
 */

function findEarliestPendingRepublishSchedule(publishScheduleItems, testId) {
  const id = String(testId || '').trim();
  if (!id) return null;
  const matches = (Array.isArray(publishScheduleItems) ? publishScheduleItems : [])
    .filter((item) => {
      if (String(item?.entityType || '').toLowerCase() !== 'test') return false;
      if (String(item?.entityId || '').trim() !== id) return false;
      if (!isPublishScheduleItemPending(item)) return false;
      const action = String(item?.action || 'publish').trim().toLowerCase();
      return action !== 'unpublish';
    })
    .map((item) => ({
      item,
      scheduleMs: Date.parse(String(item?.scheduleAt || '')),
    }))
    .filter((x) => Number.isFinite(x.scheduleMs))
    .sort((a, b) => a.scheduleMs - b.scheduleMs);
  return matches[0]?.item || null;
}

/**
 * @param {object} row — tests DB row
 * @param {object|null|undefined} advancedConfig
 * @param {number} [nowMs]
 * @param {object[]} [publishScheduleItems]
 * @returns {TestCyclePhase}
 */
function resolveTestCyclePhase(row, advancedConfig, nowMs = Date.now(), publishScheduleItems = []) {
  if (!row) return 'not_found';
  const adv = advancedConfig && typeof advancedConfig === 'object' ? advancedConfig : {};

  if (isPastValidUntil(row.valid_until, nowMs) || isAfterScheduledUnpublish(adv.unpublishAt, nowMs)) {
    return 'closed';
  }
  if (isBeforeScheduledPublish(adv.publishAt, nowMs)) {
    return 'scheduled';
  }
  if (isTestCatalogVisible(row, adv, nowMs)) {
    return 'live';
  }

  const cycleEndMs = resolveSchedulerCycleEndMs(row);
  const pendingRepublish = findEarliestPendingRepublishSchedule(publishScheduleItems, row.id);
  const cycleEnded = Number.isFinite(cycleEndMs) && nowMs >= cycleEndMs;

  if (row.is_published !== true && (cycleEnded || pendingRepublish)) {
    return 'between_cycles';
  }

  return 'unpublished';
}

/**
 * @returns {string|null} ISO datetime
 */
function resolveRepublishAtIso(row, advancedConfig, publishScheduleItems = []) {
  if (!row) return null;
  const pending = findEarliestPendingRepublishSchedule(publishScheduleItems, row.id);
  if (pending?.scheduleAt) {
    const ms = Date.parse(String(pending.scheduleAt));
    if (Number.isFinite(ms)) return new Date(ms).toISOString();
  }
  const cycleEndMs = resolveSchedulerCycleEndMs(row);
  if (!Number.isFinite(cycleEndMs)) return null;
  const republishMs = cycleRepublishAtMs(cycleEndMs, advancedConfig);
  if (!Number.isFinite(republishMs)) return null;
  return new Date(republishMs).toISOString();
}

function resolveUserFacingBlockReason({
  cyclePhase,
  catalogError,
  alreadyAppliedInCurrentCycle,
}) {
  if (alreadyAppliedInCurrentCycle) {
    return 'You already applied for this test';
  }
  if (cyclePhase === 'between_cycles') {
    return 'Test is between cycles — opens again when republished';
  }
  if (cyclePhase === 'scheduled') {
    return 'Test is not available yet';
  }
  if (cyclePhase === 'closed') {
    return catalogError || 'Test registration has closed';
  }
  if (catalogError) return catalogError;
  if (cyclePhase === 'unpublished') {
    return 'Test is not published';
  }
  return 'Test is not open for applications right now';
}

/**
 * @param {object|null|undefined} row — tests DB row
 * @returns {{ capacityTotal: number, enrolledCount: number, remainingSeats: number }}
 */
function resolveEnrollmentFromTestRow(row) {
  const capacityTotal = Math.max(0, Number(row?.capacity_total || 0));
  const enrolledCount = Math.max(0, Number(row?.enrolled_count || 0));
  return {
    capacityTotal,
    enrolledCount,
    remainingSeats: Math.max(0, capacityTotal - enrolledCount),
  };
}

/**
 * Build resolve payload for GET /tests/resolve (Phase 2).
 *
 * @param {object} options
 * @param {object|null} options.row — tests row (any is_published state)
 * @param {object|null|undefined} options.advancedConfig
 * @param {number} [options.nowMs]
 * @param {object[]} [options.publishScheduleItems]
 * @param {boolean} [options.alreadyAppliedInCurrentCycle]
 * @param {boolean} [options.mayReapplyForNewCycle] — application from older cycle while test is live
 */
function buildTestResolvePayload({
  row,
  advancedConfig,
  nowMs = Date.now(),
  publishScheduleItems = [],
  alreadyAppliedInCurrentCycle = false,
  mayReapplyForNewCycle = false,
  scheduleTimerEnabled = false,
  examDate = null,
  slotLabel = '',
  attemptAccess = null,
}) {
  if (!row) {
    return {
      found: false,
      cyclePhase: 'not_found',
      catalogVisible: false,
      canApply: false,
      blockReason: 'Test not found',
      canStart: false,
      startBlockReason: null,
      joinClosesAt: null,
    };
  }

  const adv = advancedConfig && typeof advancedConfig === 'object' ? advancedConfig : {};
  const catalogVisible = isTestCatalogVisible(row, adv, nowMs);
  const catalogError = catalogVisibilityError(row, adv, nowMs);
  const cyclePhase = resolveTestCyclePhase(row, adv, nowMs, publishScheduleItems);
  const republishAt = cyclePhase === 'between_cycles' ? resolveRepublishAtIso(row, adv, publishScheduleItems) : null;
  const applyWindow = resolveApplyWindowState(row, nowMs);

  const canApply =
    cyclePhase === 'live' &&
    !catalogError &&
    !alreadyAppliedInCurrentCycle &&
    applyWindow.open;

  const canReapplyForNewCycle =
    cyclePhase === 'live' &&
    !catalogError &&
    mayReapplyForNewCycle &&
    applyWindow.open;

  const phaseBlockReason = resolveUserFacingBlockReason({
    cyclePhase,
    catalogError,
    alreadyAppliedInCurrentCycle,
  });

  const blockReason =
    canApply || canReapplyForNewCycle
      ? null
      : cyclePhase === 'live' && !applyWindow.open && applyWindow.reason
        ? applyWindow.reason
        : phaseBlockReason || (!applyWindow.open && applyWindow.reason) || null;

  const lateJoinMinutes = Math.max(0, Number(adv.lateJoinMinutes || 0));
  const resolvedExamDate = examDate != null ? examDate : null;
  const resolvedSlot = slotLabel != null ? String(slotLabel || '') : String(row.slot_label || '');
  const startAccess = evaluateTestStartAccess({
    alreadyAppliedInCurrentCycle,
    scheduleTimerEnabled,
    cyclePhase,
    catalogError,
    examDate: resolvedExamDate,
    slotLabel: resolvedSlot,
    lateJoinMinutes,
    attemptAccess,
    nowMs,
    row,
    advancedConfig: adv,
  });

  const enrollment = resolveEnrollmentFromTestRow(row);
  const lastCycleStartedAt = (() => {
    const ms = Date.parse(String(row?.last_cycle_started_at || ''));
    return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
  })();

  return {
    found: true,
    id: String(row.id),
    title: String(row.title || 'Test'),
    slug: String(row.slug || ''),
    subcategory: String(row.subcategory || ''),
    isPublished: row.is_published === true,
    catalogVisible,
    cyclePhase,
    republishAt,
    canApply: canApply || canReapplyForNewCycle,
    alreadyAppliedInCurrentCycle,
    mayReapplyForNewCycle: canReapplyForNewCycle,
    blockReason,
    canStart: startAccess.canStart,
    startBlockReason: startAccess.startBlockReason,
    joinClosesAt: startAccess.joinClosesAt,
    enrolledCount: enrollment.enrolledCount,
    capacityTotal: enrollment.capacityTotal,
    remainingSeats: enrollment.remainingSeats,
    lastCycleStartedAt,
  };
}

/**
 * Lookup test by id, exact title, slug, or unique subcategory (case-insensitive).
 * @returns {Promise<{ row: object|null, ambiguous: boolean }>}
 */
async function lookupTestForResolve(db, { testId, title, slug }) {
  const id = String(testId || '').trim();
  const titleQ = String(title || '').trim();
  const slugQ = String(slug || '').trim();

  if (!id && !titleQ && !slugQ) {
    return { row: null, ambiguous: false, error: 'title, slug, or testId query param required' };
  }

  if (id) {
    const byId = await db.query(
      `SELECT id, slug, title, subcategory, is_published, duration_minutes, last_cycle_started_at,
              valid_until, exam_date, dynamic_date_enabled, date_cycle_days,
              capacity_total, enrolled_count, slot_label
       FROM tests
       WHERE id = $1::uuid
       LIMIT 1`,
      [id],
    );
    return { row: byId.rows[0] || null, ambiguous: false };
  }

  const lookup = slugQ || titleQ;
  const res = await db.query(
    `SELECT id, slug, title, subcategory, is_published, duration_minutes, last_cycle_started_at,
            valid_until, exam_date, dynamic_date_enabled, date_cycle_days,
            capacity_total, enrolled_count, slot_label
     FROM tests
     WHERE lower(trim(title)) = lower(trim($1))
        OR lower(trim(slug)) = lower(trim($1))
        OR lower(trim(subcategory)) = lower(trim($1))
     ORDER BY updated_at DESC
     LIMIT 2`,
    [lookup],
  );
  if (res.rows.length > 1) {
    return { row: null, ambiguous: true };
  }
  return { row: res.rows[0] || null, ambiguous: false };
}

async function loadPublishScheduleItemsSafe(db) {
  try {
    return await getPublishSchedulingItems(db);
  } catch (_e) {
    return [];
  }
}

module.exports = {
  findEarliestPendingRepublishSchedule,
  resolveTestCyclePhase,
  resolveRepublishAtIso,
  resolveEnrollmentFromTestRow,
  buildTestResolvePayload,
  lookupTestForResolve,
  loadPublishScheduleItemsSafe,
  resolveSchedulerCycleEndMs,
};
