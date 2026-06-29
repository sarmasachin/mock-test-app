'use strict';

const express = require('express');
const { pool } = require('../db');
const {
  loadDailyQuizSettings,
  resolveDailyKey,
  loadPublishedDailyQuizItems,
  parseQuizDayInput,
} = require('../lib/dailyQuizUtils');

const router = express.Router();

function mapAttemptRow(row) {
  let options = [];
  try {
    const raw = row.options_json;
    if (Array.isArray(raw)) {
      options = raw.map((x) => String(x || ''));
    } else if (typeof raw === 'string' && raw.trim()) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) options = parsed.map((x) => String(x || ''));
    }
  } catch (_e) {
    options = [];
  }
  const quizDay = row.quiz_day instanceof Date
    ? row.quiz_day.toISOString().slice(0, 10)
    : String(row.quiz_day || '').slice(0, 10);
  return {
    quizDay,
    itemId: String(row.item_id || ''),
    selectedOptionIndex: row.selected_option_index == null
      ? null
      : Number(row.selected_option_index),
    correctIndex: Number(row.correct_index),
    isCorrect: Boolean(row.is_correct),
    timeTakenSeconds: Number(row.time_taken_seconds) || 0,
    questionPrompt: String(row.question_prompt || ''),
    options,
    explanation: String(row.explanation || ''),
    submittedAt: row.submitted_at,
  };
}

function buildSummaryFromAttempts(attempts) {
  const totalQuestions = attempts.length;
  const correctCount = attempts.filter((a) => a.isCorrect).length;
  const answered = attempts.filter((a) => a.selectedOptionIndex != null);
  const wrongCount = answered.length - correctCount;
  const skippedCount = Math.max(0, totalQuestions - answered.length);
  const timeTakenSeconds = attempts.reduce((sum, a) => sum + (Number(a.timeTakenSeconds) || 0), 0);
  return {
    correctCount,
    wrongCount,
    skippedCount,
    totalQuestions,
    timeTakenSeconds,
  };
}

async function attachRankForDay(userId, quizDay, summary) {
  const stats = await pool.query(
    `WITH user_day AS (
       SELECT user_id,
         COUNT(*) FILTER (WHERE is_correct)::int AS correct_count,
         COALESCE(SUM(time_taken_seconds), 0)::bigint AS total_time,
         MAX(submitted_at) AS last_submitted_at
       FROM daily_quiz_attempts
       WHERE quiz_day = $1::date
       GROUP BY user_id
     ),
     ranked AS (
       SELECT user_id,
         RANK() OVER (
           ORDER BY correct_count DESC, total_time ASC, last_submitted_at ASC
         )::int AS rk
       FROM user_day
     )
     SELECT r.rk AS rank,
            (SELECT COUNT(*)::int FROM user_day) AS rank_total
     FROM ranked r
     WHERE r.user_id = $2::uuid`,
    [quizDay, userId],
  );
  const row = stats.rows[0] || {};
  return {
    ...summary,
    rank: Number(row.rank) || null,
    rankTotal: Number(row.rank_total) || 0,
  };
}

async function loadUserDayAttempts(userId, quizDay) {
  const { rows } = await pool.query(
    `SELECT quiz_day, item_id, selected_option_index, correct_index, is_correct,
            time_taken_seconds, question_prompt, options_json, explanation, submitted_at
     FROM daily_quiz_attempts
     WHERE user_id = $1::uuid AND quiz_day = $2::date
     ORDER BY submitted_at ASC, item_id ASC`,
    [userId, quizDay],
  );
  return rows.map((row) => mapAttemptRow(row));
}

function validateAnswerPayload(ans) {
  const itemId = String(ans.itemId || '').trim().slice(0, 80);
  const selectedRaw = ans.selectedOptionIndex;
  const selectedOptionIndex = selectedRaw == null ? null : Number(selectedRaw);
  const correctIndex = Number(ans.correctIndex);
  const timeTakenSeconds = Math.max(0, Math.min(86400, Number(ans.timeTakenSeconds) || 0));
  const questionPrompt = String(ans.questionPrompt || '').trim().slice(0, 500);
  const explanation = String(ans.explanation || '').trim().slice(0, 1500);
  const options = Array.isArray(ans.options)
    ? ans.options.map((x) => String(x || '').trim().slice(0, 180)).filter((x) => x.length > 0).slice(0, 4)
    : [];
  if (!itemId) return { error: 'itemId required in each answer' };
  if (
    selectedOptionIndex == null
    || !Number.isInteger(selectedOptionIndex)
    || selectedOptionIndex < 0
    || selectedOptionIndex > 3
  ) {
    return { error: 'selectedOptionIndex must be 0–3 for each answer' };
  }
  if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) {
    return { error: 'correctIndex must be 0–3 for each answer' };
  }
  if (options.length < 2) return { error: 'options array required (min 2) per answer' };
  return {
    itemId,
    selectedOptionIndex,
    correctIndex,
    timeTakenSeconds,
    questionPrompt,
    explanation,
    options,
    isCorrect: selectedOptionIndex === correctIndex,
  };
}

