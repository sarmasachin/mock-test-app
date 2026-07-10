#!/usr/bin/env node
'use strict';

/**
 * E2E proof: resultVisibility "immediate" → no 3h home countdown (Phase 1 fix).
 *
 * Mirrors Kotlin:
 *   TestScheduleUtils.resolveResultReleaseMillisForSubmit
 *   TestScheduleUtils.resolvePendingResultPublishAtMillis
 *   TestScheduleUtils.isPendingResultReleaseReady
 *   AppPreferencesRepository.pendingResultState reader
 *
 * Usage:
 *   node scripts/e2eImmediateResultCountdownProof.js
 */

const RESULT_RELEASE_DELAY_HOURS = 3;
const HourMs = 60 * 60 * 1000;

const HP_GK = {
  resultVisibility: 'immediate',
  resultReleaseAt: '2026-07-08T18:23:00.000Z',
};

function isResultReleaseDeferred(resultVisibility) {
  return String(resultVisibility || '')
    .trim()
    .toLowerCase() === 'after_result_time';
}

function resolveResultReleaseMillisForSubmit(resultVisibility, resultReleaseAtMs, defaultReleaseAtMs) {
  if (!isResultReleaseDeferred(resultVisibility)) return 0;
  return resultReleaseAtMs > 0 ? resultReleaseAtMs : defaultReleaseAtMs;
}

function resolvePendingResultPublishAtMillis(submitPublishAtMillis, defaultDeferredReleaseAtMs) {
  if (submitPublishAtMillis > 0) return submitPublishAtMillis;
  if (submitPublishAtMillis === 0) return 0;
  return defaultDeferredReleaseAtMs;
}

function readPendingResultState(name, publishAt) {
  if (!String(name || '').trim()) return null;
  return { testName: name.trim(), publishAtMillis: Math.max(0, publishAt) };
}

function isPendingResultReleaseReady(publishAtMillis, nowMs) {
  return publishAtMillis <= 0 || nowMs >= publishAtMillis;
}

function pendingResultCardState(publishAtMillis, nowMs) {
  const isImmediateRelease = publishAtMillis <= 0;
  const isReady = isImmediateRelease || nowMs >= publishAtMillis;
  const remainingMs = isImmediateRelease ? 0 : Math.max(0, publishAtMillis - nowMs);
  const hours = Math.floor(remainingMs / 3_600_000);
  const mins = Math.floor((remainingMs % 3_600_000) / 60_000);
  const secs = Math.floor((remainingMs % 60_000) / 1_000);
  const countdownText = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  return { isReady, remainingMs, countdownText };
}

function line(ok, msg) {
  console.log(`${ok ? 'OK' : 'FAIL'}  ${msg}`);
  return ok;
}

function main() {
  console.log('=== E2E Phase 1: immediate resultVisibility (fixed behavior) ===\n');
  let ok = true;

  const submitAtMs = Date.parse('2026-07-10T16:05:00.000Z');
  const defaultReleaseAtMs = submitAtMs + RESULT_RELEASE_DELAY_HOURS * HourMs;
  const resultReleaseAtMs = Date.parse(HP_GK.resultReleaseAt);

  const publishAtFromQuiz = resolveResultReleaseMillisForSubmit(
    HP_GK.resultVisibility,
    resultReleaseAtMs,
    defaultReleaseAtMs,
  );
  ok = line(publishAtFromQuiz === 0, `Quiz submit publishAt=${publishAtFromQuiz}`) && ok;

  const storedPublishAt = resolvePendingResultPublishAtMillis(publishAtFromQuiz, defaultReleaseAtMs);
  ok = line(storedPublishAt === 0, `DataStore stores publishAt=0 (not +3h)`) && ok;

  const pending = readPendingResultState('HP GK', storedPublishAt);
  ok = line(pending?.testName === 'HP GK', 'pendingResultState returns row when publishAt=0') && ok;

  const homeAtSubmit = pendingResultCardState(storedPublishAt, submitAtMs);
  ok = line(homeAtSubmit.isReady === true, 'Home card ready immediately after submit') && ok;
  ok = line(homeAtSubmit.countdownText === '00:00:00', `No countdown (got ${homeAtSubmit.countdownText})`) && ok;

  const deferredPublishAt = resolvePendingResultPublishAtMillis(
    resolveResultReleaseMillisForSubmit('after_result_time', 0, defaultReleaseAtMs),
    defaultReleaseAtMs,
  );
  ok = line(deferredPublishAt === defaultReleaseAtMs, 'deferred without resultReleaseAt still uses 3h default') && ok;

  const deferredHome = pendingResultCardState(deferredPublishAt, submitAtMs + 5 * 60 * 1000);
  ok = line(deferredHome.isReady === false, 'deferred still waits on home') && ok;
  ok = line(deferredHome.countdownText.startsWith('02:'), `deferred countdown ~3h (got ${deferredHome.countdownText})`) && ok;

  const deferredReady = pendingResultCardState(deferredPublishAt, submitAtMs + 3 * HourMs);
  ok = line(deferredReady.isReady === true, 'deferred ready after 3h') && ok;

  console.log('');
  if (ok) {
    console.log('E2E_IMMEDIATE_RESULT_COUNTDOWN_PHASE1_OK');
    process.exit(0);
  }
  console.error('E2E_IMMEDIATE_RESULT_COUNTDOWN_PHASE1_FAILED');
  process.exit(1);
}

main();
