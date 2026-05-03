'use strict';

const { pool } = require('../db');

const SETTING_KEY = 'articleCategoryOptions';

/** Default labels until admin saves a custom list (`articleCategoryOptions` in app_settings). */
const DEFAULT_ARTICLE_CATEGORIES = Object.freeze([
  'Medical',
  'Education',
  'Government Jobs',
  'Exam',
  'Admit Card',
  'Results',
  'General',
]);

const MAX_LEN = 120;

/** Human-readable category label (not a slug): trim, single line, max length. */
function normalizeArticleCategoryLabel(value) {
  let s = String(value || '')
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return null;
  if (s.length > MAX_LEN) s = s.slice(0, MAX_LEN).trim();
  return s;
}

async function getArticleCategoryList() {
  const { rows } = await pool.query(`SELECT setting_value FROM app_settings WHERE setting_key = $1 LIMIT 1`, [
    SETTING_KEY,
  ]);
  if (!rows[0]) {
    return [...DEFAULT_ARTICLE_CATEGORIES];
  }
  try {
    const parsed = JSON.parse(String(rows[0].setting_value || ''));
    if (parsed && Array.isArray(parsed.categories) && parsed.categories.length) {
      const out = [];
      const seen = new Set();
      for (const x of parsed.categories) {
        const k = normalizeArticleCategoryLabel(x);
        if (!k) continue;
        const key = k.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(k);
      }
      if (out.length) return out;
    }
  } catch (_e) {
    /* fall through */
  }
  return [...DEFAULT_ARTICLE_CATEGORIES];
}

async function setArticleCategoryList(categories, userId) {
  const out = [];
  const seen = new Set();
  for (const x of categories || []) {
    const k = normalizeArticleCategoryLabel(x);
    if (!k) continue;
    const dedupeKey = k.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    out.push(k);
  }
  if (!out.length) {
    return { error: 'At least one category is required (short label, max 120 characters).' };
  }
  await pool.query(
    `INSERT INTO app_settings (setting_key, setting_value, updated_by)
     VALUES ($1, $2, $3::uuid)
     ON CONFLICT (setting_key)
     DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [SETTING_KEY, JSON.stringify({ categories: out }), userId],
  );
  return { categories: out };
}

module.exports = {
  DEFAULT_ARTICLE_CATEGORIES,
  getArticleCategoryList,
  setArticleCategoryList,
  normalizeArticleCategoryLabel,
};
