'use strict';

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

/**
 * Target mix: ~newRatio "new" questions (created within last newWindowDays) + rest "old".
 * If too few new → fills with old. If zero new → all old (still shuffled).
 * If still short → tops up from remaining pool (shuffled).
 *
 * @param {object[]} poolRows - rows must include created_at for new/old split
 * @param {number} needed - question_count target
 * @param {{ newRatio?: number, newWindowDays?: number }} opts
 */
function selectQuestionsFromSubcategoryPool(poolRows, needed, opts = {}) {
  const rawRatio = Number(process.env.REGENERATE_NEW_RATIO);
  const envRatio = Number.isFinite(rawRatio) ? rawRatio : NaN;
  const newRatio = Math.min(
    1,
    Math.max(0, typeof opts.newRatio === 'number' ? opts.newRatio : Number.isFinite(envRatio) ? envRatio : 0.8),
  );
  const newWindowDays = Math.max(
    1,
    typeof opts.newWindowDays === 'number'
      ? opts.newWindowDays
      : Math.max(1, Number(process.env.REGENERATE_NEW_WINDOW_DAYS) || 7),
  );

  const safeRows = Array.isArray(poolRows) ? poolRows : [];
  if (!safeRows.length) return [];
  const maxPick = Math.min(Math.max(1, Number(needed) || 1), safeRows.length);
  const cutoffMs = Date.now() - newWindowDays * 24 * 60 * 60 * 1000;

  const newRows = [];
  const oldRows = [];
  for (const row of safeRows) {
    const createdAtMs = Date.parse(String(row.created_at || ''));
    if (Number.isFinite(createdAtMs) && createdAtMs >= cutoffMs) {
      newRows.push(row);
    } else {
      oldRows.push(row);
    }
  }

  let targetNew = Math.min(newRows.length, Math.round(maxPick * newRatio));
  let targetOld = maxPick - targetNew;

  if (oldRows.length < targetOld) {
    const oldDeficit = targetOld - oldRows.length;
    targetOld = oldRows.length;
    targetNew = Math.min(newRows.length, targetNew + oldDeficit);
  }
  if (newRows.length < targetNew) {
    const newDeficit = targetNew - newRows.length;
    targetNew = newRows.length;
    targetOld = Math.min(oldRows.length, targetOld + newDeficit);
  }

  const selectedNew = shuffleArray(newRows).slice(0, targetNew);
  const selectedOld = shuffleArray(oldRows).slice(0, targetOld);
  let selected = shuffleArray([...selectedNew, ...selectedOld]).slice(0, maxPick);

  if (selected.length < maxPick) {
    const pickedIds = new Set(selected.map((x) => String(x.id)));
    const remaining = shuffleArray(safeRows).filter((x) => !pickedIds.has(String(x.id)));
    selected = [...selected, ...remaining.slice(0, maxPick - selected.length)];
  }

  return selected;
}

module.exports = {
  selectQuestionsFromSubcategoryPool,
  shuffleArray,
};
