'use strict';

const PUBLISH_GUARD_ERROR =
  'Cannot publish this test without at least one published question. Add questions in Question Builder (or import CSV), then publish.';

const START_BLOCK_NO_QUESTIONS =
  'This test has no published questions yet. Please try again later.';

const DELETE_LAST_PUBLISHED_ERROR =
  'Cannot remove the last published question while the test is published. Unpublish the test or add another question first.';

const UNPUBLISH_LAST_QUESTION_ERROR =
  'Cannot unpublish the last question while the test is published. Unpublish the test or add another published question first.';

const PUBLISHED_QUESTION_COUNT_SQL = `(SELECT COUNT(*)::int FROM questions q WHERE q.test_id = tests.id AND q.is_published = true)`;

async function countPublishedQuestionsForTest(db, testId) {
  const id = String(testId || '').trim();
  if (!id || !db?.query) return 0;
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS c
     FROM questions
     WHERE test_id = $1::uuid AND is_published = true`,
    [id],
  );
  return Math.max(0, Number(rows[0]?.c || 0));
}

async function assertTestPublishable(db, testId) {
  const count = await countPublishedQuestionsForTest(db, testId);
  if (count < 1) {
    return { ok: false, status: 400, error: PUBLISH_GUARD_ERROR, publishedQuestionCount: count };
  }
  return { ok: true, publishedQuestionCount: count };
}

function catalogErrorIfNoPublishedQuestions(row, publishedQuestionCount, baseError = null) {
  if (baseError) return baseError;
  if (!row || row.is_published !== true) return baseError;
  const count =
    publishedQuestionCount != null
      ? Math.max(0, Number(publishedQuestionCount))
      : null;
  if (count != null && count < 1) {
    return START_BLOCK_NO_QUESTIONS;
  }
  return null;
}

async function assertCanRemovePublishedQuestion(db, testId, questionId, { unpublishing = false } = {}) {
  const testRes = await db.query(
    `SELECT is_published FROM tests WHERE id = $1::uuid LIMIT 1`,
    [testId],
  );
  if (testRes.rows[0]?.is_published !== true) {
    return { ok: true };
  }
  const qid = Number(questionId);
  const countRes = await db.query(
    `SELECT COUNT(*)::int AS c
     FROM questions
     WHERE test_id = $1::uuid AND is_published = true AND id <> $2`,
    [testId, qid],
  );
  const remaining = Math.max(0, Number(countRes.rows[0]?.c || 0));
  if (remaining < 1) {
    return {
      ok: false,
      status: 400,
      error: unpublishing ? UNPUBLISH_LAST_QUESTION_ERROR : DELETE_LAST_PUBLISHED_ERROR,
    };
  }
  return { ok: true };
}

module.exports = {
  PUBLISH_GUARD_ERROR,
  START_BLOCK_NO_QUESTIONS,
  DELETE_LAST_PUBLISHED_ERROR,
  UNPUBLISH_LAST_QUESTION_ERROR,
  PUBLISHED_QUESTION_COUNT_SQL,
  countPublishedQuestionsForTest,
  assertTestPublishable,
  catalogErrorIfNoPublishedQuestions,
  assertCanRemovePublishedQuestion,
};
