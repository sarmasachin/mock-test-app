'use strict';
require('dotenv').config();
const { pool } = require('../src/db');

const testId = '8d792753-a54d-4b2d-b7b8-d8bd337193a2';

(async () => {
  await pool.query('DELETE FROM questions WHERE test_id = $1::uuid', [testId]);
  await pool.query(
    `INSERT INTO questions (test_id, position, stem, choice_a, choice_b, choice_c, choice_d, correct_index, explanation)
     VALUES
       ($1::uuid, 1, 'E2E Q1 stem', 'Q1A', 'Q1B', 'Q1C', 'Q1D', 0, ''),
       ($1::uuid, 2, 'E2E Q2 stem', 'Q2A', 'Q2B', 'Q2C', 'Q2D', 1, ''),
       ($1::uuid, 3, 'E2E Q3 stem', 'Q3A', 'Q3B', 'Q3C', 'Q3D', 2, '')`,
    [testId],
  );
  await pool.query(
    `UPDATE tests
     SET is_published = true, last_cycle_started_at = now(), updated_at = now()
     WHERE id = $1::uuid`,
    [testId],
  );
  const c = await pool.query('SELECT COUNT(*)::int AS c FROM questions WHERE test_id = $1::uuid', [testId]);
  console.log('seeded_questions', c.rows[0].c);
  await pool.end();
})().catch(async (e) => {
  console.error(e);
  try {
    await pool.end();
  } catch (_) {}
  process.exit(1);
});
