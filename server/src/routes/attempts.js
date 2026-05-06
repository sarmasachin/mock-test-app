'use strict';

const express = require('express');
const { pool } = require('../db');
const { insertAttemptRow } = require('../queues/attemptSubmitQueue');

const router = express.Router();
const submitWindowMs = Math.max(1000, Number(process.env.ATTEMPT_SUBMIT_WINDOW_MS || 10000));
const submitMaxPerWindow = Math.max(1, Number(process.env.ATTEMPT_SUBMIT_MAX_PER_WINDOW || 8));
const globalSubmitMaxPerWindow = Math.max(
  submitMaxPerWindow,
  Number(process.env.ATTEMPT_SUBMIT_GLOBAL_MAX_PER_WINDOW || 500),
);
const submitBuckets = new Map();
let globalBucket = { count: 0, resetAt: Date.now() + submitWindowMs };

function enforceAttemptSubmitRateLimit(userId, res) {
  const id = String(userId || '').trim();
  if (!id) return { ok: false, status: 401, error: 'Unauthorized' };
  const now = Date.now();
  if (now >= globalBucket.resetAt) {
    globalBucket = { count: 0, resetAt: now + submitWindowMs };
  }
  if (globalBucket.count >= globalSubmitMaxPerWindow) {
    const retryAfterSec = Math.max(1, Math.ceil((globalBucket.resetAt - now) / 1000));
    res.setHeader('Retry-After', String(retryAfterSec));
    return { ok: false, status: 429, error: 'Server is busy. Please retry shortly.' };
  }
  const existing = submitBuckets.get(id);
  if (!existing || now >= existing.resetAt) {
    submitBuckets.set(id, { count: 1, resetAt: now + submitWindowMs });
    globalBucket.count += 1;
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, submitMaxPerWindow - 1)));
    return { ok: true };
  }
  if (existing.count >= submitMaxPerWindow) {
    const retryAfterSec = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    res.setHeader('Retry-After', String(retryAfterSec));
    return { ok: false, status: 429, error: 'Too many submit requests. Please retry shortly.' };
  }
  existing.count += 1;
  globalBucket.count += 1;
  res.setHeader('X-RateLimit-Remaining', String(Math.max(0, submitMaxPerWindow - existing.count)));
  return { ok: true };
}

setInterval(() => {
  const now = Date.now();
  for (const [userId, state] of submitBuckets.entries()) {
    if (!state || now >= state.resetAt) submitBuckets.delete(userId);
  }
}, Math.max(5000, submitWindowMs)).unref();

router.post('/', async (req, res) => {
  const { testName, correct, total, completedAtMillis, testCatalogId, clientSubmissionId } = req.body || {};
  const name = String(testName || '').trim();
  const c = parseInt(String(correct), 10);
  const t = parseInt(String(total), 10);
  const catalog = String(testCatalogId || '').trim();
  const submissionId = String(clientSubmissionId || '').trim();
  if (!name) return res.status(400).json({ error: 'testName required' });
  if (!Number.isFinite(c) || !Number.isFinite(t) || t <= 0 || c < 0 || c > t) {
    return res.status(400).json({ error: 'Invalid correct/total' });
  }
  if (!catalog) return res.status(400).json({ error: 'testCatalogId required' });
  if (!submissionId) return res.status(400).json({ error: 'clientSubmissionId required' });

  let completedAt = new Date();
  if (completedAtMillis != null) {
    const ms = Number(completedAtMillis);
    if (Number.isFinite(ms) && ms > 0) completedAt = new Date(ms);
  }

  try {
    // Idempotent replay fast-path: do not spend rate-limit quota for duplicate retries.
    const existingAttempt = await pool.query(
      `SELECT id, test_name, correct, total, completed_at, test_catalog_id
       FROM test_attempts
       WHERE user_id = $1::uuid AND test_catalog_id = $2::uuid AND client_submission_id = $3
       LIMIT 1`,
      [req.userId, catalog, submissionId],
    );
    if (existingAttempt.rows[0]) {
      const row = existingAttempt.rows[0];
      res.setHeader('X-Idempotent-Replay', 'true');
      return res.status(200).json({
        id: String(row.id),
        testName: row.test_name,
        correct: row.correct,
        total: row.total,
        completedAt: row.completed_at,
        testCatalogId: row.test_catalog_id,
      });
    }

    const rate = enforceAttemptSubmitRateLimit(req.userId, res);
    if (!rate.ok) {
      return res.status(rate.status).json({ error: rate.error });
    }

    const row = await insertAttemptRow({
      userId: req.userId,
      name,
      c,
      t,
      completedAtIso: completedAt.toISOString(),
      catalog,
      submissionId,
    });
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