async function upsertOneAttempt(userId, quizDay, validated, clientSubmissionId) {
  return pool.query(
    `INSERT INTO daily_quiz_attempts (
       user_id, quiz_day, item_id, selected_option_index, correct_index, is_correct,
       time_taken_seconds, question_prompt, options_json, explanation, client_submission_id,
       submitted_at, updated_at
     ) VALUES (
       $1::uuid, $2::date, $3, $4, $5, $6,
       $7, $8, $9::jsonb, $10, $11,
       now(), now()
     )
     ON CONFLICT (user_id, quiz_day, item_id) DO UPDATE SET
       selected_option_index = EXCLUDED.selected_option_index,
       correct_index = EXCLUDED.correct_index,
       is_correct = EXCLUDED.is_correct,
       time_taken_seconds = EXCLUDED.time_taken_seconds,
       question_prompt = EXCLUDED.question_prompt,
       options_json = EXCLUDED.options_json,
       explanation = EXCLUDED.explanation,
       client_submission_id = COALESCE(EXCLUDED.client_submission_id, daily_quiz_attempts.client_submission_id),
       updated_at = now()
     RETURNING quiz_day, item_id, selected_option_index, correct_index, is_correct,
               time_taken_seconds, question_prompt, options_json, explanation, submitted_at`,
    [
      userId,
      quizDay,
      validated.itemId,
      validated.selectedOptionIndex,
      validated.correctIndex,
      validated.isCorrect,
      validated.timeTakenSeconds,
      validated.questionPrompt,
      JSON.stringify(validated.options),
      validated.explanation,
      clientSubmissionId,
    ],
  );
}

