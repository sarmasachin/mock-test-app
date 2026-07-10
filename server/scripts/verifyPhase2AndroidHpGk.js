#!/usr/bin/env node
'use strict';

/**
 * Phase 2 verify — Android HP GK cycle UX (offline Kotlin string checks).
 *
 * Usage:
 *   node scripts/verifyPhase2AndroidHpGk.js
 */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..', 'app', 'src', 'main', 'java', 'com', 'freemocktest', 'app');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function line(ok, msg) {
  console.log(`${ok ? 'OK' : 'FAIL'}  ${msg}`);
  return ok;
}

function main() {
  console.log('=== Verify Phase 2 Android HP GK cycle ===\n');
  let ok = true;

  const scheduleKt = read('util/TestScheduleUtils.kt');
  const applyKt = read('newui/apply/ApplyForTestScreenNew.kt');
  const previewKt = read('newui/tests/StartTestPreviewScreenNew.kt');
  const homeUiKt = read('util/AppliedTestHomeUi.kt');
  const homeKt = read('newui/home/HomeScreenNew.kt');
  const prefsKt = read('data/AppPreferencesRepository.kt');
  const apiKt = read('data/remote/ApiModels.kt');
  const navKt = read('newui/navigation/MainBottomNavHost.kt');

  ok = line(scheduleKt.includes('effectiveScheduleTimerEnabled'), 'TestScheduleUtils effective timer helper') && ok;
  ok = line(scheduleKt.includes('isScheduledExamTest'), 'TestScheduleUtils scheduled exam detection') && ok;

  ok = line(apiKt.includes('@SerializedName("examDate")') && apiKt.includes('ApplyTestResponse'), 'ApplyTestResponse schedule fields') && ok;
  ok = line(apiKt.includes('@SerializedName("canStart")'), 'ApplyTestResponse canStart field') && ok;

  ok =
    line(
      !applyKt.includes('if (!reenrolled)') || applyKt.includes('effectiveTimer'),
      'Apply screen saves local series on re-enroll with effective timer',
    ) && ok;
  ok = line(applyKt.includes('response.examDate'), 'Apply screen uses server examDate from response') && ok;
  ok = line(applyKt.includes('response.canStart'), 'Apply screen uses server canStart from response') && ok;
  ok = line(applyKt.includes('markPendingResultViewedAndClear'), 'Re-enroll clears stale pending result') && ok;

  ok = line(previewKt.includes('canViewResult'), 'Preview card supports View Result action') && ok;
  ok = line(previewKt.includes('onOpenPendingResult'), 'Preview wires pending result navigation') && ok;
  ok = line(navKt.includes('onOpenPendingResult'), 'Nav host passes onOpenPendingResult to preview') && ok;

  ok = line(homeUiKt.includes('effectiveScheduleTimerEnabled'), 'Home applied cards use effective timer') && ok;
  ok = line(homeKt.includes('effectiveTimer'), 'Home Start test card uses effective timer heuristic') && ok;

  ok =
    line(
      prefsKt.includes('entry.serverCanStart != null || entry.unlockAtMillis > now'),
      'reconcile preserves scheduled rows when global timer off',
    ) && ok;
  ok = line(!prefsKt.includes('serverCanStart = true'), 'reconcile no longer forces serverCanStart=true') && ok;

  console.log('');
  if (ok) {
    console.log('VERIFY_PHASE2_ANDROID_HP_GK_OK');
    process.exit(0);
  }
  console.log('VERIFY_PHASE2_ANDROID_HP_GK_FAILED');
  process.exit(1);
}

main();
