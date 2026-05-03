'use strict';

/** Default seed list when admin has not saved custom types yet (`articleFeedKindOptions` in app_settings). */
const ARTICLE_FEED_KINDS = Object.freeze([
  'news',
  'job',
  'exam',
  'notice',
  'tips',
  'blog',
  'update',
]);

const FEED_KIND_SLUG_RE = /^[a-z][a-z0-9_-]{0,62}$/;

/** Validates any feed kind slug (admin + public API); not restricted to ARTICLE_FEED_KINDS. */
function normalizeFeedKindSlug(value) {
  const k = String(value || '').trim().toLowerCase();
  if (!k || !FEED_KIND_SLUG_RE.test(k)) return null;
  return k;
}

function normalizeArticleFeedKind(value) {
  return normalizeFeedKindSlug(value);
}

const FEED_KIND_INVALID_HINT =
  'feedKind must be a lowercase slug starting with a letter, then letters, digits, hyphens or underscores (max 64 chars).';

module.exports = {
  ARTICLE_FEED_KINDS,
  normalizeFeedKindSlug,
  normalizeArticleFeedKind,
  FEED_KIND_INVALID_HINT,
};
