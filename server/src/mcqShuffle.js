'use strict';

/** MCQ choices are indices 0–3 (A–D). Invalid DB values break shuffle remap. */
function clampMcqCorrectIndex(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.min(3, Math.max(0, Math.trunc(n)));
}

module.exports = { clampMcqCorrectIndex };
