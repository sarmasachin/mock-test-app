#!/usr/bin/env node
'use strict';

/**
 * Phase 4 — daily quiz UI routing guards (account switch + server re-verify).
 *
 * Usage:
 *   node scripts/verifyDailyQuizUiRoutingPhase4.js
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

/** Mirror onTakeTest routing after server re-verify. */
function resolveTakeTestRoute({ verifiedResult, quizItemsEmpty, canTakeToday }) {
  if (verifiedResult != null) return 'dashboard';
  if (quizItemsEmpty) return 'error';
  if (canTakeToday) return 'quiz';
  return 'hint';
}

function main() {
  console.log('=== Phase 4: daily quiz UI routing guards ===\n');
  let ok = true;

  const ui = read('app/src/main/java/com/freemocktest/app/newui/digest/DailyDigestScreenNew.kt');

  ok =
    line(
      ui.includes('buildDailyQuizSessionKey') &&
        ui.includes('dailyQuizSessionKey') &&
        ui.includes('!DailyQuizRepository.isLoggedIn()'),
      'DailyDigestScreenNew: login gate + session identity key',
    ) && ok;

  ok =
    line(
      ui.includes('LaunchedEffect(dailyQuizSessionKey)') &&
        ui.includes('showQuiz = false') &&
        ui.includes('showResult = false') &&
        ui.includes('pendingQuestionResults = emptyList()'),
      'session change resets in-flight quiz/result UI state',
    ) && ok;

  ok =
    line(
      ui.includes('LaunchedEffect(showResult, savedDayResult, dailyQuizSessionKey)') &&
        ui.includes('if (showResult && savedDayResult == null)'),
      'dashboard route closes when day snapshot is missing',
    ) && ok;

  ok =
    line(
      ui.includes('loadDayResultForCurrentUser(selectedDate, selectedQuizScope)') &&
        ui.match(/onTakeTest[\s\S]{0,900}loadDayResultForCurrentUser\(selectedDate, selectedQuizScope\)/),
      'onTakeTest re-verifies scoped server truth before opening dashboard',
    ) && ok;

  ok =
    line(
      ui.includes('LaunchedEffect(selectedDate, dailyQuizSessionKey, selectedQuizScope)') &&
        ui.includes('dayResultLoading') &&
        ui.includes('isDayResultLoading'),
      'day reload keyed to session + date + scope with loading guard',
    ) && ok;

  // Logic mirror
  ok =
    line(
      resolveTakeTestRoute({
        verifiedResult: { day: '2026-07-09' },
        quizItemsEmpty: false,
        canTakeToday: false,
      }) === 'dashboard',
      'mirror: verified attempt ⇒ dashboard route',
    ) && ok;

  ok =
    line(
      resolveTakeTestRoute({
        verifiedResult: null,
        quizItemsEmpty: false,
        canTakeToday: true,
      }) === 'quiz',
      'mirror: no attempt + today quiz ⇒ take test route',
    ) && ok;

  ok =
    line(
      resolveTakeTestRoute({
        verifiedResult: null,
        quizItemsEmpty: false,
        canTakeToday: false,
      }) === 'hint',
      'mirror: stale local-only state ⇒ hint (not dashboard)',
    ) && ok;

  console.log('');
  if (ok) {
    console.log('VERIFY_DAILY_QUIZ_UI_ROUTING_PHASE4_OK');
    process.exit(0);
  }
  console.error('VERIFY_DAILY_QUIZ_UI_ROUTING_PHASE4_FAILED');
  process.exit(1);
}

main();
