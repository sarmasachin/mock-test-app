#!/usr/bin/env node
'use strict';

/**
 * Apply migration 022 — allow multiple daily_quiz_attempts rows per client_submission_id (batch submit).
 *
 * Usage (on VPS, from server/):
 *   node scripts/applyDailyQuizBatchClientSubmissionFix.js
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { pool } = require('../src/db');

async function main() {
  const migrationPath = path.join(__dirname, '..', '..', 'database', 'postgres', '022_daily_quiz_batch_client_submission.sql');
  if (!fs.existsSync(migrationPath)) {
    console.error('FAIL  migration file missing:', migrationPath);
    process.exit(1);
  }
  const sql = fs.readFileSync(migrationPath, 'utf8');
  console.log('Applying daily quiz batch client_submission fix (022)…');
  await pool.query(sql);
  const check = await pool.query(
    `SELECT indexname, indexdef
     FROM pg_indexes
     WHERE tablename = 'daily_quiz_attempts'
       AND indexname LIKE '%client_submission%'`,
  );
  console.log('Indexes on daily_quiz_attempts (client_submission):');
  for (const row of check.rows) {
    const unique = /UNIQUE/i.test(String(row.indexdef || ''));
    console.log(`  ${row.indexname}${unique ? ' [UNIQUE — bad]' : ''}`);
  }
  const bad = check.rows.some((row) => /UNIQUE/i.test(String(row.indexdef || '')));
  if (bad) {
    console.error('APPLY_DAILY_QUIZ_BATCH_CLIENT_SUBMISSION_FIX_FAILED (unique index still present)');
    process.exit(1);
  }
  console.log('APPLY_DAILY_QUIZ_BATCH_CLIENT_SUBMISSION_FIX_OK');
  await pool.end();
}

main().catch(async (e) => {
  console.error(e);
  try {
    await pool.end();
  } catch (_e) {
    /* ignore */
  }
  process.exit(1);
});
