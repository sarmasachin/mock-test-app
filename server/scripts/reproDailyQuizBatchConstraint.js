#!/usr/bin/env node
'use strict';

/** Reproduce multi-question batch failure from client_submission_id unique index. */
const { pool } = require('../src/db');

async function main() {
  const idx = await pool.query(
    `SELECT indexname, indexdef FROM pg_indexes
     WHERE tablename = 'daily_quiz_attempts' ORDER BY indexname`,
  );
  console.log('=== daily_quiz_attempts indexes ===');
  for (const row of idx.rows) {
    console.log(row.indexname);
    console.log(' ', row.indexdef);
  }

  const users = await pool.query('SELECT id FROM users LIMIT 1');
  if (!users.rows[0]) {
    console.log('NO_USER — skip insert repro');
    return;
  }
  const uid = users.rows[0].id;
  const cid = `repro-batch-${Date.now()}`;
  const day = '2026-07-09';

  const ins = async (itemId) =>
    pool.query(
      `INSERT INTO daily_quiz_attempts (
         user_id, quiz_day, item_id, selected_option_index, correct_index, is_correct,
         time_taken_seconds, question_prompt, options_json, explanation, client_submission_id
       ) VALUES (
         $1::uuid, $2::date, $3, 0, 0, true,
         1, 'q', '["a","b"]'::jsonb, '', $4
       )
       ON CONFLICT (user_id, quiz_day, item_id) DO UPDATE SET updated_at = now()
       RETURNING item_id`,
      [uid, day, itemId, cid],
    );

  console.log('\n=== batch insert repro (same client_submission_id, 2 items) ===');
  const r1 = await ins('item-a');
  console.log('INSERT item-a OK:', r1.rows[0].item_id);
  try {
    const r2 = await ins('item-b');
    console.log('INSERT item-b OK:', r2.rows[0].item_id);
  } catch (e) {
    console.log('INSERT item-b FAIL:', e.code, e.constraint || '(no constraint name)', e.message);
  }

  await pool.query(
    'DELETE FROM daily_quiz_attempts WHERE user_id = $1::uuid AND client_submission_id = $2',
    [uid, cid],
  );
}

main()
  .catch((e) => {
    console.error('repro_error', e.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
