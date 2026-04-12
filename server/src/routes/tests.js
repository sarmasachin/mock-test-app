'use strict';

const express = require('express');
const { pool } = require('../db');

const router = express.Router();

function mapTest(row) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    subcategory: row.subcategory,
    metaLine: row.meta_line,
    durationMinutes: row.duration_minutes,
    questionCount: row.question_count,
    testKind: row.test_kind,
  };
}

router.get('/', async (req, res) => {
  const sub = String(req.query.subcategory || '').trim();
  const kind = String(req.query.testKind || '').trim().toLowerCase();
  const limit = Math.min(Math.max(parseInt(String(req.query.limit || '40'), 10) || 40, 1), 100);
  try {
    let q;
    let params;
    if (sub && kind && ['mock', 'quiz'].includes(kind)) {
      q = `SELECT id, slug, title, subcategory, meta_line, duration_minutes, question_count, test_kind
           FROM tests
           WHERE is_published = true AND test_kind = $1
             AND subcategory ILIKE $2
           ORDER BY title ASC
           LIMIT $3`;
      params = [kind, `%${sub}%`, limit];
    } else if (sub) {
      q = `SELECT id, slug, title, subcategory, meta_line, duration_minutes, question_count, test_kind
           FROM tests
           WHERE is_published = true AND subcategory ILIKE $1
           ORDER BY title ASC
           LIMIT $2`;
      params = [`%${sub}%`, limit];
    } else if (kind && ['mock', 'quiz'].includes(kind)) {
      q = `SELECT id, slug, title, subcategory, meta_line, duration_minutes, question_count, test_kind
           FROM tests
           WHERE is_published = true AND test_kind = $1
           ORDER BY title ASC
           LIMIT $2`;
      params = [kind, limit];
    } else {
      q = `SELECT id, slug, title, subcategory, meta_line, duration_minutes, question_count, test_kind
           FROM tests
           WHERE is_published = true
           ORDER BY title ASC
           LIMIT $1`;
      params = [limit];
    }
    const { rows } = await pool.query(q, params);
    return res.json({ items: rows.map(mapTest) });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to list tests' });
  }
});

module.exports = router;
