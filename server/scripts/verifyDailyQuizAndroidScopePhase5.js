#!/usr/bin/env node
'use strict';

/**
 * Phase 5 — Android scope selector UI below TAKE TEST (UI only; API wiring Phase 6).
 *
 * Usage:
 *   node scripts/verifyDailyQuizAndroidScopePhase5.js
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
  console.log('=== Phase 5: Android daily quiz scope selector UI ===\n');
  let ok = true;

  const ui = read('app/src/main/java/com/freemocktest/app/newui/digest/DailyDigestScreenNew.kt');
  const selector = read('app/src/main/java/com/freemocktest/app/newui/digest/DailyQuizScopeSelection.kt');
  const model = read('app/src/main/java/com/freemocktest/app/data/DailyQuizScopeSelection.kt');
  const prefs = read('app/src/main/java/com/freemocktest/app/data/AppPreferencesRepository.kt');
  const repo = read('app/src/main/java/com/freemocktest/app/data/ContentRepository.kt');
  const appApi = read('app/src/main/java/com/freemocktest/app/data/remote/AppApiService.kt');

  ok =
    line(
      model.includes('MODE_ALL_INDIA') && model.includes('MODE_STATE'),
      'DailyQuizScopeSelection model present',
    ) && ok;

  ok =
    line(
      selector.includes('DailyQuizScopeSelectorCard') &&
        selector.includes('See all states') &&
        selector.includes('resolveInitialSelection'),
      'scope selector composable + helpers',
    ) && ok;

  ok =
    line(
      ui.includes('DailyQuizScopeSelectorCard') &&
        ui.includes('selectedQuizScope') &&
        ui.includes('onSelectAllIndiaScope') &&
        ui.includes('onToggleSeeAllScopeStates'),
      'DailyDigestScreenNew wires scope selector below TAKE TEST',
    ) && ok;

  ok =
    line(
      ui.includes('DailyQuizScopeUi.resolveInitialSelection') &&
        ui.includes('peekSignupStateNow') &&
        ui.includes('SignupRegionData'),
      'auto-select uses signup state + admin regions',
    ) && ok;

  ok =
    line(
      prefs.includes('saveDailyQuizScopeSelection') &&
        prefs.includes('keyProfileSignupState') &&
        prefs.includes('loadDailyQuizScopeSelection'),
      'scope selection persisted locally for Phase 6',
    ) && ok;

  ok =
    line(
      repo.includes('getDailyQuizTodayScoped') &&
        ui.includes('loadDailyQuizToday(selectedQuizScope)'),
      'Phase 6: scoped auth API wired from UI',
    ) && ok;

  ok =
    line(
      ui.indexOf('DailyQuizScopeSelectorCard') > ui.indexOf('TAKE TEST'),
      'scope selector rendered after TAKE TEST button',
    ) && ok;

  console.log('');
  if (ok) {
    console.log('VERIFY_DAILY_QUIZ_ANDROID_SCOPE_PHASE5_OK');
    process.exit(0);
  }
  console.error('VERIFY_DAILY_QUIZ_ANDROID_SCOPE_PHASE5_FAILED');
  process.exit(1);
}

main();
