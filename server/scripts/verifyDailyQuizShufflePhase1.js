#!/usr/bin/env node
'use strict';

/**
 * Phase 1 verify — daily quiz visible shuffle (core regression).
 * Run: npm run verify:daily-quiz-shuffle-phase1
 */

const { buildDailyQuizItemsForDay, shuffleQuizOptions } = require('../src/lib/dailyQuizUtils');
const { runCoreShuffleRegression } = require('./lib/dailyQuizShuffleVerifyShared');

function main() {
  console.log('=== Phase 1: daily quiz visible shuffle (core) ===\n');
  const ok = runCoreShuffleRegression(buildDailyQuizItemsForDay, shuffleQuizOptions);
  console.log('');
  if (ok) {
    console.log('VERIFY_DAILY_QUIZ_SHUFFLE_PHASE1_OK');
    process.exit(0);
  }
  console.error('VERIFY_DAILY_QUIZ_SHUFFLE_PHASE1_FAIL');
  process.exit(1);
}

main();
