'use strict';

const { pool } = require('../db');
const { clampMcqCorrectIndex } = require('../mcqShuffle');

function hashString(input) {
  let h = 2166136261;
  const text = String(input || '');
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededRandom(seedText) {
  const seed = hashString(seedText);
  let t = seed + 0x6d2b79f5;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Seeded Fisher-Yates in place. */
function fisherYatesSeeded(list, seedPrefix) {
  for (let i = list.length - 1; i > 0; i -= 1) {
    const r = seededRandom(`${seedPrefix}-${i}`);
    const j = Math.floor(r * (i + 1));
    const tmp = list[i];
    list[i] = list[j];
    list[j] = tmp;
  }
  return list;
}

function isIdentityOrder(list, keyFn, baselineKeys) {
  if (list.length !== baselineKeys.length) return false;
  for (let i = 0; i < list.length; i += 1) {
    if (keyFn(list[i]) !== baselineKeys[i]) return false;
  }
  return true;
}

/**
 * When Fisher-Yates returns admin order, force one seeded swap so delivery always differs
 * (when length >= 2). Keeps determinism for the same seedPrefix.
 */
function ensureVisibleShuffle(list, seedPrefix, keyFn, baselineKeys) {
  if (list.length < 2) return list;
  if (!isIdentityOrder(list, keyFn, baselineKeys)) return list;
  const j = 1 + Math.floor(seededRandom(`${seedPrefix}-identity-fix`) * (list.length - 1));
  const tmp = list[0];
  list[0] = list[j];
  list[j] = tmp;
  return list;
}

function shuffleQuizOptions(item, dayKey) {
  const orig = clampMcqCorrectIndex(item.correctIndex);
  const options = [
    { text: item.optionA, originalIndex: 0 },
    { text: item.optionB, originalIndex: 1 },
    { text: item.optionC, originalIndex: 2 },
    { text: item.optionD, originalIndex: 3 },
  ];
  const baselineKeys = options.map((x) => x.originalIndex);
  const list = [...options];
  const seedPrefix = `daily-quiz-opt-${item.id}-${dayKey}`;
  fisherYatesSeeded(list, seedPrefix);
  ensureVisibleShuffle(list, seedPrefix, (x) => x.originalIndex, baselineKeys);
  const correctIndex = list.findIndex((x) => x.originalIndex === orig);
  if (correctIndex < 0) {
    return {
      options: [item.optionA, item.optionB, item.optionC, item.optionD].map((x) => String(x || '')),
      correctIndex: orig,
    };
  }
  return {
    options: list.map((x) => x.text),
    correctIndex,
  };
}

function mapItemsToQuizDelivery(items, dayKey) {
  if (!items.length) return [];
  const baselineKeys = items.map((x) => String(x.id || ''));
  const list = [...items];
  const seedPrefix = `daily-quiz-order-${dayKey}`;
  fisherYatesSeeded(list, seedPrefix);
  ensureVisibleShuffle(list, seedPrefix, (x) => String(x.id || ''), baselineKeys);
  return list.map((item) => {
    const shuffled = shuffleQuizOptions(item, dayKey);
    return {
      id: String(item.id || ''),
      questionPrompt: String(item.questionPrompt || ''),
      options: shuffled.options,
      correctIndex: shuffled.correctIndex,
      explanation: String(item.explanation || ''),
    };
  });
}

/** All published admin questions for one calendar day (order shuffled per day, options shuffled per item). */
function buildDailyQuizItemsForDay(items, dayKey) {
  const published = items.filter((x) => x && x.isPublished !== false);
  if (!published.length) return [];
  return mapItemsToQuizDelivery(published, dayKey);
}

const DEFAULT_DAILY_QUIZ_SETTINGS = {
  releaseHour: 10,
  releaseMinute: 0,
  timezoneOffsetMinutes: 330,
  questionsPerDay: 20,
};

function normalizeDailyQuizSettingsFields(parsed) {
  const p = parsed && typeof parsed === 'object' ? parsed : {};
  const questionsPerDayRaw = Number(p.questionsPerDay ?? DEFAULT_DAILY_QUIZ_SETTINGS.questionsPerDay);
  return {
    releaseHour: Math.max(0, Math.min(23, Number(p.releaseHour ?? DEFAULT_DAILY_QUIZ_SETTINGS.releaseHour))),
    releaseMinute: Math.max(0, Math.min(59, Number(p.releaseMinute ?? DEFAULT_DAILY_QUIZ_SETTINGS.releaseMinute))),
    timezoneOffsetMinutes: Math.max(
      -720,
      Math.min(840, Number(p.timezoneOffsetMinutes ?? DEFAULT_DAILY_QUIZ_SETTINGS.timezoneOffsetMinutes)),
    ),
    questionsPerDay: Number.isInteger(questionsPerDayRaw) && questionsPerDayRaw >= 1 && questionsPerDayRaw <= 50
      ? questionsPerDayRaw
      : DEFAULT_DAILY_QUIZ_SETTINGS.questionsPerDay,
  };
}

function parseItemCreatedQuizDay(item, schedule) {
  const raw = String(item?.createdAt || '').trim();
  const ms = Date.parse(raw);
  if (Number.isNaN(ms)) return null;
  const offsetMs = Number(schedule.timezoneOffsetMinutes || 0) * 60 * 1000;
  const local = new Date(ms + offsetMs);
  const y = local.getUTCFullYear();
  const m = String(local.getUTCMonth() + 1).padStart(2, '0');
  const d = String(local.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function ageWeightForItem(item, quizDay, schedule) {
  const createdDay = parseItemCreatedQuizDay(item, schedule);
  if (!createdDay) return 1;
  if (createdDay === quizDay) return 10;
  const quizMs = Date.parse(`${quizDay}T00:00:00.000Z`);
  const createdMs = Date.parse(`${createdDay}T00:00:00.000Z`);
  if (Number.isNaN(quizMs) || Number.isNaN(createdMs)) return 1;
  const daysAgo = Math.floor((quizMs - createdMs) / (24 * 60 * 60 * 1000));
  if (daysAgo < 0) return 10;
  if (daysAgo <= 7) return 5;
  if (daysAgo <= 30) return 2;
  return 1;
}

function weightedSampleWithoutReplacement(items, count, seedPrefix, quizDay, schedule) {
  const pool = [...items];
  const selected = [];
  let pickIndex = 0;
  while (selected.length < count && pool.length > 0) {
    const weights = pool.map((item) => ageWeightForItem(item, quizDay, schedule));
    const total = weights.reduce((sum, w) => sum + w, 0);
    let threshold = seededRandom(`${seedPrefix}-pick-${pickIndex}`) * total;
    let chosenIdx = pool.length - 1;
    for (let i = 0; i < pool.length; i += 1) {
      threshold -= weights[i];
      if (threshold <= 0) {
        chosenIdx = i;
        break;
      }
    }
    selected.push(pool[chosenIdx]);
    pool.splice(chosenIdx, 1);
    pickIndex += 1;
  }
  return selected;
}

/**
 * Phase 1 — Pick up to [questionsPerDay] published items for [quizDay].
 * Newer uploads get higher weight; same [dayKey] ⇒ same set for all users.
 */
function selectDailyQuizItemsForDay(items, dayKey, quizDay, schedule) {
  const normalized = normalizeDailyQuizSettingsFields(schedule);
  const published = items.filter((x) => x && x.isPublished !== false);
  if (!published.length) return [];
  const perDay = normalized.questionsPerDay;
  const picked = published.length <= perDay
    ? published
    : weightedSampleWithoutReplacement(
      published,
      perDay,
      `daily-quiz-pick-${dayKey}`,
      quizDay,
      normalized,
    );
  return mapItemsToQuizDelivery(picked, dayKey);
}

/**
 * Scoped daily pick — filters bank by user scope, uses scope-aware picker seed.
 * All India keeps legacy seed `daily-quiz-pick-${dayKey}` for stable picks on legacy banks.
 */
function selectScopedDailyQuizItemsForDay(items, dayKey, quizDay, schedule, userScope) {
  const normalized = normalizeDailyQuizSettingsFields(schedule);
  const user = normalizeUserQuizScopeRequest(userScope);
  const eligible = filterEligibleDailyQuizItems(items, user);
  if (!eligible.length) return [];
  const perDay = normalized.questionsPerDay;
  const scopeKey = buildDailyQuizScopeKey(user);
  const seedPrefix = scopeKey === 'all-india'
    ? `daily-quiz-pick-${dayKey}`
    : `daily-quiz-pick-${dayKey}-${scopeKey}`;
  const picked = eligible.length <= perDay
    ? eligible
    : weightedSampleWithoutReplacement(
      eligible,
      perDay,
      seedPrefix,
      quizDay,
      normalized,
    );
  return mapItemsToQuizDelivery(picked, dayKey);
}

/** Parse GET /daily-quiz/today scope query. Returns { userScope } or { error }. */
function parseDailyQuizScopeQueryInput(query) {
  const src = query && typeof query === 'object' ? query : {};
  const scopeRaw = String(src.scope || '').trim().toLowerCase();
  const stateName = String(src.state || src.stateName || '').trim().slice(0, 120);
  if (scopeRaw === 'state' && !stateName) {
    return { error: 'state query param required when scope=state' };
  }
  const userScope = normalizeUserQuizScopeRequest({
    scope: scopeRaw || undefined,
    state: stateName,
  });
  return { userScope };
}

/**
 * Optional admin analytics delivery scope — uses quizScope (not scope) to avoid
 * collision with question-analysis day/range scope param.
 * Omit quizScope ⇒ no item filter (legacy all attempts).
 */
function parseOptionalDailyQuizDeliveryScope(query) {
  const src = query && typeof query === 'object' ? query : {};
  const quizScopeRaw = String(src.quizScope ?? '').trim();
  if (!quizScopeRaw) {
    return { userScope: null, scopeKey: null };
  }
  const parsed = parseDailyQuizScopeQueryInput({
    scope: quizScopeRaw,
    state: src.state || src.stateName,
  });
  if (parsed.error) {
    return { error: parsed.error };
  }
  return {
    userScope: parsed.userScope,
    scopeKey: buildDailyQuizScopeKey(parsed.userScope),
  };
}

/** Bank item ids eligible for a user delivery scope (empty when none). */
async function resolveDailyQuizScopedItemIds(userScope) {
  if (!userScope) return null;
  const items = await loadPublishedDailyQuizItems();
  const eligible = filterEligibleDailyQuizItems(items, userScope);
  return eligible.map((x) => String(x.id || '')).filter(Boolean);
}

async function loadDailyQuizSettings() {
  try {
    const { rows } = await pool.query(
      `SELECT setting_value FROM app_settings WHERE setting_key = 'dailyQuizSettings' LIMIT 1`,
    );
    const raw = rows[0]?.setting_value;
    const parsed = raw ? JSON.parse(String(raw || '{}')) : {};
    return normalizeDailyQuizSettingsFields(parsed);
  } catch (_e) {
    return { ...DEFAULT_DAILY_QUIZ_SETTINGS };
  }
}

function resolveDailyKey(nowMs, schedule) {
  const offsetMs = Number(schedule.timezoneOffsetMinutes || 0) * 60 * 1000;
  const localNow = new Date(nowMs + offsetMs);
  const releaseAnchor = new Date(Date.UTC(
    localNow.getUTCFullYear(),
    localNow.getUTCMonth(),
    localNow.getUTCDate(),
    Number(schedule.releaseHour || 0),
    Number(schedule.releaseMinute || 0),
    0,
    0,
  ));
  let effective = localNow;
  if (localNow.getTime() < releaseAnchor.getTime()) {
    effective = new Date(localNow.getTime() - 24 * 60 * 60 * 1000);
  }
  const y = effective.getUTCFullYear();
  const m = String(effective.getUTCMonth() + 1).padStart(2, '0');
  const d = String(effective.getUTCDate()).padStart(2, '0');
  return {
    dayKey: Number(`${y}${m}${d}`),
    quizDay: `${y}-${m}-${d}`,
  };
}

async function loadPublishedDailyQuizItems() {
  const settings = await pool.query(
    `SELECT setting_value FROM app_settings WHERE setting_key = 'dailyQuizItems' LIMIT 1`,
  );
  const raw = settings.rows[0]?.setting_value;
  const parsed = raw ? JSON.parse(String(raw || '{}')) : {};
  return Array.isArray(parsed.items) ? parsed.items : [];
}

function parseQuizDayInput(value) {
  const s = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return s;
}

/** Daily quiz question targeting — Phase 0 schema (backward compatible). */
const DAILY_QUIZ_SCOPE_ALL_INDIA = 'all_india';
const DAILY_QUIZ_SCOPE_STATE = 'state';

function normalizeDailyQuizScope(value) {
  const s = String(value || '').trim().toLowerCase();
  if (s === 'state') return DAILY_QUIZ_SCOPE_STATE;
  return DAILY_QUIZ_SCOPE_ALL_INDIA;
}

function normalizeTargetStates(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  const seen = new Set();
  for (const raw of value) {
    const state = String(raw || '').trim().slice(0, 120);
    if (!state) continue;
    const key = state.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(state);
    if (out.length >= 20) break;
  }
  return out;
}

function normalizeDailyQuizCategoryId(value) {
  const raw = String(value || '').trim().slice(0, 80);
  if (!raw) return null;
  const slug = raw
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  if (!slug || !/^[a-z0-9][a-z0-9_-]{0,62}$/.test(slug)) return null;
  return slug;
}

/**
 * Normalize scope fields on a bank item. Missing fields ⇒ all_india (legacy items).
 */
function normalizeDailyQuizItemScopeFields(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const scope = normalizeDailyQuizScope(src.scope);
  let targetStates = normalizeTargetStates(src.targetStates);
  if (scope === DAILY_QUIZ_SCOPE_ALL_INDIA) {
    targetStates = [];
  }
  const categoryId = normalizeDailyQuizCategoryId(src.categoryId);
  return { scope, targetStates, categoryId };
}

function normalizeStateNameKey(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function stateNameMatchesTarget(userStateName, targetState) {
  const userKey = normalizeStateNameKey(userStateName);
  const targetKey = normalizeStateNameKey(targetState);
  return userKey.length > 0 && userKey === targetKey;
}

/** Parse user/app scope selection for delivery (Phase 4+). */
function normalizeUserQuizScopeRequest(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const scope = normalizeDailyQuizScope(src.scope || src.mode);
  const stateName = String(src.state || src.stateName || '').trim().slice(0, 120);
  if (scope === DAILY_QUIZ_SCOPE_STATE && stateName) {
    return { scope: DAILY_QUIZ_SCOPE_STATE, stateName };
  }
  return { scope: DAILY_QUIZ_SCOPE_ALL_INDIA, stateName: null };
}

/**
 * Whether a bank item belongs in the user's selected quiz scope.
 * - All India user ⇒ only all_india-tagged items (legacy items count as all_india).
 * - State user ⇒ all_india items + state items matching that state.
 */
function dailyQuizItemEligibleForUserScope(item, userScope) {
  const itemFields = normalizeDailyQuizItemScopeFields(item);
  const user = normalizeUserQuizScopeRequest(userScope);

  if (user.scope === DAILY_QUIZ_SCOPE_ALL_INDIA) {
    return itemFields.scope === DAILY_QUIZ_SCOPE_ALL_INDIA;
  }
  if (itemFields.scope === DAILY_QUIZ_SCOPE_ALL_INDIA) {
    return true;
  }
  if (itemFields.scope === DAILY_QUIZ_SCOPE_STATE) {
    return itemFields.targetStates.some((target) => stateNameMatchesTarget(user.stateName, target));
  }
  return false;
}

function filterEligibleDailyQuizItems(items, userScope) {
  const list = Array.isArray(items) ? items : [];
  return list.filter(
    (item) => item && item.isPublished !== false && dailyQuizItemEligibleForUserScope(item, userScope),
  );
}

/** Deterministic picker seed suffix per user scope (Phase 4+). */
function buildDailyQuizScopeKey(userScope) {
  const user = normalizeUserQuizScopeRequest(userScope);
  if (user.scope === DAILY_QUIZ_SCOPE_STATE && user.stateName) {
    const slug = normalizeStateNameKey(user.stateName).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return slug ? `state-${slug}` : 'all-india';
  }
  return 'all-india';
}

function mergeDailyQuizItemScopeFields(item) {
  const base = item && typeof item === 'object' ? item : {};
  return { ...base, ...normalizeDailyQuizItemScopeFields(base) };
}

/** Returns error message or null when scope fields are valid for persistence. */
function validateDailyQuizItemScopeFields(fields) {
  if (!fields || fields.scope !== DAILY_QUIZ_SCOPE_STATE) return null;
  if (!Array.isArray(fields.targetStates) || fields.targetStates.length === 0) {
    return 'state scope requires at least one target state in targetStates';
  }
  return null;
}

function getAdminDailyQuizItemScopeError(raw) {
  return validateDailyQuizItemScopeFields(normalizeDailyQuizItemScopeFields(raw));
}

/**
 * Admin bank item normalizer (question body + scope). Returns null when invalid.
 */
function normalizeAdminDailyQuizItem(raw, fallbackId) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const id = String(src.id || fallbackId || '').trim() || `dq-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
  const questionPrompt = String(src.questionPrompt || '').trim().slice(0, 500);
  const optionA = String(src.optionA || '').trim().slice(0, 180);
  const optionB = String(src.optionB || '').trim().slice(0, 180);
  const optionC = String(src.optionC || '').trim().slice(0, 180);
  const optionD = String(src.optionD || '').trim().slice(0, 180);
  const correctIndex = Number(src.correctIndex);
  const explanation = String(src.explanation || '').trim().slice(0, 1500);
  const isPublished = src.isPublished !== false;
  if (!questionPrompt || !optionA || !optionB || !optionC || !optionD) return null;
  if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) return null;

  const scopeFields = normalizeDailyQuizItemScopeFields(src);
  if (validateDailyQuizItemScopeFields(scopeFields)) return null;

  return {
    id,
    questionPrompt,
    optionA,
    optionB,
    optionC,
    optionD,
    correctIndex,
    explanation,
    isPublished,
    scope: scopeFields.scope,
    targetStates: scopeFields.targetStates,
    categoryId: scopeFields.categoryId,
    createdAt: String(src.createdAt || new Date().toISOString()),
    updatedAt: new Date().toISOString(),
  };
}

function escapeIlikePattern(value) {
  return String(value || '').replace(/[%_\\]/g, '\\$&');
}

/**
 * Rank players for one quiz day — same ordering as GET /v1/daily-quiz/leaderboard.
 * @returns {{ rows: object[], totalPlayers: number }}
 */
async function loadDailyQuizLeaderboardForDay(pool, quizDay, opts = {}) {
  if (!quizDay) {
    throw new Error('quizDay required');
  }
  const maxLimit = Math.max(1, Math.min(200, Number(opts.maxLimit) || 100));
  const limit = Math.max(1, Math.min(maxLimit, Number(opts.limit) || 50));
  const searchQ = String(opts.searchQ || '').trim().slice(0, 80);
  const scopedItemIds = opts.userScope ? await resolveDailyQuizScopedItemIds(opts.userScope) : null;
  if (opts.userScope && (!scopedItemIds || !scopedItemIds.length)) {
    return { rows: [], totalPlayers: 0 };
  }

  const params = [quizDay];
  let paramIdx = 2;
  const whereParts = ['dqa.quiz_day = $1::date'];
  if (scopedItemIds && scopedItemIds.length) {
    whereParts.push(`dqa.item_id = ANY($${paramIdx}::text[])`);
    params.push(scopedItemIds);
    paramIdx += 1;
  }
  let searchSql = '';
  if (searchQ) {
    params.push(`%${escapeIlikePattern(searchQ)}%`);
    searchSql = `AND (
      COALESCE(NULLIF(trim(u.display_name), ''), 'Player') ILIKE $${paramIdx}
      OR COALESCE(u.email::text, '') ILIKE $${paramIdx}
      OR COALESCE(u.six_digit_public_id::text, '') ILIKE $${paramIdx}
    )`;
    paramIdx += 1;
  }
  params.push(limit);
  const limitIdx = params.length;
  const whereSql = whereParts.join(' AND ');

  const { rows } = await pool.query(
    `WITH user_day AS (
       SELECT
         dqa.user_id,
         COALESCE(NULLIF(trim(u.display_name), ''), 'Player') AS display_name,
         u.email,
         u.six_digit_public_id AS public_id,
         COUNT(*)::int AS total_questions,
         COUNT(*) FILTER (WHERE dqa.is_correct)::int AS correct_count,
         COALESCE(SUM(dqa.time_taken_seconds), 0)::bigint AS total_time,
         MAX(dqa.submitted_at) AS last_submitted_at
       FROM daily_quiz_attempts dqa
       JOIN users u ON u.id = dqa.user_id
       WHERE ${whereSql}
       ${searchSql}
       GROUP BY dqa.user_id, u.display_name, u.email, u.six_digit_public_id
     ),
     ranked AS (
       SELECT *,
         RANK() OVER (
           ORDER BY correct_count DESC, total_time ASC, last_submitted_at ASC
         )::int AS rank
       FROM user_day
     )
     SELECT user_id, display_name, email, public_id, total_questions, correct_count, total_time, rank
     FROM ranked
     ORDER BY rank ASC
     LIMIT $${limitIdx}`,
    params,
  );

  const totalParams = [quizDay];
  let totalParamIdx = 2;
  const totalWhereParts = ['quiz_day = $1::date'];
  if (scopedItemIds && scopedItemIds.length) {
    totalWhereParts.push(`item_id = ANY($${totalParamIdx}::text[])`);
    totalParams.push(scopedItemIds);
    totalParamIdx += 1;
  }
  let totalSearchSql = '';
  if (searchQ) {
    totalParams.push(`%${escapeIlikePattern(searchQ)}%`);
    totalSearchSql = `AND EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = daily_quiz_attempts.user_id
      AND (
        COALESCE(NULLIF(trim(u.display_name), ''), 'Player') ILIKE $${totalParamIdx}
        OR COALESCE(u.email::text, '') ILIKE $${totalParamIdx}
        OR COALESCE(u.six_digit_public_id::text, '') ILIKE $${totalParamIdx}
      )
    )`;
  }
  const totalWhereSql = totalWhereParts.join(' AND ');

  const totalRes = await pool.query(
    `SELECT COUNT(DISTINCT user_id)::int AS c
     FROM daily_quiz_attempts
     WHERE ${totalWhereSql} ${totalSearchSql}`,
    totalParams,
  );

  return {
    rows,
    totalPlayers: Number(totalRes.rows[0]?.c) || 0,
  };
}

/** Rank one user on a quiz day — same ordering as leaderboard (optional delivery scope). */
async function loadDailyQuizRankForUserOnDay(pool, quizDay, userId, opts = {}) {
  if (!quizDay) {
    throw new Error('quizDay required');
  }
  const uid = String(userId || '').trim();
  if (!isUuidString(uid)) {
    throw new Error('Invalid userId');
  }
  const scopedItemIds = opts.userScope ? await resolveDailyQuizScopedItemIds(opts.userScope) : null;
  if (opts.userScope && (!scopedItemIds || !scopedItemIds.length)) {
    return { rank: null, rankTotal: 0 };
  }

  const params = [quizDay];
  let paramIdx = 2;
  let itemSql = '';
  if (scopedItemIds && scopedItemIds.length) {
    params.push(scopedItemIds);
    itemSql = `AND item_id = ANY($${paramIdx}::text[])`;
    paramIdx += 1;
  }
  params.push(uid);
  const userIdIdx = paramIdx;

  const stats = await pool.query(
    `WITH user_day AS (
       SELECT user_id,
         COUNT(*) FILTER (WHERE is_correct)::int AS correct_count,
         COALESCE(SUM(time_taken_seconds), 0)::bigint AS total_time,
         MAX(submitted_at) AS last_submitted_at
       FROM daily_quiz_attempts
       WHERE quiz_day = $1::date ${itemSql}
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
     WHERE r.user_id = $${userIdIdx}::uuid`,
    params,
  );
  const row = stats.rows[0] || {};
  return {
    rank: row.rank == null ? null : Number(row.rank),
    rankTotal: Number(row.rank_total) || 0,
  };
}

function parseQuestionAnalysisScope(value) {
  const s = String(value || 'day').trim().toLowerCase();
  return s === 'range' ? 'range' : 'day';
}

function parseQuestionAnalysisRangeDays(value) {
  const raw = String(value ?? '7').trim().toLowerCase();
  if (raw === '30' || raw === '30d') return 30;
  if (raw === '90' || raw === '90d') return 90;
  return 7;
}

function quizDayAnalysisWindow(quizDay, scope, rangeDays) {
  if (scope === 'day') {
    return { startDay: quizDay, endDay: quizDay };
  }
  const endDate = new Date(`${quizDay}T00:00:00.000Z`);
  const startDate = new Date(endDate);
  startDate.setUTCDate(startDate.getUTCDate() - (rangeDays - 1));
  return {
    startDay: startDate.toISOString().slice(0, 10),
    endDay: quizDay,
  };
}

/**
 * Aggregate per-question stats for admin Question Analysis.
 * @returns {{ startDay: string, endDay: string, scope: string, rangeDays: number, rows: object[] }}
 */
async function loadDailyQuizQuestionAnalysis(pool, opts = {}) {
  const quizDay = opts.quizDay;
  if (!quizDay) {
    throw new Error('quizDay required');
  }
  const scope = parseQuestionAnalysisScope(opts.scope);
  const rangeDays = parseQuestionAnalysisRangeDays(opts.rangeDays);
  const { startDay, endDay } = quizDayAnalysisWindow(quizDay, scope, rangeDays);
  const scopedItemIds = opts.userScope ? await resolveDailyQuizScopedItemIds(opts.userScope) : null;
  if (opts.userScope && (!scopedItemIds || !scopedItemIds.length)) {
    return { startDay, endDay, scope, rangeDays, rows: [] };
  }

  const params = [startDay, endDay];
  let itemSql = '';
  if (scopedItemIds && scopedItemIds.length) {
    params.push(scopedItemIds);
    itemSql = 'AND item_id = ANY($3::text[])';
  }

  const { rows } = await pool.query(
    `SELECT
       item_id,
       LEFT(MAX(NULLIF(trim(question_prompt), '')), 220) AS question_prompt,
       MODE() WITHIN GROUP (ORDER BY correct_index)::int AS correct_index,
       COUNT(*)::int AS attempt_count,
       COUNT(*) FILTER (WHERE is_correct)::int AS correct_count,
       ROUND(AVG(time_taken_seconds))::int AS avg_time_seconds,
       COUNT(*) FILTER (WHERE selected_option_index = 0)::int AS pick_0,
       COUNT(*) FILTER (WHERE selected_option_index = 1)::int AS pick_1,
       COUNT(*) FILTER (WHERE selected_option_index = 2)::int AS pick_2,
       COUNT(*) FILTER (WHERE selected_option_index = 3)::int AS pick_3,
       COUNT(*) FILTER (WHERE selected_option_index IS NULL)::int AS skipped_count
     FROM daily_quiz_attempts
     WHERE quiz_day >= $1::date AND quiz_day <= $2::date
     ${itemSql}
     GROUP BY item_id
     ORDER BY
       (COUNT(*) FILTER (WHERE is_correct)::float / NULLIF(COUNT(*), 0)) ASC NULLS LAST,
       COUNT(*)::int DESC,
       item_id ASC`,
    params,
  );

  return { startDay, endDay, scope, rangeDays, rows };
}

function mapDailyQuizQuestionAnalysisRow(row) {
  const attemptCount = Number(row.attempt_count) || 0;
  const correctCount = Number(row.correct_count) || 0;
  const optionPicks = [
    Number(row.pick_0) || 0,
    Number(row.pick_1) || 0,
    Number(row.pick_2) || 0,
    Number(row.pick_3) || 0,
  ];
  const skippedCount = Number(row.skipped_count) || 0;
  const answeredPicks = optionPicks.reduce((sum, n) => sum + n, 0);
  const correctRatePct = attemptCount > 0 ? Math.round((100 * correctCount) / attemptCount) : 0;
  let difficulty = 'medium';
  if (attemptCount <= 0) difficulty = 'unknown';
  else if (correctRatePct < 50) difficulty = 'hard';
  else if (correctRatePct >= 80) difficulty = 'easy';

  const optionPickPct = answeredPicks > 0
    ? optionPicks.map((pick) => Math.round((100 * pick) / answeredPicks))
    : [0, 0, 0, 0];

  const correctIndexRaw = Number(row.correct_index);
  const correctIndex = Number.isInteger(correctIndexRaw) && correctIndexRaw >= 0 && correctIndexRaw <= 3
    ? correctIndexRaw
    : null;

  return {
    itemId: String(row.item_id || ''),
    questionPrompt: String(row.question_prompt || 'Question'),
    correctIndex,
    attemptCount,
    correctCount,
    correctRatePct,
    avgTimeSeconds: Number(row.avg_time_seconds) || 0,
    skippedCount,
    optionPicks,
    optionPickPct,
    difficulty,
  };
}

function parseDailyQuizOptionsJson(raw) {
  let options = [];
  try {
    if (Array.isArray(raw)) {
      options = raw.map((x) => String(x || ''));
    } else if (typeof raw === 'string' && raw.trim()) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) options = parsed.map((x) => String(x || ''));
    }
  } catch (_e) {
    options = [];
  }
  return options.slice(0, 4);
}

function isUuidString(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || '').trim(),
  );
}

function parseAnswerReviewResultFilter(value) {
  const s = String(value || 'all').trim().toLowerCase();
  if (s === 'correct' || s === 'wrong' || s === 'skipped') return s;
  return 'all';
}

function mapDailyQuizAttemptAdminRow(row) {
  const quizDay = row.quiz_day instanceof Date
    ? row.quiz_day.toISOString().slice(0, 10)
    : String(row.quiz_day || '').slice(0, 10);
  const pid = Number(row.public_id);
  const selectedOptionIndex = row.selected_option_index == null
    ? null
    : Number(row.selected_option_index);
  return {
    id: Number(row.id) || 0,
    userId: String(row.user_id || ''),
    displayName: String(row.display_name || 'Player').slice(0, 80),
    email: row.email ? String(row.email).slice(0, 120) : null,
    publicId: Number.isFinite(pid) && pid >= 100000 ? String(pid) : null,
    quizDay,
    itemId: String(row.item_id || ''),
    selectedOptionIndex,
    correctIndex: Number(row.correct_index),
    isCorrect: Boolean(row.is_correct),
    isSkipped: selectedOptionIndex == null,
    timeTakenSeconds: Number(row.time_taken_seconds) || 0,
    questionPrompt: String(row.question_prompt || ''),
    options: parseDailyQuizOptionsJson(row.options_json),
    explanation: String(row.explanation || ''),
    clientSubmissionId: row.client_submission_id ? String(row.client_submission_id) : null,
    submittedAt: row.submitted_at,
  };
}

const DAILY_QUIZ_ATTEMPT_ADMIN_SELECT = `
  dqa.id,
  dqa.user_id,
  dqa.quiz_day,
  dqa.item_id,
  dqa.selected_option_index,
  dqa.correct_index,
  dqa.is_correct,
  dqa.time_taken_seconds,
  dqa.question_prompt,
  dqa.options_json,
  dqa.explanation,
  dqa.client_submission_id,
  dqa.submitted_at,
  COALESCE(NULLIF(trim(u.display_name), ''), 'Player') AS display_name,
  u.email,
  u.six_digit_public_id AS public_id
`;

/**
 * Paginated answer review list for admin.
 */
async function loadDailyQuizAnswerReview(pool, opts = {}) {
  const quizDay = opts.quizDay;
  if (!quizDay) {
    throw new Error('quizDay required');
  }
  const page = Math.max(1, Math.floor(Number(opts.page) || 1));
  const limit = Math.max(1, Math.min(100, Math.floor(Number(opts.limit) || 50)));
  const offset = (page - 1) * limit;
  const result = parseAnswerReviewResultFilter(opts.result);
  const userId = String(opts.userId || '').trim();
  const itemId = String(opts.itemId || '').trim().slice(0, 80);
  const searchQ = String(opts.searchQ || '').trim().slice(0, 80);

  const scopedItemIds = opts.userScope ? await resolveDailyQuizScopedItemIds(opts.userScope) : null;
  if (opts.userScope && (!scopedItemIds || !scopedItemIds.length)) {
    return { page, limit, total: 0, rows: [] };
  }

  const params = [quizDay];
  const where = ['dqa.quiz_day = $1::date'];
  let paramIdx = 2;

  if (scopedItemIds && scopedItemIds.length) {
    where.push(`dqa.item_id = ANY($${paramIdx}::text[])`);
    params.push(scopedItemIds);
    paramIdx += 1;
  }

  if (userId && isUuidString(userId)) {
    where.push(`dqa.user_id = $${paramIdx}::uuid`);
    params.push(userId);
    paramIdx += 1;
  }
  if (itemId) {
    where.push(`dqa.item_id = $${paramIdx}`);
    params.push(itemId);
    paramIdx += 1;
  }
  if (result === 'correct') {
    where.push('dqa.is_correct = true');
  } else if (result === 'wrong') {
    where.push('dqa.is_correct = false AND dqa.selected_option_index IS NOT NULL');
  } else if (result === 'skipped') {
    where.push('dqa.selected_option_index IS NULL');
  }
  if (searchQ) {
    params.push(`%${escapeIlikePattern(searchQ)}%`);
    where.push(`(
      COALESCE(NULLIF(trim(u.display_name), ''), 'Player') ILIKE $${paramIdx}
      OR COALESCE(u.email::text, '') ILIKE $${paramIdx}
      OR COALESCE(u.six_digit_public_id::text, '') ILIKE $${paramIdx}
      OR COALESCE(dqa.question_prompt, '') ILIKE $${paramIdx}
      OR dqa.item_id ILIKE $${paramIdx}
    )`);
    paramIdx += 1;
  }

  const whereSql = where.join(' AND ');
  const countRes = await pool.query(
    `SELECT COUNT(*)::int AS c
     FROM daily_quiz_attempts dqa
     JOIN users u ON u.id = dqa.user_id
     WHERE ${whereSql}`,
    params,
  );

  const listParams = [...params, limit, offset];
  const limitIdx = paramIdx;
  const offsetIdx = paramIdx + 1;
  const { rows } = await pool.query(
    `SELECT ${DAILY_QUIZ_ATTEMPT_ADMIN_SELECT}
     FROM daily_quiz_attempts dqa
     JOIN users u ON u.id = dqa.user_id
     WHERE ${whereSql}
     ORDER BY dqa.submitted_at DESC, dqa.id DESC
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    listParams,
  );

  return {
    page,
    limit,
    total: Number(countRes.rows[0]?.c) || 0,
    rows,
  };
}

/** Full quiz session for one user on one day. */
async function loadDailyQuizAnswerReviewSession(pool, userId, quizDay, opts = {}) {
  const uid = String(userId || '').trim();
  if (!isUuidString(uid)) {
    throw new Error('Invalid userId');
  }
  if (!quizDay) {
    throw new Error('quizDay required');
  }
  const scopedItemIds = opts.userScope ? await resolveDailyQuizScopedItemIds(opts.userScope) : null;
  if (opts.userScope && (!scopedItemIds || !scopedItemIds.length)) {
    return {
      userId: uid,
      quizDay,
      displayName: 'Player',
      clientSubmissionId: null,
      summary: {
        correctCount: 0,
        wrongCount: 0,
        skippedCount: 0,
        totalQuestions: 0,
        timeTakenSeconds: 0,
      },
      attempts: [],
    };
  }
  const params = [uid, quizDay];
  let itemSql = '';
  if (scopedItemIds && scopedItemIds.length) {
    params.push(scopedItemIds);
    itemSql = 'AND dqa.item_id = ANY($3::text[])';
  }
  const { rows } = await pool.query(
    `SELECT ${DAILY_QUIZ_ATTEMPT_ADMIN_SELECT}
     FROM daily_quiz_attempts dqa
     JOIN users u ON u.id = dqa.user_id
     WHERE dqa.user_id = $1::uuid AND dqa.quiz_day = $2::date
     ${itemSql}
     ORDER BY dqa.submitted_at ASC, dqa.item_id ASC`,
    params,
  );
  const attempts = rows.map((row) => mapDailyQuizAttemptAdminRow(row));
  const summary = {
    correctCount: attempts.filter((a) => a.isCorrect).length,
    wrongCount: attempts.filter((a) => !a.isCorrect && !a.isSkipped).length,
    skippedCount: attempts.filter((a) => a.isSkipped).length,
    totalQuestions: attempts.length,
    timeTakenSeconds: attempts.reduce((sum, a) => sum + (Number(a.timeTakenSeconds) || 0), 0),
  };
  const clientSubmissionId = attempts.find((a) => a.clientSubmissionId)?.clientSubmissionId || null;
  return {
    userId: uid,
    quizDay,
    displayName: attempts[0]?.displayName || 'Player',
    clientSubmissionId,
    summary,
    attempts,
  };
}

module.exports = {
  hashString,
  seededRandom,
  fisherYatesSeeded,
  isIdentityOrder,
  ensureVisibleShuffle,
  shuffleQuizOptions,
  mapItemsToQuizDelivery,
  buildDailyQuizItemsForDay,
  selectDailyQuizItemsForDay,
  selectScopedDailyQuizItemsForDay,
  parseDailyQuizScopeQueryInput,
  parseOptionalDailyQuizDeliveryScope,
  resolveDailyQuizScopedItemIds,
  normalizeDailyQuizSettingsFields,
  ageWeightForItem,
  weightedSampleWithoutReplacement,
  DEFAULT_DAILY_QUIZ_SETTINGS,
  loadDailyQuizSettings,
  resolveDailyKey,
  loadPublishedDailyQuizItems,
  parseQuizDayInput,
  DAILY_QUIZ_SCOPE_ALL_INDIA,
  DAILY_QUIZ_SCOPE_STATE,
  normalizeDailyQuizScope,
  normalizeTargetStates,
  normalizeDailyQuizCategoryId,
  normalizeDailyQuizItemScopeFields,
  normalizeUserQuizScopeRequest,
  stateNameMatchesTarget,
  dailyQuizItemEligibleForUserScope,
  filterEligibleDailyQuizItems,
  buildDailyQuizScopeKey,
  mergeDailyQuizItemScopeFields,
  validateDailyQuizItemScopeFields,
  getAdminDailyQuizItemScopeError,
  normalizeAdminDailyQuizItem,
  loadDailyQuizLeaderboardForDay,
  loadDailyQuizRankForUserOnDay,
  loadDailyQuizQuestionAnalysis,
  mapDailyQuizQuestionAnalysisRow,
  parseQuestionAnalysisScope,
  parseQuestionAnalysisRangeDays,
  parseAnswerReviewResultFilter,
  mapDailyQuizAttemptAdminRow,
  loadDailyQuizAnswerReview,
  loadDailyQuizAnswerReviewSession,
};
