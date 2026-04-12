'use strict';

const express = require('express');
const { pool } = require('../db');

const router = express.Router();

router.post('/', async (req, res) => {
  const { testName, correct, total, completedAtMillis, testCatalogId } = req.body || {};
  const name = String(testName || '').trim();
  const c = parseInt(String(correct), 10);
  const t = parseInt(String(total), 10);
  if (!name) return res.status(400).json({ error: 'testName required' });
  if (!Number.isFinite(c) || !Number.isFinite(t) || t <= 0 || c < 0 || c > t) {
    return res.status(400).json({ error: 'Invalid correct/total' });
  }

  let completedAt = new Date();
  if (completedAtMillis != null) {
    const ms = Number(completedAtMillis);
    if (Number.isFinite(ms) && ms > 0) completedAt = new Date(ms);
  }

  let catalog = null;
  if (testCatalogId != null && String(testCatalogId).trim() !== '') {
    catalog = String(testCatalogId).trim();
  }

  try {
    const ins = await pool.query(
      `INSERT INTO test_attempts (user_id, test_name, correct, total, completed_at, test_catalog_id)
       VALUES ($1::uuid, $2, $3, $4, $5, $6::uuid)
       RETURNING id, test_name, correct, total, completed_at, test_catalog_id`,
      [req.userId, name, c, t, completedAt.toISOString(), catalog],
    );
    const row = ins.rows[0];
    return res.status(201).json({
      id: String(row.id),
      testName: row.test_name,
      correct: row.correct,
      total: row.total,
      completedAt: row.completed_at,
      testCatalogId: row.test_catalog_id,
    });
  } catch (e) {
    if (e.code === '22P02') {
      return res.status(400).json({ error: 'Invalid testCatalogId' });
    }
    if (e.code === '23503') {
      return res.status(400).json({ error: 'Invalid testCatalogId' });
    }
    console.error(e);
    return res.status(500).json({ error: 'Failed to save attempt' });
  }
});

module.exports = router;
