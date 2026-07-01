'use strict';

/**
 * MCQ shuffle helpers.
 *
 * correct_index is always 0–3 (columns A–D in DB). After option shuffle, remap index so
 * options[correctIndex] still equals the admin's correct option TEXT — never change which
 * text is correct, only its position. See /SHUFFLE_AND_ATTEMPT_RULES.txt §6.
 */

/** MCQ choices are indices 0–3 (A–D). Invalid DB values break shuffle remap. */
function clampMcqCorrectIndex(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.min(3, Math.max(0, Math.trunc(n)));
}

/** Read trimmed A–D option texts from a questions table row. */
function sourceOptionsFromDbRow(row) {
  return [
    String(row?.choice_a || ''),
    String(row?.choice_b || ''),
    String(row?.choice_c || ''),
    String(row?.choice_d || ''),
  ].map((x) => x.trim());
}

/** Admin's correct answer text before any per-user delivery shuffle. */
function correctTextAtIndex(options, correctIndex) {
  const opts = Array.isArray(options) ? options : [];
  const idx = clampMcqCorrectIndex(correctIndex);
  return String(opts[idx] ?? '').trim();
}

/**
 * Attach correctOptionText and repair correctIndex when it does not point at that text.
 * Safe no-op when already consistent.
 */
function attachCorrectOptionText(item, correctOptionText) {
  const text = String(correctOptionText ?? '').trim();
  const options = Array.isArray(item?.options) ? item.options.map((x) => String(x).trim()) : [];
  let correctIndex = Number(item?.correctIndex);
  const out = {
    ...item,
    options,
    correctOptionText: text,
  };
  if (!options.length) {
    out.correctIndex = clampMcqCorrectIndex(correctIndex);
    return out;
  }
  if (!(Number.isInteger(correctIndex) && correctIndex >= 0 && correctIndex < options.length)) {
    const found = text ? options.findIndex((o) => o === text) : -1;
    out.correctIndex = found >= 0 ? found : clampMcqCorrectIndex(correctIndex);
    return out;
  }
  if (text && options[correctIndex] !== text) {
    const repaired = options.findIndex((o) => o === text);
    if (repaired >= 0) {
      out.correctIndex = repaired;
    }
  } else {
    out.correctIndex = correctIndex;
  }
  return out;
}

/** Phase 2 invariant: options[correctIndex] === correctOptionText (when text is non-empty). */
function verifyMcqDeliveryItem(item) {
  const options = Array.isArray(item?.options) ? item.options : [];
  const idx = Number(item?.correctIndex);
  const expected = String(item?.correctOptionText ?? '').trim();
  if (!options.length) {
    return { ok: false, reason: 'empty options' };
  }
  if (!(Number.isInteger(idx) && idx >= 0 && idx < options.length)) {
    return { ok: false, reason: 'correctIndex out of range' };
  }
  const actual = String(options[idx] ?? '').trim();
  if (!expected) {
    return { ok: false, reason: 'missing correctOptionText' };
  }
  if (actual !== expected) {
    return { ok: false, reason: `text mismatch: "${actual}" !== "${expected}"` };
  }
  return { ok: true };
}

function verifyAllMcqDeliveryItems(items) {
  const list = Array.isArray(items) ? items : [];
  const failures = [];
  for (let i = 0; i < list.length; i += 1) {
    const check = verifyMcqDeliveryItem(list[i]);
    if (!check.ok) {
      failures.push({
        index: i,
        id: list[i]?.id,
        reason: check.reason,
      });
    }
  }
  return { ok: failures.length === 0, failures };
}

/** Map a DB questions row to a catalog/delivery item (no shuffle). */
function mapDbRowToDeliveryItem(row, overrides = {}) {
  const sourceOptions = sourceOptionsFromDbRow(row);
  const sourceCorrect = clampMcqCorrectIndex(row?.correct_index);
  const correctOptionText = correctTextAtIndex(sourceOptions, sourceCorrect);
  const base = {
    id: Number(row.id),
    position: Number(row.position || 0),
    questionPrompt: String(row.stem || ''),
    options: sourceOptions,
    correctIndex: sourceCorrect,
    explanation: String(row.explanation || ''),
    subjectKey: String(row.subject_key || '').trim(),
    ...overrides,
  };
  return attachCorrectOptionText(base, correctOptionText);
}

/**
 * After publish-time DB option shuffle: verify choice columns still match correct_index text.
 */
function verifyDbRowMcqInvariant(row) {
  const options = sourceOptionsFromDbRow(row);
  const idx = clampMcqCorrectIndex(row?.correct_index);
  const expected = correctTextAtIndex(options, idx);
  if (!expected) {
    return { ok: false, reason: 'empty correct option text' };
  }
  return verifyMcqDeliveryItem({
    options,
    correctIndex: idx,
    correctOptionText: expected,
  });
}

module.exports = {
  clampMcqCorrectIndex,
  sourceOptionsFromDbRow,
  correctTextAtIndex,
  attachCorrectOptionText,
  verifyMcqDeliveryItem,
  verifyAllMcqDeliveryItems,
  mapDbRowToDeliveryItem,
  verifyDbRowMcqInvariant,
};
