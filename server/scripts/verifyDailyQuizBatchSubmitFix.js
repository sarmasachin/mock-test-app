#!/usr/bin/env node
'use strict';

/**
 * Verify daily quiz batch submit schema — multi-question rows may share client_submission_id.
 *
 * Usage:
 *   node scripts/verifyDailyQuizBatchSubmitFix.js
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
  console.log('=== Daily quiz batch submit fix ===\n');
  let ok = true;

  const indexJs = read('server/src/index.js');
  const migration = read('database/postgres/022_daily_quiz_batch_client_submission.sql');
  const route = read('server/src/routes/dailyQuiz.js');
  const repo = read('app/src/main/java/com/freemocktest/app/data/DailyQuizRepository.kt');

  ok =
    line(
      migration.includes('DROP INDEX IF EXISTS idx_daily_quiz_attempts_client_submission') &&
        migration.includes('idx_daily_quiz_attempts_client_submission_lookup') &&
        !migration.match(
          /CREATE UNIQUE INDEX[\s\S]*idx_daily_quiz_attempts_client_submission_lookup/,
        ),
      'migration 022: unique client_submission index replaced with lookup index',
    ) && ok;

  ok =
    line(
      indexJs.includes('DROP INDEX IF EXISTS idx_daily_quiz_attempts_client_submission') &&
        indexJs.includes('idx_daily_quiz_attempts_client_submission_lookup') &&
        !indexJs.includes('CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_quiz_attempts_client_submission'),
      'server bootstrap: no unique (user_id, client_submission_id) on daily_quiz_attempts',
    ) && ok;

  ok =
    line(
      route.includes("router.post('/attempts/batch'") &&
        route.match(
          /for \(const v of validatedList\)[\s\S]{0,120}upsertOneAttempt\(req\.userId, quizDay, v, clientSubmissionId\)/,
        ),
      'batch route: all answers share one clientSubmissionId (by design)',
    ) && ok;

  ok =
    line(
      repo.includes('submitBatchToServer') &&
        repo.includes('clientSubmissionId = UUID.randomUUID()'),
      'Android batch submit sends one clientSubmissionId per batch',
    ) && ok;

  // Static proof: unique (user_id, client_submission_id) rejects 2nd row in a multi-item batch.
  const batchRows = [
    { user_id: 'u1', quiz_day: '2026-07-09', item_id: 'q1', client_submission_id: 'batch-1' },
    { user_id: 'u1', quiz_day: '2026-07-09', item_id: 'q2', client_submission_id: 'batch-1' },
  ];
  const uniqueKey = (row) => `${row.user_id}|${row.client_submission_id}`;
  const keys = batchRows.map(uniqueKey);
  const duplicateUnique = new Set(keys).size < keys.length;
  ok =
    line(
      duplicateUnique,
      'mirror: two batch rows share client_submission_id (must NOT use unique index on that pair alone)',
    ) && ok;

  console.log('');
  if (ok) {
    console.log('VERIFY_DAILY_QUIZ_BATCH_SUBMIT_FIX_OK');
    process.exit(0);
  }
  console.error('VERIFY_DAILY_QUIZ_BATCH_SUBMIT_FIX_FAILED');
  process.exit(1);
}

main();
