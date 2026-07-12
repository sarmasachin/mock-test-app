'use strict';

const DRAFT_STUB_STEM =
  'यह नमूना प्रश्न है — प्रकाशन से पहले बदलें।';
const DRAFT_STUB_EXPLANATION =
  'Replace this sample question with your real MCQ before publishing the test.';

function buildDraftStubQuestionFields(testTitle = '') {
  const titleHint = String(testTitle || '').trim();
  return {
    stem: titleHint ? `${DRAFT_STUB_STEM} (${titleHint})` : DRAFT_STUB_STEM,
    choiceA: 'विकल्प A',
    choiceB: 'विकल्प B',
    choiceC: 'विकल्प C',
    choiceD: 'विकल्प D',
    correctIndex: 0,
    explanation: DRAFT_STUB_EXPLANATION,
    isPublished: false,
    subjectKey: '',
  };
}

function shouldAddDraftStubOnTestCreate({ isPublished, syncParsed, body }) {
  if (isPublished === true) return false;
  if (body?.addDraftStubQuestion === true) return true;
  return syncParsed?.mode === 'upsert';
}

async function countQuestionsForTest(db, testId) {
  const id = String(testId || '').trim();
  if (!id || !db?.query) return 0;
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS c FROM questions WHERE test_id = $1::uuid`,
    [id],
  );
  return Math.max(0, Number(rows[0]?.c || 0));
}

async function insertDraftStubQuestionIfEmpty(db, testId, { testTitle = '' } = {}) {
  const id = String(testId || '').trim();
  if (!id || !db?.query) {
    return { inserted: false, reason: 'invalid_input' };
  }
  const existing = await countQuestionsForTest(db, id);
  if (existing > 0) {
    return { inserted: false, reason: 'has_questions', existingCount: existing };
  }

  const stub = buildDraftStubQuestionFields(testTitle);
  const { rows } = await db.query(
    `INSERT INTO questions (
       test_id, position, stem, choice_a, choice_b, choice_c, choice_d, correct_index, explanation, is_published, subject_key
     ) VALUES ($1::uuid, 1, $2, $3, $4, $5, $6, $7, $8, false, $9)
     RETURNING id, test_id, position, stem, is_published`,
    [
      id,
      stub.stem,
      stub.choiceA,
      stub.choiceB,
      stub.choiceC,
      stub.choiceD,
      stub.correctIndex,
      stub.explanation,
      stub.subjectKey,
    ],
  );

  return {
    inserted: true,
    question: rows[0] || null,
  };
}

module.exports = {
  DRAFT_STUB_STEM,
  DRAFT_STUB_EXPLANATION,
  buildDraftStubQuestionFields,
  shouldAddDraftStubOnTestCreate,
  countQuestionsForTest,
  insertDraftStubQuestionIfEmpty,
};
