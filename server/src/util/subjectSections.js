'use strict';

/**
 * Normalizes admin-provided subject sections for a test (order = paper order when shuffling per subject).
 * Keys are lowercase [a-z0-9_-]{1,40}.
 */
function normalizeSubjectSectionsInput(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (let i = 0; i < raw.length; i += 1) {
    const item = raw[i];
    const o = item && typeof item === 'object' ? item : {};
    let key = String(o.key ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_');
    if (!key) {
      continue;
    }
    if (!/^[a-z0-9_-]{1,40}$/.test(key)) {
      continue;
    }
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    const label = String(o.label ?? o.key ?? key)
      .trim()
      .slice(0, 120);
    out.push({ key, label: label || key });
    if (out.length >= 40) {
      break;
    }
  }
  return out;
}

/** Validates optional question subject tag (empty = uncategorized / legacy). */
function parseQuestionSubjectKey(raw) {
  if (raw === undefined || raw === null || raw === '') {
    return { value: '' };
  }
  const s = String(raw).trim().toLowerCase();
  if (!/^[a-z0-9_-]{1,40}$/.test(s)) {
    return {
      error:
        'subjectKey must be 1-40 characters using lowercase letters, digits, underscore, or hyphen',
    };
  }
  return { value: s };
}

module.exports = {
  normalizeSubjectSectionsInput,
  parseQuestionSubjectKey,
};
