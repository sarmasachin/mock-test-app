'use strict';

const { isTestCatalogVisible, catalogVisibilityError } = require('./testVisibility');
const { cycleRepublishAtMs } = require('./cycleRepublishGap');
const { buildTestResolvePayload } = require('./testResolve');

const DEFAULT_E2E_TEST_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function isApplicationFromOlderCycle(row, appliedAtIso) {
  if (!appliedAtIso) return false;
  const appliedMs = Date.parse(String(appliedAtIso || ''));
  if (!Number.isFinite(appliedMs)) return false;
  const cycleStartedMs = Date.parse(String(row?.last_cycle_started_at || ''));
  if (!Number.isFinite(cycleStartedMs)) return false;
  return appliedMs < cycleStartedMs;
}

function buildScenarioTestRow({
  isPublished,
  cycleStartedIso,
  durationMinutes = 2,
  testId = DEFAULT_E2E_TEST_ID,
  title = 'E2E Phase7 Test',
}) {
  return {
    id: testId,
    title,
    slug: 'e2e-phase7',
    subcategory: 'GK',
    is_published: isPublished,
    duration_minutes: durationMinutes,
    last_cycle_started_at: cycleStartedIso,
    valid_until: null,
    capacity_total: 100,
    enrolled_count: 0,
  };
}

function buildRepublishScheduleItems(testId, cycleEndMs, advancedConfig = {}) {
  const republishMs = cycleRepublishAtMs(cycleEndMs, advancedConfig);
  if (!Number.isFinite(republishMs)) return [];
  return [
    {
      entityType: 'test',
      entityId: testId,
      status: 'scheduled',
      scheduleAt: new Date(republishMs).toISOString(),
      action: 'publish',
    },
  ];
}

/**
 * Build a deterministic apply-cycle timeline (duration + gap) for offline E2E checks.
 */
function getApplyCycleTimeline({
  cycleStartMs = Date.parse('2026-07-01T10:00:00.000Z'),
  durationMinutes = 2,
  gapMinutes = 3,
  testId = DEFAULT_E2E_TEST_ID,
} = {}) {
  const advancedConfig = { cycleRepublishGapMinutes: gapMinutes };
  const cycleEndMs = cycleStartMs + durationMinutes * 60 * 1000;
  const republishMs = cycleRepublishAtMs(cycleEndMs, advancedConfig);
  const cycleStartIso = new Date(cycleStartMs).toISOString();
  const republishIso = new Date(republishMs).toISOString();

  return {
    cycleStartMs,
    cycleEndMs,
    republishMs,
    durationMinutes,
    gapMinutes,
    advancedConfig,
    phases: [
      {
        key: 'live_in_cycle',
        label: 'Published in active cycle',
        nowMs: cycleStartMs + 60 * 1000,
        row: buildScenarioTestRow({
          isPublished: true,
          cycleStartedIso: cycleStartIso,
          durationMinutes,
          testId,
        }),
        publishScheduleItems: [],
        appliedAtIso: null,
      },
      {
        key: 'live_already_applied',
        label: 'Live cycle — user already applied',
        nowMs: cycleStartMs + 90 * 1000,
        row: buildScenarioTestRow({
          isPublished: true,
          cycleStartedIso: cycleStartIso,
          durationMinutes,
          testId,
        }),
        publishScheduleItems: [],
        appliedAtIso: new Date(cycleStartMs + 30 * 1000).toISOString(),
      },
      {
        key: 'between_cycles',
        label: 'Cycle ended — between republish gap',
        nowMs: cycleEndMs + 60 * 1000,
        row: buildScenarioTestRow({
          isPublished: false,
          cycleStartedIso: cycleStartIso,
          durationMinutes,
          testId,
        }),
        publishScheduleItems: buildRepublishScheduleItems(testId, cycleEndMs, advancedConfig),
        appliedAtIso: null,
      },
      {
        key: 'republished_new_cycle',
        label: 'Republished — new cycle live',
        nowMs: republishMs + 60 * 1000,
        row: buildScenarioTestRow({
          isPublished: true,
          cycleStartedIso: republishIso,
          durationMinutes,
          testId,
        }),
        publishScheduleItems: [],
        appliedAtIso: new Date(cycleStartMs + 30 * 1000).toISOString(),
      },
    ],
  };
}

/**
 * Evaluate catalog, resolve, and apply eligibility for one timeline point.
 */
function evaluateApplyCyclePhase({
  row,
  advancedConfig = {},
  publishScheduleItems = [],
  nowMs = Date.now(),
  appliedAtIso = null,
}) {
  const catalogVisible = isTestCatalogVisible(row, advancedConfig, nowMs);
  const catalogListed = catalogVisible;
  const visibilityError = catalogVisibilityError(row, advancedConfig, nowMs);
  const fromOlderCycle = isApplicationFromOlderCycle(row, appliedAtIso);
  const alreadyAppliedInCurrentCycle = Boolean(appliedAtIso) && !fromOlderCycle;
  const mayReapplyForNewCycle = Boolean(appliedAtIso) && fromOlderCycle;

  const resolve = buildTestResolvePayload({
    row,
    advancedConfig,
    nowMs,
    publishScheduleItems,
    alreadyAppliedInCurrentCycle,
    mayReapplyForNewCycle,
  });

  const applyAllowed = !visibilityError && (resolve.canApply || resolve.mayReapplyForNewCycle);
  const applyHttpStatus = applyAllowed ? 201 : 403;

  return {
    catalogVisible,
    catalogListed,
    visibilityError,
    resolve,
    applyAllowed,
    applyHttpStatus,
    applyBlockReason: visibilityError || resolve.blockReason || null,
    fromOlderCycle,
    alreadyAppliedInCurrentCycle,
    mayReapplyForNewCycle,
  };
}

module.exports = {
  DEFAULT_E2E_TEST_ID,
  isApplicationFromOlderCycle,
  buildScenarioTestRow,
  buildRepublishScheduleItems,
  getApplyCycleTimeline,
  evaluateApplyCyclePhase,
};