/** POST /v1/daily-quiz/attempts — save one question for a calendar day. */
router.post('/attempts', async (req, res) => {
  const body = req.body || {};
  const quizDay = parseQuizDayInput(body.quizDay);
  const clientSubmissionId = String(body.clientSubmissionId || '').trim().slice(0, 120) || null;
  if (!quizDay) return res.status(400).json({ error: 'quizDay required (yyyy-MM-dd)' });

  const validated = validateAnswerPayload(body);
  if (validated.error) return res.status(400).json({ error: validated.error });

  try {
    const schedule = await loadDailyQuizSettings();
    const { quizDay: effectiveToday } = resolveDailyKey(Date.now(), schedule);
    const quizDayDate = new Date(`${quizDay}T00:00:00.000Z`);
    const todayDate = new Date(`${effectiveToday}T00:00:00.000Z`);
    if (quizDayDate.getTime() > todayDate.getTime()) {
      return res.status(400).json({ error: 'Cannot submit for a future quiz day' });
    }

    const items = await loadPublishedDailyQuizItems();
    const publishedIds = new Set(
      items.filter((x) => x && x.isPublished !== false).map((x) => String(x.id || '')),
    );
    if (!publishedIds.has(validated.itemId)) {
      return res.status(400).json({ error: 'Unknown or unpublished daily quiz item' });
    }

    if (clientSubmissionId) {
      const existing = await pool.query(
        `SELECT quiz_day FROM daily_quiz_attempts
         WHERE user_id = $1::uuid AND client_submission_id = $2
         LIMIT 1`,
        [req.userId, clientSubmissionId],
      );
      if (existing.rows[0]) {
        const day = existing.rows[0].quiz_day instanceof Date
          ? existing.rows[0].quiz_day.toISOString().slice(0, 10)
          : String(existing.rows[0].quiz_day || '').slice(0, 10);
        const attempts = await loadUserDayAttempts(req.userId, day);
        const summary = await attachRankForDay(req.userId, day, buildSummaryFromAttempts(attempts));
        res.setHeader('X-Idempotent-Replay', 'true');
        return res.status(200).json({ quizDay: day, attempts, summary });
      }
    }

    const upsert = await upsertOneAttempt(req.userId, quizDay, validated, clientSubmissionId);
    const attempts = await loadUserDayAttempts(req.userId, quizDay);
    const summary = await attachRankForDay(req.userId, quizDay, buildSummaryFromAttempts(attempts));
    return res.status(201).json({
      attempt: mapAttemptRow(upsert.rows[0]),
      quizDay,
      attempts,
      summary,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to save daily quiz attempt' });
  }
});

/** POST /v1/daily-quiz/attempts/batch — submit all admin questions for one day. */
router.post('/attempts/batch', async (req, res) => {
  const body = req.body || {};
  const quizDay = parseQuizDayInput(body.quizDay);
  const clientSubmissionId = String(body.clientSubmissionId || '').trim().slice(0, 120) || null;
  const answers = Array.isArray(body.answers) ? body.answers : [];
  if (!quizDay) return res.status(400).json({ error: 'quizDay required (yyyy-MM-dd)' });
  if (!answers.length) return res.status(400).json({ error: 'answers array required' });

  const validatedList = [];
  for (const ans of answers) {
    const validated = validateAnswerPayload(ans);
    if (validated.error) return res.status(400).json({ error: validated.error });
    validatedList.push(validated);
  }

  try {
    const schedule = await loadDailyQuizSettings();
    const { quizDay: effectiveToday } = resolveDailyKey(Date.now(), schedule);
    const quizDayDate = new Date(`${quizDay}T00:00:00.000Z`);
    const todayDate = new Date(`${effectiveToday}T00:00:00.000Z`);
    if (quizDayDate.getTime() > todayDate.getTime()) {
      return res.status(400).json({ error: 'Cannot submit for a future quiz day' });
    }

    const items = await loadPublishedDailyQuizItems();
    const publishedIds = new Set(
      items.filter((x) => x && x.isPublished !== false).map((x) => String(x.id || '')),
    );
    for (const v of validatedList) {
      if (!publishedIds.has(v.itemId)) {
        return res.status(400).json({ error: `Unknown or unpublished item: ${v.itemId}` });
      }
    }

    if (clientSubmissionId) {
      const existing = await pool.query(
        `SELECT quiz_day FROM daily_quiz_attempts
         WHERE user_id = $1::uuid AND client_submission_id = $2
         LIMIT 1`,
        [req.userId, clientSubmissionId],
      );
      if (existing.rows[0]) {
        const day = existing.rows[0].quiz_day instanceof Date
          ? existing.rows[0].quiz_day.toISOString().slice(0, 10)
          : String(existing.rows[0].quiz_day || '').slice(0, 10);
        const attempts = await loadUserDayAttempts(req.userId, day);
        const summary = await attachRankForDay(req.userId, day, buildSummaryFromAttempts(attempts));
        res.setHeader('X-Idempotent-Replay', 'true');
        return res.status(200).json({ quizDay: day, attempts, summary });
      }
    }

    for (const v of validatedList) {
      await upsertOneAttempt(req.userId, quizDay, v, clientSubmissionId);
    }

    const attempts = await loadUserDayAttempts(req.userId, quizDay);
    const summary = await attachRankForDay(req.userId, quizDay, buildSummaryFromAttempts(attempts));
    return res.status(201).json({ quizDay, attempts, summary });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to save daily quiz batch' });
  }
});

/** GET /v1/daily-quiz/attempts — history (one row per question per day). */
router.get('/attempts', async (req, res) => {
  const limit = Math.max(1, Math.min(500, Number(req.query.limit) || 200));
  try {
    const { rows } = await pool.query(
      `SELECT quiz_day, item_id, selected_option_index, correct_index, is_correct,
              time_taken_seconds, question_prompt, options_json, explanation, submitted_at
       FROM daily_quiz_attempts
       WHERE user_id = $1::uuid
       ORDER BY quiz_day DESC, submitted_at ASC
       LIMIT $2`,
      [req.userId, limit],
    );
    const attempts = rows.map((row) => mapAttemptRow(row));
    const attemptedDays = [...new Set(attempts.map((a) => a.quizDay))];
    return res.json({ attemptedDays, attempts });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to load daily quiz history' });
  }
});

/** GET /v1/daily-quiz/leaderboard — rank by total correct, then total time. */
router.get('/leaderboard', async (req, res) => {
  let quizDay = parseQuizDayInput(req.query.quizDay);
  const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 50));
  try {
    if (!quizDay) {
      const schedule = await loadDailyQuizSettings();
      quizDay = resolveDailyKey(Date.now(), schedule).quizDay;
    }
    const { rows } = await pool.query(
      `WITH user_day AS (
         SELECT
           dqa.user_id,
           COALESCE(NULLIF(trim(u.display_name), ''), 'Player') AS display_name,
           u.six_digit_public_id AS public_id,
           COUNT(*)::int AS total_questions,
           COUNT(*) FILTER (WHERE dqa.is_correct)::int AS correct_count,
           COALESCE(SUM(dqa.time_taken_seconds), 0)::bigint AS total_time,
           MAX(dqa.submitted_at) AS last_submitted_at
         FROM daily_quiz_attempts dqa
         JOIN users u ON u.id = dqa.user_id
         WHERE dqa.quiz_day = $1::date
         GROUP BY dqa.user_id, u.display_name, u.six_digit_public_id
       ),
       ranked AS (
         SELECT *,
           RANK() OVER (
             ORDER BY correct_count DESC, total_time ASC, last_submitted_at ASC
           )::int AS rank
         FROM user_day
       )
       SELECT user_id, display_name, public_id, total_questions, correct_count, total_time, rank
       FROM ranked
       ORDER BY rank ASC
       LIMIT $2`,
      [quizDay, limit],
    );
    const totalRes = await pool.query(
      `SELECT COUNT(DISTINCT user_id)::int AS c FROM daily_quiz_attempts WHERE quiz_day = $1::date`,
      [quizDay],
    );
    const totalPlayers = Number(totalRes.rows[0]?.c) || 0;
    let currentUserRank = null;
    if (req.userId) {
      const meRes = await pool.query(
        `WITH user_day AS (
           SELECT user_id,
             COUNT(*) FILTER (WHERE is_correct)::int AS correct_count,
             COALESCE(SUM(time_taken_seconds), 0)::bigint AS total_time,
             MAX(submitted_at) AS last_submitted_at
           FROM daily_quiz_attempts
           WHERE quiz_day = $1::date
           GROUP BY user_id
         ),
         ranked AS (
           SELECT user_id,
             RANK() OVER (
               ORDER BY correct_count DESC, total_time ASC, last_submitted_at ASC
             )::int AS rank
           FROM user_day
         )
         SELECT rank FROM ranked WHERE user_id = $2::uuid`,
        [quizDay, req.userId],
      );
      currentUserRank = meRes.rows[0] ? Number(meRes.rows[0].rank) : null;
    }
    const entries = rows.map((row) => {
      const pid = Number(row.public_id);
      const correctCount = Number(row.correct_count) || 0;
      const totalQuestions = Number(row.total_questions) || 0;
      return {
        rank: Number(row.rank) || 0,
        displayName: String(row.display_name || 'Player').slice(0, 80),
        publicId: Number.isFinite(pid) && pid >= 100000 ? String(pid) : null,
        correctCount,
        totalQuestions,
        isCorrect: totalQuestions > 0 && correctCount === totalQuestions,
        timeTakenSeconds: Number(row.total_time) || 0,
        isCurrentUser: String(row.user_id) === String(req.userId),
      };
    });
    return res.json({
      quizDay,
      totalPlayers,
      currentUserRank,
      entries,
    });
  } catch (e) {
    if (e && e.code === '42P01') {
      return res.json({
        quizDay: quizDay || '',
        totalPlayers: 0,
        currentUserRank: null,
        entries: [],
        tableReady: false,
      });
    }
    console.error(e);
    return res.status(500).json({ error: 'Failed to load daily quiz leaderboard' });
  }
});

/** GET /v1/daily-quiz/attempts/:quizDay — all questions + summary for that day. */
router.get('/attempts/:quizDay', async (req, res) => {
  const quizDay = parseQuizDayInput(req.params.quizDay);
  if (!quizDay) return res.status(400).json({ error: 'Invalid quizDay (use yyyy-MM-dd)' });
  try {
    const attempts = await loadUserDayAttempts(req.userId, quizDay);
    if (!attempts.length) return res.status(404).json({ error: 'No daily quiz attempt for this day' });
    const summary = await attachRankForDay(req.userId, quizDay, buildSummaryFromAttempts(attempts));
    return res.json({ quizDay, attempts, summary });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to load daily quiz attempt' });
  }
});

module.exports = router;
