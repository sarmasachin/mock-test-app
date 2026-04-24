'use strict';

const express = require('express');
const { pool } = require('../db');

const router = express.Router();

async function ensurePollVotesTable() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS poll_votes (
       poll_id TEXT NOT NULL,
       user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
       option_indexes JSONB NOT NULL DEFAULT '[]'::jsonb,
       voted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
       PRIMARY KEY (poll_id, user_id)
     )`,
  );
}

async function loadPollSettings() {
  const { rows } = await pool.query(
    `SELECT setting_value FROM app_settings WHERE setting_key = 'pollSettings' LIMIT 1`,
  );
  if (!rows[0]) return { items: [] };
  try {
    const parsed = JSON.parse(String(rows[0].setting_value || '{}'));
    if (!parsed || typeof parsed !== 'object') return { items: [] };
    if (!Array.isArray(parsed.items)) return { items: [] };
    return parsed;
  } catch (_e) {
    return { items: [] };
  }
}

router.post('/:pollId/vote', async (req, res) => {
  const pollId = String(req.params.pollId || '').trim();
  const optionIndexes = Array.isArray(req.body?.optionIndexes) ? req.body.optionIndexes : [];
  if (!pollId) return res.status(400).json({ error: 'pollId required' });

  try {
    await ensurePollVotesTable();
    const settings = await loadPollSettings();
    const poll = settings.items.find((x) => String((x || {}).id || '').trim() === pollId && (x || {}).enabled !== false);
    if (!poll) return res.status(404).json({ error: 'Poll not found' });

    const options = Array.isArray(poll.options) ? poll.options : [];
    if (!options.length) return res.status(400).json({ error: 'Poll has no options' });

    const normalized = [...new Set(optionIndexes.map((x) => Number(x)).filter((x) => Number.isInteger(x) && x >= 0 && x < options.length))];
    if (!normalized.length) return res.status(400).json({ error: 'Select at least one option' });
    if (!poll.allowMultiple && normalized.length > 1) {
      return res.status(400).json({ error: 'Only one option allowed for this poll' });
    }

    await pool.query(
      `INSERT INTO poll_votes (poll_id, user_id, option_indexes, voted_at)
       VALUES ($1, $2::uuid, $3::jsonb, now())
       ON CONFLICT (poll_id, user_id)
       DO UPDATE SET option_indexes = EXCLUDED.option_indexes, voted_at = now()`,
      [pollId, req.userId, JSON.stringify(normalized)],
    );

    const voteRows = await pool.query(
      `SELECT option_indexes
       FROM poll_votes
       WHERE poll_id = $1`,
      [pollId],
    );
    const counts = Array(options.length).fill(0);
    voteRows.rows.forEach((row) => {
      const arr = Array.isArray(row.option_indexes) ? row.option_indexes : [];
      arr.forEach((idx) => {
        const n = Number(idx);
        if (Number.isInteger(n) && n >= 0 && n < counts.length) {
          counts[n] += 1;
        }
      });
    });

    return res.json({
      ok: true,
      pollId,
      optionIndexes: normalized,
      counts,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to save poll vote' });
  }
});

module.exports = router;
