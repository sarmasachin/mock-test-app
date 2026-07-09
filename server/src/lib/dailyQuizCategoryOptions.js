'use strict';

const { pool } = require('../db');
const { normalizeDailyQuizCategoryId } = require('./dailyQuizUtils');

const SETTING_KEY = 'dailyQuizCategoryOptions';

/** Empty until admin adds slugs (`dailyQuizCategoryOptions` in app_settings). */
const DEFAULT_DAILY_QUIZ_CATEGORIES = Object.freeze([]);

function normalizeDailyQuizCategorySlug(value) {
  return normalizeDailyQuizCategoryId(value);
}

async function getDailyQuizCategoryList() {
  const { rows } = await pool.query(`SELECT setting_value FROM app_settings WHERE setting_key = $1 LIMIT 1`, [
    SETTING_KEY,
  ]);
  if (!rows[0]) {
    return [...DEFAULT_DAILY_QUIZ_CATEGORIES];
  }
  try {
    const parsed = JSON.parse(String(rows[0].setting_value || ''));
    if (parsed && Array.isArray(parsed.categories)) {
      const out = [];
      const seen = new Set();
      for (const x of parsed.categories) {
        const k = normalizeDailyQuizCategorySlug(x);
        if (k && !seen.has(k)) {
          seen.add(k);
          out.push(k);
        }
      }
      return out;
    }
  } catch (_e) {
    /* fall through */
  }
  return [...DEFAULT_DAILY_QUIZ_CATEGORIES];
}

async function setDailyQuizCategoryList(categories, userId) {
  const out = [];
  const seen = new Set();
  for (const x of categories || []) {
    const k = normalizeDailyQuizCategorySlug(x);
    if (k && !seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
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
  DEFAULT_DAILY_QUIZ_CATEGORIES,
  getDailyQuizCategoryList,
  setDailyQuizCategoryList,
  normalizeDailyQuizCategorySlug,
};
