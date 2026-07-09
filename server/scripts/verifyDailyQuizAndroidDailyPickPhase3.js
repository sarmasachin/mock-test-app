#!/usr/bin/env node
'use strict';

/**
 * Phase 3 — Android daily quiz uses server-delivered daily set (not full bank).
 *
 * Usage:
 *   node scripts/verifyDailyQuizAndroidDailyPickPhase3.js
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

/** Mirror loadDailyQuizToday delivery rule. */
function resolveDeliveredQuestionCount(declaredCount, itemCount) {
  if (itemCount <= 0) return 0;
  return itemCount;
}

function main() {
  console.log('=== Phase 3: Android daily quiz daily pick wiring ===\n');
  let ok = true;

  const repo = read('app/src/main/java/com/freemocktest/app/data/ContentRepository.kt');
  const ui = read('app/src/main/java/com/freemocktest/app/newui/digest/DailyDigestScreenNew.kt');
  const models = read('app/src/main/java/com/freemocktest/app/data/remote/ApiModels.kt');
  const quizRepo = read('app/src/main/java/com/freemocktest/app/data/DailyQuizRepository.kt');

  ok =
    line(
      models.includes('DailyQuizTodayResponse') && models.includes('@SerializedName("questionCount")'),
      'ApiModels: DailyQuizTodayResponse exposes questionCount',
    ) && ok;

  ok =
    line(
      repo.includes('data class DailyQuizTodayRemote') &&
        repo.includes('val questionCount: Int') &&
        repo.includes('res.questionCount'),
      'ContentRepository: DailyQuizTodayRemote + server questionCount read',
    ) && ok;

  ok =
    line(
      repo.includes('questionCount = items.size') &&
        repo.includes('using items'),
      'ContentRepository: items list is authoritative delivery set',
    ) && ok;

  ok =
    line(
      ui.includes('dailyQuizQuestionCount') &&
        ui.includes('payload?.questionCount') &&
        ui.includes('todayQuestionCount'),
      'DailyDigestScreenNew: tracks and shows today question count',
    ) && ok;

  ok =
    line(
      ui.includes("Today's quiz has $todayQuestionCount question") &&
        ui.includes('quizItems.size.coerceAtLeast(1)'),
      'DailyDigestScreenNew: quiz flow uses delivered items length',
    ) && ok;

  ok =
    line(
      quizRepo.includes('submitBatchToServer') &&
        quizRepo.includes('answers.size < snapshot.questions.size'),
      'DailyQuizRepository: batch submit requires full delivered set',
    ) && ok;

  ok = line(resolveDeliveredQuestionCount(20, 20) === 20, 'mirror: 20 declared + 20 items → 20') && ok;
  ok = line(resolveDeliveredQuestionCount(500, 20) === 20, 'mirror: bank 500 metadata but 20 items → 20') && ok;
  ok = line(resolveDeliveredQuestionCount(20, 0) === 0, 'mirror: empty items → no quiz') && ok;

  console.log('');
  if (ok) {
    console.log('VERIFY_DAILY_QUIZ_ANDROID_DAILY_PICK_PHASE3_OK');
    process.exit(0);
  }
  console.error('VERIFY_DAILY_QUIZ_ANDROID_DAILY_PICK_PHASE3_FAILED');
  process.exit(1);
}

main();
