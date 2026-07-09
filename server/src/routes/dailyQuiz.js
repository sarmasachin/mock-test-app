'use strict';

const express = require('express');
const { pool } = require('../db');
const {
  loadDailyQuizSettings,
  resolveDailyKey,
  loadPublishedDailyQuizItems,
  parseQuizDayInput,
  loadDailyQuizLeaderboardForDay,
  loadDailyQuizRankForUserOnDay,
  selectScopedDailyQuizItemsForDay,
  parseDailyQuizScopeQueryInput,
  buildDailyQuizScopeKey,
} = require('../lib/dailyQuizUtils');

const router = express.Router();

/** GET /v1/daily-quiz/today — scoped delivery for authenticated users. */
router.get('/today', async (req, res) => {
  try {
    const parsedScope = parseDailyQuizScopeQueryInput(req.query || {});
    if (parsedScope.error) {
      return res.status(400).json({ error: parsedScope.error });
    }
    const userScope = parsedScope.userScope;
    const items = await loadPublishedDailyQuizItems();
    if (!items.length) {
      return res.status(404).json({ error: 'No daily quiz content available' });
    }
    const schedule = await loadDailyQuizSettings();
    const { dayKey, quizDay } = resolveDailyKey(Date.now(), schedule);
    const quizItems = selectScopedDailyQuizItemsForDay(items, dayKey, quizDay, schedule, userScope);
    if (!quizItems.length) {
      return res.status(404).json({ error: 'No daily quiz content available for this scope' });
    }
    return res.json({
      quizDay,
      questionCount: quizItems.length,
      items: quizItems,
      scope: userScope.scope,
      stateName: userScope.stateName,
      scopeKey: buildDailyQuizScopeKey(userScope),
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to load daily quiz' });
  }
});

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

async function attachRankForDay(userId, quizDay, summary, userScope) {
  const rankResult = await loadDailyQuizRankForUserOnDay(pool, quizDay, userId, { userScope });
  return {
    ...summary,
    rank: rankResult.rank,
    rankTotal: rankResult.rankTotal,
  };
}

function parseOptionalUserDeliveryScope(body) {
  const src = body && typeof body === 'object' ? body : {};
  const scopeRaw = String(src.scope || '').trim();
  if (!scopeRaw) return { userScope: null };
  const parsed = parseDailyQuizScopeQueryInput({
    scope: scopeRaw,
    state: src.state || src.stateName,
  });
  if (parsed.error) return { error: parsed.error };
  return { userScope: parsed.userScope };
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
  const scopeParsed = parseOptionalUserDeliveryScope(body);
  if (scopeParsed.error) return res.status(400).json({ error: scopeParsed.error });

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
        const summary = await attachRankForDay(
          req.userId,
          day,
          buildSummaryFromAttempts(attempts),
          scopeParsed.userScope,
        );
        res.setHeader('X-Idempotent-Replay', 'true');
        return res.status(200).json({ quizDay: day, attempts, summary });
      }
    }

    const upsert = await upsertOneAttempt(req.userId, quizDay, validated, clientSubmissionId);
    const attempts = await loadUserDayAttempts(req.userId, quizDay);
    const summary = await attachRankForDay(
      req.userId,
      quizDay,
      buildSummaryFromAttempts(attempts),
      scopeParsed.userScope,
    );
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

async function loadUserDayAttemptIdSet(userId, quizDay) {
  const attempts = await loadUserDayAttempts(userId, quizDay);
  return new Set(attempts.map((a) => String(a.itemId || '')));
}

function batchItemsAllPresent(itemIds, savedIds) {
  return itemIds.every((id) => savedIds.has(id));
}

async function buildBatchSuccessResponse(userId, quizDay, userScope) {
  const attempts = await loadUserDayAttempts(userId, quizDay);
  const summary = await attachRankForDay(userId, quizDay, buildSummaryFromAttempts(attempts), userScope);
  return { quizDay, attempts, summary };
}

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
  const scopeParsed = parseOptionalUserDeliveryScope(body);
  if (scopeParsed.error) return res.status(400).json({ error: scopeParsed.error });

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
        `SELECT 1 FROM daily_quiz_attempts
         WHERE user_id = $1::uuid AND client_submission_id = $2
         LIMIT 1`,
        [req.userId, clientSubmissionId],
      );
      if (existing.rows[0]) {
        const savedIds = await loadUserDayAttemptIdSet(req.userId, quizDay);
        const expectedIds = validatedList.map((v) => v.itemId);
        if (batchItemsAllPresent(expectedIds, savedIds)) {
          const payload = await buildBatchSuccessResponse(req.userId, quizDay, scopeParsed.userScope);
          res.setHeader('X-Idempotent-Replay', 'true');
          return res.status(200).json(payload);
        }
      }
    }

    const savedBefore = await loadUserDayAttemptIdSet(req.userId, quizDay);
    let submissionTagged = false;
    for (const v of validatedList) {
      if (savedBefore.has(v.itemId)) continue;
      const rowSubmissionId = clientSubmissionId && !submissionTagged ? clientSubmissionId : null;
      if (rowSubmissionId) submissionTagged = true;
      await upsertOneAttempt(req.userId, quizDay, v, rowSubmissionId);
    }

    const payload = await buildBatchSuccessResponse(req.userId, quizDay, scopeParsed.userScope);
    return res.status(201).json(payload);
  } catch (e) {
    console.error('daily_quiz_batch_save_error', e);
    if (e && e.code === '23505') {
      const constraint = String(e.constraint || '');
      if (constraint.includes('client_submission') && clientSubmissionId) {
        try {
          const savedIds = await loadUserDayAttemptIdSet(req.userId, quizDay);
          const expectedIds = validatedList.map((v) => v.itemId);
          if (batchItemsAllPresent(expectedIds, savedIds)) {
            const payload = await buildBatchSuccessResponse(req.userId, quizDay, scopeParsed.userScope);
            res.setHeader('X-Idempotent-Replay', 'true');
            return res.status(200).json(payload);
          }
        } catch (_replayErr) {
          /* fall through */
        }
        return res.status(409).json({
          error: 'Daily quiz batch schema outdated — run migration 022 or node scripts/applyDailyQuizBatchClientSubmissionFix.js on the server.',
          detail: constraint,
        });
      }
      return res.status(409).json({
        error: 'Daily quiz batch conflict — retry once. If this persists, contact support.',
        detail: constraint || undefined,
      });
    }
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
  const scopeRaw = String(req.query.scope || '').trim();
  let userScope = null;
  let scopeKey = null;
  if (scopeRaw) {
    const parsedScope = parseDailyQuizScopeQueryInput(req.query || {});
    if (parsedScope.error) {
      return res.status(400).json({ error: parsedScope.error });
    }
    userScope = parsedScope.userScope;
    scopeKey = buildDailyQuizScopeKey(userScope);
  }
  try {
    if (!quizDay) {
      const schedule = await loadDailyQuizSettings();
      quizDay = resolveDailyKey(Date.now(), schedule).quizDay;
    }
    const { rows, totalPlayers } = await loadDailyQuizLeaderboardForDay(pool, quizDay, {
      limit,
      userScope,
    });
    let currentUserRank = null;
    if (req.userId) {
      const rankResult = await loadDailyQuizRankForUserOnDay(pool, quizDay, req.userId, { userScope });
      currentUserRank = rankResult.rank;
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
      scope: userScope?.scope || null,
      stateName: userScope?.stateName || null,
      scopeKey,
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
