'use strict';

const express = require('express');
const { pool } = require('../db');

const router = express.Router();

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

function isBlockedLocation(value) {
  const key = normalizeKey(value);
  return key === 'other' || key === 'not listed' || key === 'notlisted';
}

function uniqueByKey(values) {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    const text = normalizeText(value);
    if (!text) continue;
    const key = normalizeKey(text);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

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

function addRangeFilter(filters, range, alias = 'ta') {
  if (range === 'weekly') {
    filters.push(`${alias}.completed_at >= now() - interval '7 days'`);
  } else if (range === 'monthly') {
    filters.push(`${alias}.completed_at >= now() - interval '30 days'`);
  }
}

function buildCommonLocationFilters(filters, params, idxRef, city, state, userAlias = 'u') {
  if (city) {
    filters.push(`${userAlias}.signup_district ILIKE $${idxRef.value}`);
    params.push(city);
    idxRef.value += 1;
  }
  if (state) {
    filters.push(`${userAlias}.signup_state ILIKE $${idxRef.value}`);
    params.push(state);
    idxRef.value += 1;
  }
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

  addRangeFilter(filters, range, 'ta');

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
      sum(ta.correct) AS score_points,
      max(ta.completed_at) AS last_attempt_at
    FROM test_attempts ta
    INNER JOIN users u ON u.id = ta.user_id
    ${whereSql}
    GROUP BY ta.user_id
    ORDER BY score_points DESC, total_correct DESC, last_attempt_at ASC
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
        score: Number(row.score_points || 0),
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

router.get('/tests', async (req, res) => {
  const range = parseRange(req.query.range || 'all');
  if (!range) {
    return res.status(400).json({ error: 'range must be weekly, monthly or all' });
  }
  const city = String(req.query.city || '').trim();
  const state = String(req.query.state || '').trim();
  const limit = parseLimit(req.query.limit);
  const params = [];
  const filters = [`COALESCE(ta.test_catalog_id, tm.id) IS NOT NULL`];
  const idxRef = { value: 1 };
  addRangeFilter(filters, range, 'ta');
  buildCommonLocationFilters(filters, params, idxRef, city, state, 'u');
  params.push(limit);

  const whereSql = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const q = `
    SELECT
      COALESCE(t.id, tm.id)::text AS test_id,
      COALESCE(t.title, tm.title) AS test_title,
      COUNT(*)::int AS attempts_count,
      COUNT(DISTINCT ta.user_id)::int AS participants_count,
      MAX(ta.completed_at) AS last_attempt_at
    FROM test_attempts ta
    INNER JOIN users u ON u.id = ta.user_id
    LEFT JOIN tests t ON t.id = ta.test_catalog_id
    LEFT JOIN tests tm ON ta.test_catalog_id IS NULL AND lower(trim(tm.title)) = lower(trim(ta.test_name))
    ${whereSql}
    GROUP BY COALESCE(t.id, tm.id), COALESCE(t.title, tm.title)
    ORDER BY last_attempt_at DESC
    LIMIT $${idxRef.value};
  `;

  try {
    const { rows } = await pool.query(q, params);
    return res.json({
      items: rows.map((row) => ({
        testId: row.test_id,
        testTitle: row.test_title || 'Test',
        attemptsCount: Number(row.attempts_count || 0),
        participantsCount: Number(row.participants_count || 0),
        lastAttemptAt: row.last_attempt_at,
      })),
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to load leaderboard tests' });
  }
});

router.get('/test/:testId', async (req, res) => {
  const range = parseRange(req.query.range || 'weekly');
  if (!range) {
    return res.status(400).json({ error: 'range must be weekly, monthly or all' });
  }
  const testId = String(req.params.testId || '').trim();
  if (!testId) {
    return res.status(400).json({ error: 'testId required' });
  }
  const city = String(req.query.city || '').trim();
  const state = String(req.query.state || '').trim();
  const limit = parseLimit(req.query.limit);
  const params = [];
  const filters = [`COALESCE(ta.test_catalog_id, tm.id) = $1::uuid`];
  params.push(testId);
  const idxRef = { value: 2 };
  addRangeFilter(filters, range, 'ta');
  buildCommonLocationFilters(filters, params, idxRef, city, state, 'u');
  params.push(limit);
  const whereSql = `WHERE ${filters.join(' AND ')}`;
  const q = `
    SELECT
      ta.user_id AS user_id,
      max(u.display_name) AS display_name,
      max(u.signup_state) AS signup_state,
      max(u.signup_district) AS signup_district,
      sum(ta.correct) AS total_correct,
      sum(ta.total) AS total_questions,
      sum(ta.correct) AS score_points,
      max(ta.completed_at) AS last_attempt_at
    FROM test_attempts ta
    INNER JOIN users u ON u.id = ta.user_id
    LEFT JOIN tests tm ON ta.test_catalog_id IS NULL AND lower(trim(tm.title)) = lower(trim(ta.test_name))
    ${whereSql}
    GROUP BY ta.user_id
    ORDER BY score_points DESC, total_correct DESC, last_attempt_at ASC
    LIMIT $${idxRef.value};
  `;

  try {
    const testRes = await pool.query(
      `SELECT id::text AS id, title FROM tests WHERE id = $1::uuid LIMIT 1`,
      [testId],
    );
    if (!testRes.rows[0]) {
      return res.status(404).json({ error: 'Test not found' });
    }
    const { rows } = await pool.query(q, params);
    return res.json({
      test: {
        testId: testRes.rows[0].id,
        testTitle: testRes.rows[0].title || 'Test',
      },
      items: rows.map((row, index) => ({
        rank: index + 1,
        userId: row.user_id,
        name: row.display_name || 'User',
        city: row.signup_district || '',
        state: row.signup_state || '',
        score: Number(row.score_points || 0),
        totalCorrect: Number(row.total_correct || 0),
        totalQuestions: Number(row.total_questions || 0),
        lastAttemptAt: row.last_attempt_at,
      })),
    });
  } catch (e) {
    if (e.code === '22P02') {
      return res.status(400).json({ error: 'Invalid testId' });
    }
    console.error(e);
    return res.status(500).json({ error: 'Failed to load test leaderboard' });
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

    const uniqueTests = [];
    const testSeenByTitle = new Set();
    for (const row of tests.rows) {
      const id = normalizeText(row.id);
      const title = normalizeText(row.title);
      if (!id || !title) continue;
      const key = normalizeKey(title);
      if (testSeenByTitle.has(key)) continue;
      testSeenByTitle.add(key);
      uniqueTests.push({ id, title });
    }

    const cleanStates = uniqueByKey(states.rows.map((row) => row.value))
      .filter((value) => !isBlockedLocation(value));
    const cleanCities = uniqueByKey(cities.rows.map((row) => row.value))
      .filter((value) => !isBlockedLocation(value));

    return res.json({
      tests: uniqueTests,
      states: cleanStates,
      cities: cleanCities,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to load leaderboard filters' });
  }
});

module.exports = router;
