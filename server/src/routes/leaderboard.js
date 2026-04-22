'use strict';

const express = require('express');
const { pool } = require('../db');

const router = express.Router();

function parseLimit(raw) {
  const parsed = parseInt(String(raw || '100'), 10);
  if (!Number.isFinite(parsed)) return 100;
  return Math.min(Math.max(parsed, 1), 200);
}

function parseRange(raw) {
  const value = String(raw || 'weekly').trim().toLowerCase();
  if (value === 'weekly' || value === 'monthly' || value === 'all') return value;
  return null;
}

router.get('/', async (req, res) => {
  const range = parseRange(req.query.range);
  if (!range) {
    return res.status(400).json({ error: 'range must be weekly, monthly or all' });
  }

  const city = String(req.query.city || '').trim();
  const state = String(req.query.state || '').trim();
  const testCatalogId = String(req.query.testCatalogId || '').trim();
  const limit = parseLimit(req.query.limit);

  const filters = [];
  const params = [];
  let idx = 1;

  if (range === 'weekly') {
    filters.push(`ta.completed_at >= now() - interval '7 days'`);
  } else if (range === 'monthly') {
    filters.push(`ta.completed_at >= now() - interval '30 days'`);
  }

  if (testCatalogId) {
    filters.push(`ta.test_catalog_id = $${idx}::uuid`);
    params.push(testCatalogId);
    idx += 1;
  }

  if (city) {
    filters.push(`u.signup_district ILIKE $${idx}`);
    params.push(city);
    idx += 1;
  }

  if (state) {
    filters.push(`u.signup_state ILIKE $${idx}`);
    params.push(state);
    idx += 1;
  }

  const whereSql = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
  params.push(limit);

  const q = `
    SELECT
      ta.user_id AS user_id,
      max(u.display_name) AS display_name,
      max(u.signup_state) AS signup_state,
      max(u.signup_district) AS signup_district,
      sum(ta.correct) AS total_correct,
      sum(ta.total) AS total_questions,
      round((sum(ta.correct)::numeric / nullif(sum(ta.total), 0)) * 500)::int AS score_out_of_500,
      max(ta.completed_at) AS last_attempt_at
    FROM test_attempts ta
    INNER JOIN users u ON u.id = ta.user_id
    ${whereSql}
    GROUP BY ta.user_id
    ORDER BY score_out_of_500 DESC, total_correct DESC, last_attempt_at ASC
    LIMIT $${idx};
  `;

  try {
    const { rows } = await pool.query(q, params);
    return res.json({
      items: rows.map((row, index) => ({
        rank: index + 1,
        userId: row.user_id,
        name: row.display_name || 'User',
        city: row.signup_district || '',
        state: row.signup_state || '',
        score: row.score_out_of_500 || 0,
        totalCorrect: Number(row.total_correct || 0),
        totalQuestions: Number(row.total_questions || 0),
        lastAttemptAt: row.last_attempt_at,
      })),
    });
  } catch (e) {
    if (e.code === '22P02') {
      return res.status(400).json({ error: 'Invalid testCatalogId' });
    }
    console.error(e);
    return res.status(500).json({ error: 'Failed to load leaderboard' });
  }
});

router.get('/filters', async (_req, res) => {
  try {
    const [tests, states, cities] = await Promise.all([
      pool.query(
        `SELECT id, title
         FROM tests
         WHERE is_published = true
         ORDER BY title ASC`,
      ),
      pool.query(
        `SELECT DISTINCT signup_state AS value
         FROM users
         WHERE signup_state <> ''
         ORDER BY value ASC`,
      ),
      pool.query(
        `SELECT DISTINCT signup_district AS value
         FROM users
         WHERE signup_district <> ''
         ORDER BY value ASC`,
      ),
    ]);

    return res.json({
      tests: tests.rows.map((row) => ({ id: row.id, title: row.title })),
      states: states.rows.map((row) => row.value),
      cities: cities.rows.map((row) => row.value),
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to load leaderboard filters' });
  }
});

module.exports = router;
