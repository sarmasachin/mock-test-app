#!/usr/bin/env node
'use strict';

/**
 * Phase 7 verify — Android cycle phase display (offline mirror of TestCyclePhase.kt).
 *
 * Usage:
 *   node scripts/verifyAndroidCyclePhasePhase7.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

function line(ok, msg) {
  console.log(`${ok ? 'OK' : 'FAIL'}  ${msg}`);
  return ok;
}

const LIVE = 'live';
const BETWEEN_CYCLES = 'between_cycles';

function normalize(raw) {
  const s = String(raw || '').trim().toLowerCase();
  return s || 'unpublished';
}

function isExamApplyBlocked(blockReason) {
  return String(blockReason || '').toLowerCase().includes('exam in progress');
}

function cardMetaLine(phase, blockReason) {
  const normalized = normalize(phase);
  const reason = String(blockReason || '').trim();
  if (reason && isExamApplyBlocked(reason)) return reason;
  if (normalized === LIVE && reason) return reason;
  if (normalized === LIVE) return 'Live — apply open';
  if (normalized === BETWEEN_CYCLES) return 'Between cycles — opens again when republished';
  if (reason) return reason;
  return 'Test status';
}

function resolvePreviewApplyState(resolve, alreadyApplied) {
  if (alreadyApplied || !resolve) {
    return { showApplyButton: false, applyBlockedMessage: null };
  }
  const blockReason = String(resolve.blockReason || '').trim();
  const blocked = !resolve.canApply && !resolve.mayReapplyForNewCycle && blockReason;
  return {
    showApplyButton: Boolean(resolve.canApply || resolve.mayReapplyForNewCycle),
    applyBlockedMessage: blocked ? blockReason : null,
  };
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function main() {
  console.log('=== Phase 7: Android cycle phase display ===\n');
  let ok = true;

  ok =
    line(
      cardMetaLine(LIVE, 'Registration closed — exam in progress') ===
        'Registration closed — exam in progress',
      'cardMetaLine: exam in progress from blockReason',
    ) && ok;
  ok =
    line(
      cardMetaLine(LIVE, null) === 'Live — apply open',
      'cardMetaLine: live default',
    ) && ok;
  ok =
    line(
      cardMetaLine(BETWEEN_CYCLES, null).includes('Between cycles'),
      'cardMetaLine: between_cycles',
    ) && ok;

  const examBlocked = resolvePreviewApplyState(
    {
      canApply: false,
      mayReapplyForNewCycle: false,
      blockReason: 'Registration closed — exam in progress',
      cyclePhase: LIVE,
    },
    false,
  );
  ok =
    line(
      examBlocked.showApplyButton === false &&
        examBlocked.applyBlockedMessage.includes('exam in progress'),
      'preview: hides Apply during exam',
    ) && ok;

  const mayReapply = resolvePreviewApplyState(
    {
      canApply: true,
      mayReapplyForNewCycle: true,
      blockReason: null,
      cyclePhase: LIVE,
    },
    false,
  );
  ok = line(mayReapply.showApplyButton === true, 'preview: shows Apply for new cycle') && ok;

  const cycleKt = read('app/src/main/java/com/freemocktest/app/util/TestCyclePhase.kt');
  const repo = read('app/src/main/java/com/freemocktest/app/data/ContentRepository.kt');
  const applyScreen = read('app/src/main/java/com/freemocktest/app/newui/apply/ApplyForTestScreenNew.kt');
  const startPreview = read('app/src/main/java/com/freemocktest/app/newui/tests/StartTestPreviewScreenNew.kt');
  const apiModels = read('app/src/main/java/com/freemocktest/app/data/remote/ApiModels.kt');

  ok = line(cycleKt.includes('object TestCyclePhase'), 'TestCyclePhase.kt exists') && ok;
  ok =
    line(
      cycleKt.includes('resolveApplyUiState') && cycleKt.includes('resolvePreviewApplyState'),
      'TestCyclePhase: apply + preview helpers',
    ) && ok;
  ok =
    line(
      repo.includes('TestCyclePhase.cardMetaLine'),
      'ContentRepository uses TestCyclePhase for resolve meta',
    ) && ok;
  ok =
    line(
      applyScreen.includes('cyclePhaseLabel') && applyScreen.includes('applyBlockedMessage'),
      'Apply screen shows cycle phase + blocked message',
    ) && ok;
  ok =
    line(
      startPreview.includes('showSpecificApplyBlocked') &&
        startPreview.includes('resolvePreviewApplyState'),
      'Start Test preview respects cycle apply blocks',
    ) && ok;
  ok =
    line(
      apiModels.includes('@SerializedName("cyclePhase")') &&
        apiModels.includes('MyTestApplicationDto'),
      'MyTestApplicationDto includes cyclePhase',
    ) && ok;
  ok =
    line(
      startPreview.includes('mayReapplyForNewCycle == true -> false'),
      'Start preview: mayReapply shows apply CTA',
    ) && ok;

  console.log('');
  if (ok) {
    console.log('VERIFY_ANDROID_CYCLE_PHASE_PHASE7_OK');
    process.exit(0);
  }
  console.error('VERIFY_ANDROID_CYCLE_PHASE_PHASE7_FAILED');
  process.exit(1);
}

main();
