'use strict';

async function loadQuestionCountsForTest(db, testId) {
  const id = String(testId || '').trim();
  if (!id || !db?.query) {
    return { total: 0, published: 0 };
  }
  const { rows } = await db.query(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE is_published = true)::int AS published
     FROM questions
     WHERE test_id = $1::uuid`,
    [id],
  );
  return {
    total: Math.max(0, Number(rows[0]?.total || 0)),
    published: Math.max(0, Number(rows[0]?.published || 0)),
  };
}

function resolveSyncedQuestionCount({ total, published, currentQuestionCount = 1 }) {
  if (published > 0) return Math.min(500, published);
  if (total > 0) return Math.min(500, total);
  return Math.max(1, Math.min(500, Number(currentQuestionCount) || 1));
}

function buildQuestionCountSyncPayload({ questionCount, total, published }) {
  return {
    questionCount: Math.max(1, Number(questionCount) || 1),
    totalQuestionCount: Math.max(0, Number(total) || 0),
    publishedQuestionCount: Math.max(0, Number(published) || 0),
  };
}

/**
 * Keep tests.question_count aligned with the question bank.
 * - Published questions drive the count when any exist (live delivery).
 * - Otherwise use total questions (draft / unpublished stub phase).
 * - Never write 0 (tests_question_count_positive CHECK).
 */
async function syncTestQuestionCount(clientOrPool, testId) {
  const db = clientOrPool;
  const id = String(testId || '').trim();
  if (!id || !db?.query) {
    return buildQuestionCountSyncPayload({ questionCount: 1, total: 0, published: 0 });
  }

  const counts = await loadQuestionCountsForTest(db, id);
  const currentRes = await db.query(
    `SELECT question_count FROM tests WHERE id = $1::uuid LIMIT 1`,
    [id],
  );
  const currentQuestionCount = Math.max(1, Number(currentRes.rows[0]?.question_count || 1));
  const nextCount = resolveSyncedQuestionCount({
    total: counts.total,
    published: counts.published,
    currentQuestionCount,
  });

  const { rows } = await db.query(
    `UPDATE tests
     SET question_count = $2,
         updated_at = now()
     WHERE id = $1::uuid
     RETURNING question_count`,
    [id, nextCount],
  );

  return buildQuestionCountSyncPayload({
    questionCount: rows[0]?.question_count ?? nextCount,
    total: counts.total,
    published: counts.published,
  });
}

module.exports = {
  loadQuestionCountsForTest,
  resolveSyncedQuestionCount,
  buildQuestionCountSyncPayload,
  syncTestQuestionCount,
};
