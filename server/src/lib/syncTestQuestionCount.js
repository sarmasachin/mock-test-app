'use strict';

async function syncTestQuestionCount(clientOrPool, testId) {
  const db = clientOrPool;
  const id = String(testId || '').trim();
  if (!id || !db?.query) return 0;
  const { rows } = await db.query(
    `UPDATE tests
     SET question_count = sub.c,
         updated_at = now()
     FROM (
       SELECT COUNT(*)::int AS c
       FROM questions
       WHERE test_id = $1::uuid AND is_published = true
     ) sub
     WHERE tests.id = $1::uuid
     RETURNING question_count`,
    [id],
  );
  return Math.max(0, Number(rows[0]?.question_count || 0));
}

module.exports = {
  syncTestQuestionCount,
};
