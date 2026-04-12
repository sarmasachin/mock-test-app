'use strict';

const express = require('express');
const { pool } = require('../db');

const router = express.Router();

function mapArticle(row) {
  return {
    id: row.id,
    feedKind: row.feed_kind,
    externalId: row.external_id,
    headline: row.headline,
    summary: row.summary,
    category: row.category,
    body: row.body,
    linkUrl: row.link_url,
    publishedAt: row.published_at,
  };
}

router.get('/', async (req, res) => {
  const kind = String(req.query.feedKind || 'news').toLowerCase();
  if (!['news', 'job', 'exam'].includes(kind)) {
    return res.status(400).json({ error: 'feedKind must be news, job, or exam' });
  }
  const limit = Math.min(Math.max(parseInt(String(req.query.limit || '30'), 10) || 30, 1), 100);
  const offset = Math.max(parseInt(String(req.query.offset || '0'), 10) || 0, 0);
  try {
    const { rows } = await pool.query(
      `SELECT id, feed_kind, external_id, headline, summary, category, body, link_url, published_at
       FROM news_articles
       WHERE is_published = true AND feed_kind = $1
       ORDER BY published_at DESC
       LIMIT $2 OFFSET $3`,
      [kind, limit, offset],
    );
    return res.json({ items: rows.map(mapArticle) });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to list articles' });
  }
});

router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT id, feed_kind, external_id, headline, summary, category, body, link_url, published_at
       FROM news_articles
       WHERE id = $1::uuid AND is_published = true
       LIMIT 1`,
      [id],
    );
    const row = rows[0];
    if (!row) {
      return res.status(404).json({ error: 'Article not found' });
    }
    return res.json({ article: mapArticle(row) });
  } catch (e) {
    if (e.code === '22P02') {
      return res.status(400).json({ error: 'Invalid article id' });
    }
    console.error(e);
    return res.status(500).json({ error: 'Failed to load article' });
  }
});

module.exports = router;
