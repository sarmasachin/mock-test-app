'use strict';

/** Default gap between cycle end and auto-republish (unchanged from original hardcoded value). */
const DEFAULT_CYCLE_REPUBLISH_GAP_MINUTES = 30;

/** Allow 0 for immediate republish after cycle end (testing); cap at 7 days. */
const MIN_CYCLE_REPUBLISH_GAP_MINUTES = 0;
const MAX_CYCLE_REPUBLISH_GAP_MINUTES = 10080;

function clampCycleRepublishGapMinutes(rawMinutes) {
  const n = Math.floor(Number(rawMinutes));
  if (!Number.isFinite(n)) return DEFAULT_CYCLE_REPUBLISH_GAP_MINUTES;
  return Math.min(MAX_CYCLE_REPUBLISH_GAP_MINUTES, Math.max(MIN_CYCLE_REPUBLISH_GAP_MINUTES, n));
}

/**
 * Server-wide default from env. Invalid/missing env → 30 minutes (legacy behavior).
 */
function resolveDefaultCycleRepublishGapMinutes() {
  const raw = process.env.CYCLE_REPUBLISH_GAP_MINUTES;
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return DEFAULT_CYCLE_REPUBLISH_GAP_MINUTES;
  }
  return clampCycleRepublishGapMinutes(raw);
}

/**
 * Per-test advancedConfig override; null/undefined/'' → server default.
 * @param {object|null|undefined} advancedConfig
 */
function resolveCycleRepublishGapMinutes(advancedConfig) {
  if (!advancedConfig || typeof advancedConfig !== 'object') {
    return resolveDefaultCycleRepublishGapMinutes();
  }
  const raw = advancedConfig.cycleRepublishGapMinutes;
  if (raw === undefined || raw === null || raw === '') {
    return resolveDefaultCycleRepublishGapMinutes();
  }
  return clampCycleRepublishGapMinutes(raw);
}

/**
 * @param {number} cycleEndMs — epoch ms when duration window ends
 * @param {object|null|undefined} advancedConfig
 * @returns {number} epoch ms when auto-republish should run
 */
function cycleRepublishAtMs(cycleEndMs, advancedConfig) {
  const endMs = Number(cycleEndMs);
  if (!Number.isFinite(endMs)) return Number.NaN;
  const gapMinutes = resolveCycleRepublishGapMinutes(advancedConfig);
  return endMs + gapMinutes * 60 * 1000;
}

module.exports = {
  DEFAULT_CYCLE_REPUBLISH_GAP_MINUTES,
  MIN_CYCLE_REPUBLISH_GAP_MINUTES,
  MAX_CYCLE_REPUBLISH_GAP_MINUTES,
  clampCycleRepublishGapMinutes,
  resolveDefaultCycleRepublishGapMinutes,
  resolveCycleRepublishGapMinutes,
  cycleRepublishAtMs,
};
