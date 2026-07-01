'use strict';

/**
 * Phase 2 — offline invariant checks for MCQ shuffle helpers (no DB, no HTTP).
 * Run: node scripts/verifyMcqShuffleInvariants.js
 */
const assert = require('assert');
const {
  clampMcqCorrectIndex,
  correctTextAtIndex,
  attachCorrectOptionText,
  verifyMcqDeliveryItem,
  verifyAllMcqDeliveryItems,
  mapDbRowToDeliveryItem,
  verifyDbRowMcqInvariant,
} = require('../src/mcqShuffle');

function shuffleArray(arr) {
  const list = [...arr];
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = list[i];
    list[i] = list[j];
    list[j] = tmp;
  }
  return list;
}

/** Mirrors delivery shuffle remap in tests.js applyPerUserShuffleToQuestions. */
function simulateOptionShuffle(sourceOptions, sourceCorrect) {
  const indexed = sourceOptions.map((opt, idx) => ({ opt, idx }));
  const shuffled = shuffleArray(indexed);
  const newOptions = shuffled.map((x) => x.opt);
  const newCorrectIndex = shuffled.findIndex((x) => x.idx === sourceCorrect);
  const correctOptionText = correctTextAtIndex(sourceOptions, sourceCorrect);
  return attachCorrectOptionText(
    {
      id: 1,
      position: 1,
      questionPrompt: 'Capital?',
      options: newOptions,
      correctIndex: newCorrectIndex >= 0 ? newCorrectIndex : sourceCorrect,
      explanation: '',
      subjectKey: '',
    },
    correctOptionText,
  );
}

function run() {
  assert.strictEqual(clampMcqCorrectIndex(-1), 0);
  assert.strictEqual(clampMcqCorrectIndex(9), 3);

  const row = {
    id: 42,
    position: 3,
    stem: '2+2?',
    choice_a: '3',
    choice_b: '4',
    choice_c: '5',
    choice_d: '6',
    correct_index: 1,
    explanation: 'math',
    subject_key: 'math',
  };
  const catalog = mapDbRowToDeliveryItem(row);
  assert.strictEqual(catalog.correctOptionText, '4');
  assert.strictEqual(catalog.options[catalog.correctIndex], '4');
  assert.strictEqual(verifyDbRowMcqInvariant(row).ok, true);

  let movedCount = 0;
  for (let i = 0; i < 200; i += 1) {
    const source = ['Mumbai', 'Delhi', 'Kolkata', 'Chennai'];
    const sourceCorrect = 1;
    const delivered = simulateOptionShuffle(source, sourceCorrect);
    assert.strictEqual(delivered.correctOptionText, 'Delhi');
    const check = verifyMcqDeliveryItem(delivered);
    assert.strictEqual(check.ok, true, `iteration ${i}: ${check.reason}`);
    if (delivered.options.indexOf('Delhi') !== sourceCorrect) {
      movedCount += 1;
    }
  }
  assert.ok(movedCount > 0, 'expected Delhi to move from index B in at least one shuffle');

  const broken = attachCorrectOptionText(
    {
      options: ['A', 'B', 'C', 'D'],
      correctIndex: 0,
    },
    'C',
  );
  assert.strictEqual(broken.correctIndex, 2);
  assert.strictEqual(verifyMcqDeliveryItem(broken).ok, true);

  const batch = verifyAllMcqDeliveryItems([catalog]);
  assert.strictEqual(batch.ok, true);

  console.log('VERIFY_MCQ_SHUFFLE_OK');
}

run();
