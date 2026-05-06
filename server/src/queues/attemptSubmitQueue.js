'use strict';

/**
 * Optional Redis-backed queue for test_attempt inserts.
 * When REDIS_URL is unset, callers use direct PostgreSQL (no Redis required).
 */

const { pool } = require('../db');

let queueInstance = null;
let QueueCtor = null;

function redisUrlConfigured() {
  return Boolean(String(process.env.REDIS_URL || '').trim());
}

function getConcurrency() {
  const n = Number(process.env.ATTEMPT_QUEUE_CONCURRENCY || 8);
  return Number.isFinite(n) ? Math.max(1, Math.min(100, Math.floor(n))) : 8;
}

function getQueue() {
  if (!redisUrlConfigured()) return null;
  if (queueInstance) return queueInstance;
  try {
    QueueCtor = require('bull');
  } catch (e) {
    console.error('bull package missing; run npm install in server/. Redis queue disabled.', e && e.message);
    return null;
  }
  const redisUrl = String(process.env.REDIS_URL || '').trim();
  queueInstance = new QueueCtor('attemptSubmit', redisUrl, {
    defaultJobOptions: {
      removeOnComplete: 200,
      removeOnFail: 100,
      attempts: 1,
      timeout: Math.max(5000, Number(process.env.ATTEMPT_QUEUE_JOB_TIMEOUT_MS || 45000)),
    },
  });
  queueInstance.on('error', (err) => {
    console.error('attemptSubmit queue error', err && err.message);
  });
  queueInstance.process(getConcurrency(), async (job) => {
    const { userId, name, c, t, completedAtIso, catalog, submissionId } = job.data || {};
    const ins = await pool.query(
      `INSERT INTO test_attempts (user_id, test_name, correct, total, completed_at, test_catalog_id, client_submission_id)
       VALUES ($1::uuid, $2, $3, $4, $5, $6::uuid, $7)
       ON CONFLICT (user_id, test_catalog_id, client_submission_id)
       DO UPDATE SET completed_at = EXCLUDED.completed_at
       RETURNING id, test_name, correct, total, completed_at, test_catalog_id`,
      [userId, name, c, t, completedAtIso, catalog, submissionId],
    );
    return ins.rows[0];
  });
  return queueInstance;
}

/**
 * Run INSERT either via Bull worker (limits concurrent DB writes) or inline.
 * @returns {Promise<object>} DB row
 */
async function insertAttemptRow(payload) {
  const q = getQueue();
  const {
    userId,
    name,
    c,
    t,
    completedAtIso,
    catalog,
    submissionId,
  } = payload;

  if (!q) {
    const ins = await pool.query(
      `INSERT INTO test_attempts (user_id, test_name, correct, total, completed_at, test_catalog_id, client_submission_id)
       VALUES ($1::uuid, $2, $3, $4, $5, $6::uuid, $7)
       ON CONFLICT (user_id, test_catalog_id, client_submission_id)
       DO UPDATE SET completed_at = EXCLUDED.completed_at
       RETURNING id, test_name, correct, total, completed_at, test_catalog_id`,
      [userId, name, c, t, completedAtIso, catalog, submissionId],
    );
    return ins.rows[0];
  }

  const job = await q.add('insert', { userId, name, c, t, completedAtIso, catalog, submissionId });
  const row = await job.finished();
  return row;
}

function warmupAttemptSubmitQueue() {
  getQueue();
}

/**
 * Graceful shutdown: pause workers, wait for active jobs, disconnect Redis.
 * Pass false so Bull waits for in-flight jobs (same process as HTTP — drain HTTP first).
 */
async function closeAttemptSubmitQueue() {
  if (!queueInstance) return;
  try {
    await queueInstance.close(false);
  } catch (e) {
    console.error('attemptSubmit queue close', e && e.message);
  }
  queueInstance = null;
}

module.exports = {
  insertAttemptRow,
  closeAttemptSubmitQueue,
  redisUrlConfigured,
  warmupAttemptSubmitQueue,
};
