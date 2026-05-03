'use strict';

const { pool } = require('../db');
const { ARTICLE_FEED_KINDS, normalizeFeedKindSlug } = require('../constants/articleFeeds');

const SETTING_KEY = 'articleFeedKindOptions';

async function getArticleFeedKindList() {
  const { rows } = await pool.query(`SELECT setting_value FROM app_settings WHERE setting_key = $1 LIMIT 1`, [
    SETTING_KEY,
  ]);
  if (!rows[0]) {
    return [...ARTICLE_FEED_KINDS];
  }
  try {
    const parsed = JSON.parse(String(rows[0].setting_value || ''));
    if (parsed && Array.isArray(parsed.kinds) && parsed.kinds.length) {
      const out = [];
      const seen = new Set();
      for (const x of parsed.kinds) {
        const k = normalizeFeedKindSlug(x);
        if (k && !seen.has(k)) {
          seen.add(k);
          out.push(k);
        }
      }
      if (out.length) return out;
    }
  } catch (_e) {
    /* fall through */
  }
  return [...ARTICLE_FEED_KINDS];
}

async function setArticleFeedKindList(kinds, userId) {
  const out = [];
  const seen = new Set();
  for (const x of kinds || []) {
    const k = normalizeFeedKindSlug(x);
    if (k && !seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  }
  if (!out.length) {
    return {
      error:
        'At least one valid content type is required (lowercase slug: letter first; then letters, digits, hyphen, underscore).',
    };
  }
  await pool.query(
    `INSERT INTO app_settings (setting_key, setting_value, updated_by)
     VALUES ($1, $2, $3::uuid)
     ON CONFLICT (setting_key)
     DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [SETTING_KEY, JSON.stringify({ kinds: out }), userId],
  );
  return { kinds: out };
}

module.exports = {
  getArticleFeedKindList,
  setArticleFeedKindList,
};
