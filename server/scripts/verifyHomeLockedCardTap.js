#!/usr/bin/env node
'use strict';

/**
 * Verify locked applied-test cards on Home + View all do not navigate until unlock.
 * Mirrors HomeAppliedTestNavigation.kt.
 */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

function line(ok, msg) {
  console.log(`${ok ? 'OK' : 'FAIL'}  ${msg}`);
  return ok;
}

function blockedTapMessage(card) {
  if (!card.catalogLoaded) return 'Loading test details...';
  if (card.isPendingResultWaiting) {
    return card.statusMessage || 'Result will be available soon';
  }
  if (card.lateJoinClosed) {
    return card.statusMessage || 'Late join closed';
  }
  if (card.isLocked) {
    if (card.startTimeDisplay?.trim()) return `Test unlocks at ${card.startTimeDisplay.trim()}`;
    if (card.examStartLabel?.trim()) return `Test starts ${card.examStartLabel.trim()}`;
    if (card.countdownText) return `Starts in ${card.countdownText}`;
    return card.statusMessage || 'Test is locked';
  }
  return card.statusMessage || 'Not available yet';
}

function resolveCardTapAction(card, pendingResult, nowMs) {
  const name = (card.testName || 'Test').trim() || 'Test';
  const pending = pendingResult;
  if (
    card.isPendingResult &&
    pending &&
    pending.testName.toLowerCase() === name.toLowerCase()
  ) {
    const ready = pending.publishAtMillis <= nowMs;
    if (ready) {
      return { type: 'OpenPendingResult', testName: pending.testName };
    }
  }
  if (card.actionButtonEnabled) {
    return { type: 'OpenStartPreview', testName: name };
  }
  return { type: 'Blocked', message: blockedTapMessage(card) };
}

function isPendingResultReady(pending, nowMs) {
  return pending && pending.publishAtMillis <= nowMs;
}

// Align with Kotlin: pending ready check uses AppPreferencesRepository helper — same rule here.
function resolveCardTapActionKotlinAligned(card, pendingResult, nowMs) {
  const name = (card.testName || 'Test').trim() || 'Test';
  const pending = pendingResult;
  if (
    card.isPendingResult &&
    pending &&
    pending.testName.toLowerCase() === name.toLowerCase() &&
    isPendingResultReady(pending, nowMs)
  ) {
    return { type: 'OpenPendingResult', testName: pending.testName };
  }
  if (card.actionButtonEnabled) {
    return { type: 'OpenStartPreview', testName: name };
  }
  return { type: 'Blocked', message: blockedTapMessage(card) };
}

let ok = true;

const navKt = read('app/src/main/java/com/freemocktest/app/util/HomeAppliedTestNavigation.kt');
const homeKt = read('app/src/main/java/com/freemocktest/app/newui/home/HomeScreenNew.kt');
const previewKt = read('app/src/main/java/com/freemocktest/app/newui/tests/StartTestPreviewScreenNew.kt');

ok = line(navKt.includes('data class Blocked'), 'Kotlin: Blocked tap action exists') && ok;
ok = line(navKt.includes('card.actionButtonEnabled'), 'Kotlin: tap gated by actionButtonEnabled') && ok;
ok = line(navKt.includes('blockedTapMessage'), 'Kotlin: user-facing blocked message helper') && ok;
ok = line(homeKt.includes('CardTapAction.Blocked'), 'Home handles blocked carousel tap') && ok;
ok = line(previewKt.includes('CardTapAction.Blocked'), 'View all handles blocked carousel tap') && ok;

const now = Date.now();

const lockedCard = {
  testName: 'HP GK',
  isLocked: true,
  canStartNow: false,
  actionButtonEnabled: false,
  catalogLoaded: true,
  startTimeDisplay: 'Today @ 03:30PM',
  examStartLabel: null,
  countdownText: '02:15:30',
  statusMessage: 'Starts in 02:15:30',
  isPendingResult: false,
  isPendingResultWaiting: false,
  lateJoinClosed: false,
};
const lockedTap = resolveCardTapActionKotlinAligned(lockedCard, null, now);
ok = line(lockedTap.type === 'Blocked', 'Sim: locked card does not open start preview') && ok;
ok = line(lockedTap.message.includes('03:30PM'), 'Sim: locked message shows unlock time') && ok;

const readyCard = {
  testName: 'HP GK',
  isLocked: false,
  canStartNow: true,
  actionButtonEnabled: true,
  catalogLoaded: true,
  isPendingResult: false,
  isPendingResultWaiting: false,
  lateJoinClosed: false,
};
const readyTap = resolveCardTapActionKotlinAligned(readyCard, null, now);
ok = line(readyTap.type === 'OpenStartPreview', 'Sim: ready card opens start preview') && ok;

const pendingWaiting = {
  testName: 'HP GK',
  isLocked: false,
  canStartNow: false,
  actionButtonEnabled: false,
  catalogLoaded: true,
  isPendingResult: true,
  isPendingResultWaiting: true,
  lateJoinClosed: false,
  statusMessage: 'Result will be available soon',
};
const pendingTap = resolveCardTapActionKotlinAligned(
  pendingWaiting,
  { testName: 'HP GK', publishAtMillis: now + 60_000, answered: 10, correct: 8, wrong: 2, total: 10 },
  now,
);
ok = line(pendingTap.type === 'Blocked', 'Sim: pending result waiting stays blocked') && ok;

const resultReady = resolveCardTapActionKotlinAligned(
  { ...pendingWaiting, actionButtonEnabled: true },
  { testName: 'HP GK', publishAtMillis: now - 1, answered: 10, correct: 8, wrong: 2, total: 10 },
  now,
);
ok = line(resultReady.type === 'OpenPendingResult', 'Sim: result ready opens result flow') && ok;

const lateJoin = {
  testName: 'HP GK',
  isLocked: false,
  canStartNow: false,
  actionButtonEnabled: false,
  catalogLoaded: true,
  isPendingResult: false,
  isPendingResultWaiting: false,
  lateJoinClosed: true,
  statusMessage: 'Late join closed',
};
const lateTap = resolveCardTapActionKotlinAligned(lateJoin, null, now);
ok = line(lateTap.type === 'Blocked', 'Sim: late join closed stays blocked') && ok;

console.log(`\n${ok ? 'VERIFY_HOME_LOCKED_CARD_TAP_OK' : 'VERIFY_HOME_LOCKED_CARD_TAP_FAILED'}\n`);
process.exit(ok ? 0 : 1);
