#!/usr/bin/env node
'use strict';

/**
 * Phase 3 verify — Android re-apply cache + apply UI wiring (static source checks).
 *
 * Usage:
 *   node scripts/verifyAndroidReapplyPhase3.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

function line(ok, msg) {
  console.log(`${ok ? 'OK' : 'FAIL'}  ${msg}`);
  return ok;
}

function read(relPath) {
  const abs = path.join(ROOT, relPath);
  if (!fs.existsSync(abs)) return '';
  return fs.readFileSync(abs, 'utf8');
}

function main() {
  console.log('=== Phase 3: Android re-apply / cache wiring ===\n');
  let ok = true;

  const testApplyState = read('app/src/main/java/com/freemocktest/app/util/TestApplyState.kt');
  const appliedSync = read('app/src/main/java/com/freemocktest/app/util/AppliedTestSeriesSync.kt');
  const authRepo = read('app/src/main/java/com/freemocktest/app/data/AuthRepository.kt');
  const contentRepo = read('app/src/main/java/com/freemocktest/app/data/ContentRepository.kt');
  const prefs = read('app/src/main/java/com/freemocktest/app/data/AppPreferencesRepository.kt');
  const applyScreen = read('app/src/main/java/com/freemocktest/app/newui/apply/ApplyForTestScreenNew.kt');
  const previewScreen = read('app/src/main/java/com/freemocktest/app/newui/tests/StartTestPreviewScreenNew.kt');
  const cyclePhase = read('app/src/main/java/com/freemocktest/app/util/TestCyclePhase.kt');

  ok =
    line(
      testApplyState.includes('pickPreferredMyTestApplication') &&
        testApplyState.includes('shouldSyncApplicationToLocalSeries') &&
        testApplyState.includes('resolveAlreadyAppliedFromSources'),
      'TestApplyState has Phase 3 helpers',
    ) && ok;
  ok =
    line(
      testApplyState.includes('matchedApplication?.mayReapplyForNewCycle == true') &&
        !testApplyState.includes('if (matchedApplication != null) return true'),
      'TestApplyState does not treat any matched row as applied',
    ) && ok;

  ok =
    line(
      appliedSync.includes('filterLocalsEvictingMayReapply'),
      'AppliedTestSeriesSync evicts may-reapply locals',
    ) && ok;

  ok =
    line(
      authRepo.includes('finalizeReenrollmentAfterApply') &&
        authRepo.includes('TestApplyState.shouldSyncApplicationToLocalSeries'),
      'AuthRepository clears stale cycle data on re-enroll + filters sync',
    ) && ok;

  ok =
    line(
      contentRepo.includes('finalizeReenrollmentAfterApply') &&
        contentRepo.includes('evictQuizDeliveryCacheForTest') &&
        contentRepo.includes('lastCycleStartedAt'),
      'ContentRepository cycle finalize + cache eviction',
    ) && ok;

  ok =
    line(
      prefs.includes('clearInProgressQuizForTestName') &&
        prefs.includes('clearSubmittedAttemptSnapshotForTestName') &&
        prefs.includes('filterLocalsEvictingMayReapply'),
      'AppPreferencesRepository clears stale quiz/review on new cycle',
    ) && ok;

  ok =
    line(
      applyScreen.includes('pickPreferredMyTestApplication') &&
        applyScreen.includes('reenrolledForNewCycle') &&
        applyScreen.includes('refreshTick += 1') &&
        applyScreen.includes('mayReapplyForNewCycle && !hasAlreadyApplied') &&
        applyScreen.includes('showApplyConfirmDialog = true') &&
        applyScreen.includes('testBetweenCycles && !hasAlreadyApplied && !mayReapplyForNewCycle'),
      'Apply screen re-enroll submit + refresh + reveal submit on re-apply CTA',
    ) && ok;

  ok =
    line(
      previewScreen.includes('resolveAlreadyAppliedFromSources') &&
        previewScreen.includes('shouldSyncApplicationToLocalSeries'),
      'Start preview uses shared apply-state + sync guard',
    ) && ok;

  ok =
    line(
      cyclePhase.includes('TestApplyState.userMayReapplyForNewCycle'),
      'TestCyclePhase delegates mayReapply to TestApplyState',
    ) && ok;

  console.log('');
  if (ok) {
    console.log('VERIFY_ANDROID_REAPPLY_PHASE3_OK');
    process.exit(0);
  }
  console.error('VERIFY_ANDROID_REAPPLY_PHASE3_FAILED');
  process.exit(1);
}

main();
