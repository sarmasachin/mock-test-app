#!/usr/bin/env node
'use strict';

/**
 * Phase 3 verify — immediate vs deferred pending-result flow (Kotlin + logic mirror).
 *
 * Usage:
 *   node scripts/verifyPhase3ResultFlow.js
 */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..', 'app', 'src', 'main', 'java', 'com', 'freemocktest', 'app');
const RESULT_RELEASE_DELAY_HOURS = 3;
const HourMs = 60 * 60 * 1000;

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function line(ok, msg) {
  console.log(`${ok ? 'OK' : 'FAIL'}  ${msg}`);
  return ok;
}

function isResultReleaseDeferred(resultVisibility) {
  return String(resultVisibility || '').trim().toLowerCase() === 'after_result_time';
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

function pendingResultCardState(publishAtMillis, nowMs) {
  const isImmediateRelease = publishAtMillis <= 0;
  const isReady = isImmediateRelease || nowMs >= publishAtMillis;
  const remainingMs = isImmediateRelease ? 0 : Math.max(0, publishAtMillis - nowMs);
  const hours = Math.floor(remainingMs / 3_600_000);
  const mins = Math.floor((remainingMs % 3_600_000) / 60_000);
  const secs = Math.floor((remainingMs % 60_000) / 1_000);
  const countdownText = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  return { isImmediateRelease, isReady, remainingMs, countdownText };
}

function main() {
  console.log('=== Verify Phase 3 result flow (immediate + deferred) ===\n');
  let ok = true;

  const scheduleKt = read('util/TestScheduleUtils.kt');
  const prefsKt = read('data/AppPreferencesRepository.kt');
  const homeKt = read('newui/home/HomeScreenNew.kt');
  const quizKt = read('newui/quiz/QuizScreenNew.kt');

  ok = line(scheduleKt.includes('resolvePendingResultPublishAtMillis'), 'TestScheduleUtils pending publish helper') && ok;
  ok = line(scheduleKt.includes('formatPendingResultReleaseLabel'), 'TestScheduleUtils release label helper') && ok;
  ok =
    line(
      prefsKt.includes('resolvePendingResultPublishAtMillis'),
      'markPendingResultSubmittedNow uses resolvePendingResultPublishAtMillis',
    ) && ok;
  ok =
    line(
      !prefsKt.includes('publishAtMillis.takeIf { it > 0L }'),
      'markPendingResultSubmittedNow no longer rewrites publishAt=0 to +3h',
    ) && ok;
  ok =
    line(
      prefsKt.includes('if (name.isBlank())') && !prefsKt.includes('publishAt <= 0L'),
      'pendingResultState keeps row when publishAt=0 (immediate)',
    ) && ok;
  ok = line(homeKt.includes('isImmediateRelease'), 'PendingResultCard handles immediate release') && ok;
  ok = line(homeKt.includes('formatPendingResultReleaseLabel'), 'PendingResultCard uses release label helper') && ok;
  ok = line(quizKt.includes('resolveResultReleaseMillisForSubmit'), 'Quiz submit resolves release millis') && ok;

  const submitAtMs = Date.parse('2026-07-10T16:05:00.000Z');
  const defaultReleaseAtMs = submitAtMs + RESULT_RELEASE_DELAY_HOURS * HourMs;
  const resultReleaseAtMs = Date.parse('2026-07-08T18:23:00.000Z');

  const immediatePublishAt = resolveResultReleaseMillisForSubmit('immediate', resultReleaseAtMs, defaultReleaseAtMs);
  ok = line(immediatePublishAt === 0, 'immediate visibility → quiz publishAt=0') && ok;

  const storedImmediate = resolvePendingResultPublishAtMillis(immediatePublishAt, defaultReleaseAtMs);
  ok = line(storedImmediate === 0, 'DataStore keeps publishAt=0 for immediate') && ok;

  const pendingImmediate = readPendingResultState('HP GK', storedImmediate);
  ok = line(pendingImmediate?.testName === 'HP GK', 'pendingResultState returns immediate row') && ok;

  const homeImmediate = pendingResultCardState(storedImmediate, submitAtMs);
  ok = line(homeImmediate.isReady === true, 'Home card ready immediately') && ok;
  ok = line(homeImmediate.countdownText === '00:00:00', `No countdown for immediate (got ${homeImmediate.countdownText})`) && ok;

  const deferredPublishAt = resolvePendingResultPublishAtMillis(
    resolveResultReleaseMillisForSubmit('after_result_time', 0, defaultReleaseAtMs),
    defaultReleaseAtMs,
  );
  ok = line(deferredPublishAt === defaultReleaseAtMs, 'deferred without resultReleaseAt uses default delay') && ok;

  const homeDeferred = pendingResultCardState(deferredPublishAt, submitAtMs + 5 * 60 * 1000);
  ok = line(homeDeferred.isReady === false, 'deferred home still waits') && ok;
  ok = line(homeDeferred.countdownText.startsWith('02:'), `deferred countdown ~3h (got ${homeDeferred.countdownText})`) && ok;

  const homeDeferredReady = pendingResultCardState(deferredPublishAt, submitAtMs + 3 * HourMs);
  ok = line(homeDeferredReady.isReady === true, 'deferred ready after delay elapses') && ok;

  console.log('');
  if (ok) {
    console.log('VERIFY_PHASE3_RESULT_FLOW_OK');
    process.exit(0);
  }
  console.log('VERIFY_PHASE3_RESULT_FLOW_FAILED');
  process.exit(1);
}

main();
