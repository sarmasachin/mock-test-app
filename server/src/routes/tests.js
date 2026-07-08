'use strict';

/**
 * Mock-test catalog + attempt question delivery.
 *
 * SHUFFLE / CYCLE RULES (authoritative detail: /SHUFFLE_AND_ATTEMPT_RULES.txt at repo root)
 * - GET /:id/questions           → DB order, NO shuffle (catalog/preview only).
 * - GET /:id/questions-attempt   → per-user shuffle when advancedConfig flags are on.
 * - Delivery seed: `${userId}:${testId}:${last_cycle_started_at}` — new cycle ⇒ new order.
 * - shuffleQuestions / shuffleOptions are independent (see rules file §2).
 * - correctIndex always tracks admin's correct OPTION TEXT after option shuffle (§6).
 * - isApplicationFromOlderCycle() gates re-apply for a new catalog cycle (§5).
 */

const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/requireAuth');
const { clampMcqCorrectIndex, correctTextAtIndex, attachCorrectOptionText, verifyAllMcqDeliveryItems, mapDbRowToDeliveryItem } = require('../mcqShuffle');
const { normalizeSubjectSectionsInput } = require('../util/subjectSections');
const { isBeforeExamStart, isExamJoinAllowed } = require('../lib/examSchedule');
const {
  isTestCatalogVisible,
  catalogVisibilityError,
} = require('../lib/testVisibility');
const {
  parseSubcategoriesQueryParam,
  buildSubcategoryOrSqlClause,
} = require('../lib/userInterests');
const {
  assertUserCanStartAttempt,
  evaluateAttemptAccess,
  countUserTestAttempts,
  lastUserTestAttemptAt,
} = require('../lib/testAttempts');
const {
  buildTestResolvePayload,
  lookupTestForResolve,
  loadPublishScheduleItemsSafe,
  resolveTestCyclePhase,
} = require('../lib/testResolve');
const {
  evaluateTestStartAccess,
  loadScheduleTimerEnabled,
} = require('../lib/testStartAccess');

const PUBLISHED_QUESTION_COUNT_SQL = `(SELECT COUNT(*)::int FROM questions q WHERE q.test_id = tests.id AND q.is_published = true) AS published_question_count`;

const router = express.Router();

function toIsoDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function resolveExamDate(row) {
  const base = row.exam_date ? new Date(row.exam_date) : null;
  if (!base || Number.isNaN(base.getTime())) return null;
  if (!row.dynamic_date_enabled) return toIsoDate(base);
  const cycleDays = Math.max(0, Number(row.date_cycle_days || 0));
  if (!cycleDays) return toIsoDate(base);
  const today = new Date();
  const diffMs = today.setHours(0, 0, 0, 0) - new Date(base).setHours(0, 0, 0, 0);
  if (diffMs <= 0) return toIsoDate(base);
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  const jump = Math.ceil(diffDays / cycleDays) * cycleDays;
  const shifted = new Date(base);
  shifted.setDate(shifted.getDate() + jump);
  return toIsoDate(shifted);
}

function toStartOfDayMs(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** True when user's application predates the current test cycle (may re-apply for new shuffle round). */
function isApplicationFromOlderCycle(row, appliedAtIso) {
  if (!appliedAtIso) return false;
  const appliedAt = new Date(appliedAtIso);
  if (Number.isNaN(appliedAt.getTime())) return false;
  const cycleStartedRaw = String(row.last_cycle_started_at || '').trim();
  const cycleStartedMs = Date.parse(cycleStartedRaw);
  if (Number.isFinite(cycleStartedMs)) {
    return appliedAt.getTime() < cycleStartedMs;
  }
  const now = new Date();
  const nowStartMs = toStartOfDayMs(now);
  const resolved = resolveExamDate(row);
  if (resolved) {
    const cycleExamDate = new Date(`${resolved}T00:00:00`);
    if (!Number.isNaN(cycleExamDate.getTime())) {
      const cycleExamMs = toStartOfDayMs(cycleExamDate);
      if (row.dynamic_date_enabled) {
        const cycleDays = Math.max(0, Number(row.date_cycle_days || 0));
        if (cycleDays > 0) {
          const cycleStartMs = cycleExamMs - (cycleDays * 24 * 60 * 60 * 1000);
          return appliedAt.getTime() < cycleStartMs;
        }
      }
      return nowStartMs > cycleExamMs && appliedAt.getTime() < cycleExamMs;
    }
  }
  const oneDayMs = 24 * 60 * 60 * 1000;
  return now.getTime() - appliedAt.getTime() >= oneDayMs;
}

function mapTest(row) {
  const capacityTotal = Math.max(0, Number(row.capacity_total || 0));
  const enrolledCount = Math.max(0, Number(row.enrolled_count || 0));
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    subcategory: row.subcategory,
    metaLine: row.meta_line,
    durationMinutes: row.duration_minutes,
    questionCount: Number.isFinite(Number(row.published_question_count))
      ? Math.max(0, Number(row.published_question_count))
      : Math.max(0, Number(row.question_count || 0)),
    testKind: row.test_kind,
    examDate: resolveExamDate(row),
    totalMarks: Number(row.total_marks || 0),
    slotLabel: String(row.slot_label || ''),
    capacityTotal,
    enrolledCount,
    remainingSeats: Math.max(0, capacityTotal - enrolledCount),
    attemptsAllowed: Number(row.attempts_allowed || 1),
    lastCycleStartedAt: row.last_cycle_started_at
      ? new Date(row.last_cycle_started_at).toISOString()
      : null,
    languageMode: String(row.language_mode || 'Bilingual'),
    examMode: String(row.exam_mode || 'Practice'),
    negativeMarkingText: String(row.negative_marking_text || 'No'),
    testTypeLabel: String(row.test_type_label || ''),
    badgeEnabled: row.badge_enabled === true,
    badgeText: String(row.badge_text || 'Live'),
    validUntil: row.valid_until ? toIsoDate(new Date(row.valid_until)) : null,
    answerKeyReleaseAt: row.answer_key_release_at ? new Date(row.answer_key_release_at).toISOString() : null,
    resultReleaseAt: row.result_release_at ? new Date(row.result_release_at).toISOString() : null,
    dynamicDateEnabled: row.dynamic_date_enabled === true,
    dateCycleDays: Number(row.date_cycle_days || 0),
  };
}

function resolveAdvancedConfigForTest(advancedMap, testId) {
  if (!advancedMap || typeof advancedMap !== 'object') return null;
  const key = String(testId || '').trim();
  if (!key) return null;
  const direct = advancedMap[key];
  if (direct && typeof direct === 'object') return direct;
  const lower = key.toLowerCase();
  for (const [mapKey, value] of Object.entries(advancedMap)) {
    if (String(mapKey).trim().toLowerCase() === lower && value && typeof value === 'object') {
      return value;
    }
  }
  return null;
}

async function loadAdvancedConfigMap() {
  try {
    const { rows } = await pool.query(
      `SELECT setting_value FROM app_settings WHERE setting_key = 'testAdvancedConfigs' LIMIT 1`,
    );
    const parsed = JSON.parse(String(rows?.[0]?.setting_value || '{}'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_e) {
    return {};
  }
}

function normalizeTestAdvancedConfig(rawValue) {
  const raw = rawValue && typeof rawValue === 'object' ? rawValue : {};
  const resultVisibilityRaw = String(raw.resultVisibility || 'immediate').trim().toLowerCase();
  const subjectSections = normalizeSubjectSectionsInput(
    Array.isArray(raw.subjectSections) ? raw.subjectSections : [],
  );
  return {
    publishAt: String(raw.publishAt || '').trim() || null,
    unpublishAt: String(raw.unpublishAt || '').trim() || null,
    resultVisibility: ['immediate', 'after_result_time'].includes(resultVisibilityRaw) ? resultVisibilityRaw : 'immediate',
    reattemptCooldownMinutes: Math.max(0, Number(raw.reattemptCooldownMinutes || 0)),
    lateJoinMinutes: Math.max(0, Number(raw.lateJoinMinutes || 0)),
    notifyBeforeMinutes: Math.max(0, Number(raw.notifyBeforeMinutes || 0)),
    resumeEnabled: raw.resumeEnabled !== false,
    /** When true: permute question sequence for delivery (see SHUFFLE_AND_ATTEMPT_RULES.txt §2). */
    shuffleQuestions: raw.shuffleQuestions === true,
    /** When true: permute all four option texts per question; correctIndex remaps to same text. */
    shuffleOptions: raw.shuffleOptions === true,
    fullscreenRequired: raw.fullscreenRequired === true,
    copyPasteBlocked: raw.copyPasteBlocked === true,
    notifyOnPublish: raw.notifyOnPublish !== false,
    subjectSections,
    cycleRepublishGapMinutes:
      raw.cycleRepublishGapMinutes === undefined ||
      raw.cycleRepublishGapMinutes === null ||
      String(raw.cycleRepublishGapMinutes).trim() === ''
        ? null
        : Math.max(0, Math.min(10080, Math.floor(Number(raw.cycleRepublishGapMinutes)))),
  };
}

function hashStringToSeed(text) {
  const str = String(text || '');
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededRandomFactory(seedValue) {
  let a = (Number(seedValue) >>> 0) || 1;
  return () => {
    a += 0x6D2B79F5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle(list, rng) {
  const arr = Array.isArray(list) ? [...list] : [];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

/**
 * Per-user delivery shuffle for GET /questions-attempt only (does not mutate DB).
 * seedText must be `${userId}:${testId}:${cycleKey}` so a new catalog cycle yields new order.
 * When shuffleOptions is on, all four choices permute and correctIndex remaps to the same text.
 */
function applyPerUserShuffleToQuestions(rows, seedText, options) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const seed = hashStringToSeed(seedText);
  const rng = seededRandomFactory(seed);
  const shuffleQuestions = options && options.shuffleQuestions === true;
  const shuffleOptions = options && options.shuffleOptions === true;
  const subjectSections = options && Array.isArray(options.subjectSections) ? options.subjectSections : [];
  const sectionKeysOrdered = subjectSections.map((s) => String(s.key || '').trim().toLowerCase()).filter(Boolean);

  const withBaseIndex = safeRows.map((row, idx) => ({ row, baseIndex: idx }));

  let ordered;
  if (!shuffleQuestions) {
    ordered = withBaseIndex;
  } else if (sectionKeysOrdered.length > 0) {
    const buckets = new Map();
    sectionKeysOrdered.forEach((k) => buckets.set(k, []));
    const orphan = [];
    for (const item of withBaseIndex) {
      const sk = String(item.row.subject_key || '').trim().toLowerCase();
      if (!sk) {
        orphan.push(item);
        continue;
      }
      if (buckets.has(sk)) {
        buckets.get(sk).push(item);
      } else {
        orphan.push(item);
      }
    }
    ordered = [];
    for (const key of sectionKeysOrdered) {
      const bucket = buckets.get(key) || [];
      ordered.push(...seededShuffle(bucket, rng));
    }
    if (orphan.length) {
      ordered.push(...seededShuffle(orphan, rng));
    }
  } else {
    ordered = seededShuffle(withBaseIndex, rng);
  }

  return ordered.map(({ row }, newPosition) => {
    const subjectKeyOut = String(row.subject_key || '').trim();
    const sourceOptions = [
      String(row.choice_a || ''),
      String(row.choice_b || ''),
      String(row.choice_c || ''),
      String(row.choice_d || ''),
    ].map((x) => x.trim());
    const sourceCorrect = clampMcqCorrectIndex(row.correct_index);
    const correctOptionText = correctTextAtIndex(sourceOptions, sourceCorrect);
    const baseOut = {
      id: Number(row.id),
      position: Number(newPosition + 1),
      questionPrompt: String(row.stem || ''),
      explanation: String(row.explanation || ''),
      subjectKey: subjectKeyOut,
    };
    if (!shuffleOptions) {
      return attachCorrectOptionText(
        {
          ...baseOut,
          options: sourceOptions,
          correctIndex: sourceCorrect,
        },
        correctOptionText,
      );
    }
    const indexed = sourceOptions.map((opt, idx) => ({ opt, idx }));
    const shuffledOpts = seededShuffle(indexed, rng);
    const newOptions = shuffledOpts.map((x) => x.opt);
    const newCorrectIndex = shuffledOpts.findIndex((x) => x.idx === sourceCorrect);
    if (newCorrectIndex < 0) {
      return attachCorrectOptionText(
        {
          ...baseOut,
          options: sourceOptions,
          correctIndex: sourceCorrect,
        },
        correctOptionText,
      );
    }
    return attachCorrectOptionText(
      {
        ...baseOut,
        options: newOptions,
        correctIndex: newCorrectIndex,
      },
      correctOptionText,
    );
  });
}

async function readWaitlistPosition(client, testId, waitlistId) {
  const rankRes = await client.query(
    `SELECT COUNT(*)::int AS position
     FROM test_waitlist
     WHERE test_id = $1::uuid
       AND status = 'waiting'
       AND (created_at, id) <= (
         SELECT created_at, id
         FROM test_waitlist
         WHERE id = $2::bigint
         LIMIT 1
       )`,
    [testId, waitlistId],
  );
  const totalRes = await client.query(
    `SELECT COUNT(*)::int AS total
     FROM test_waitlist
     WHERE test_id = $1::uuid AND status = 'waiting'`,
    [testId],
  );
  return {
    waitingPosition: Number(rankRes.rows?.[0]?.position || 0),
    waitingTotal: Number(totalRes.rows?.[0]?.total || 0),
  };
}

router.get('/', async (req, res) => {
  const sub = String(req.query.subcategory || '').trim();
  const multiSubs = !sub ? parseSubcategoriesQueryParam(req.query.subcategories) : [];
  const kind = String(req.query.testKind || '').trim().toLowerCase();
  const limit = Math.min(Math.max(parseInt(String(req.query.limit || '40'), 10) || 40, 1), 100);
  const catalogSelect = `SELECT id, slug, title, subcategory, meta_line, duration_minutes, question_count, ${PUBLISHED_QUESTION_COUNT_SQL}, test_kind, is_published,
                  exam_date, total_marks, slot_label, capacity_total, enrolled_count, attempts_allowed, last_cycle_started_at,
                  language_mode, exam_mode, negative_marking_text, test_type_label, badge_enabled, badge_text, valid_until, answer_key_release_at, result_release_at,
                  dynamic_date_enabled, date_cycle_days`;
  try {
    let q;
    let params;
    if (sub && kind && ['mock', 'quiz'].includes(kind)) {
      q = `${catalogSelect}
           FROM tests
           WHERE is_published = true AND test_kind = $1
             AND subcategory ILIKE $2
           ORDER BY title ASC
           LIMIT $3`;
      params = [kind, `%${sub}%`, limit];
    } else if (sub) {
      q = `${catalogSelect}
           FROM tests
           WHERE is_published = true AND subcategory ILIKE $1
           ORDER BY title ASC
           LIMIT $2`;
      params = [`%${sub}%`, limit];
    } else if (multiSubs.length > 0) {
      const hasKind = kind && ['mock', 'quiz'].includes(kind);
      const subClause = buildSubcategoryOrSqlClause(multiSubs, hasKind ? 2 : 1);
      if (hasKind) {
        q = `${catalogSelect}
             FROM tests
             WHERE is_published = true AND test_kind = $1 AND ${subClause.sql}
             ORDER BY title ASC
             LIMIT $${subClause.nextIndex}`;
        params = [kind, ...subClause.params, limit];
      } else {
        q = `${catalogSelect}
             FROM tests
             WHERE is_published = true AND ${subClause.sql}
             ORDER BY title ASC
             LIMIT $${subClause.nextIndex}`;
        params = [...subClause.params, limit];
      }
    } else if (kind && ['mock', 'quiz'].includes(kind)) {
      q = `${catalogSelect}
           FROM tests
           WHERE is_published = true AND test_kind = $1
           ORDER BY title ASC
           LIMIT $2`;
      params = [kind, limit];
    } else {
      q = `${catalogSelect}
           FROM tests
           WHERE is_published = true
           ORDER BY title ASC
           LIMIT $1`;
      params = [limit];
    }
    const [rowsRes, advancedMap] = await Promise.all([
      pool.query(q, params),
      loadAdvancedConfigMap(),
    ]);
    const nowMs = Date.now();
    const items = rowsRes.rows
      .filter((row) => {
        const adv = normalizeTestAdvancedConfig(resolveAdvancedConfigForTest(advancedMap, row.id));
        return isTestCatalogVisible(row, adv, nowMs);
      })
      .map((row) => ({
        ...mapTest(row),
        advancedConfig: normalizeTestAdvancedConfig(resolveAdvancedConfigForTest(advancedMap, row.id)),
      }));
    return res.json({ items });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to list tests' });
  }
});

/**
 * Phase 2: resolve test by title/slug/id even when not in public catalog (auth required).
 * GET /v1/tests/resolve?title=HP%20GK
 * GET /v1/tests/resolve?testId=<uuid>
 */
router.get('/resolve', requireAuth, async (req, res) => {
  const testId = String(req.query.testId || '').trim();
  const title = String(req.query.title || '').trim();
  const slug = String(req.query.slug || '').trim();

  try {
    const lookup = await lookupTestForResolve(pool, { testId, title, slug });
    if (lookup.error) {
      return res.status(400).json({ error: lookup.error });
    }
    if (lookup.ambiguous) {
      return res.status(409).json({ error: 'Multiple tests match this name — use testId' });
    }
    if (!lookup.row) {
      return res.json(buildTestResolvePayload({ row: null }));
    }

    const row = lookup.row;
    const nowMs = Date.now();
    const [advancedMap, publishScheduleItems, applicationRes, scheduleTimerEnabled] =
      await Promise.all([
        loadAdvancedConfigMap(),
        loadPublishScheduleItemsSafe(pool),
        pool.query(
          `SELECT applied_at
           FROM test_applications
           WHERE user_id = $1::uuid AND test_id = $2::uuid
           LIMIT 1`,
          [req.userId, row.id],
        ).catch((e) => {
          if (e && e.code === '42P01') return { rows: [] };
          throw e;
        }),
        loadScheduleTimerEnabled(pool),
      ]);

    const advancedConfig = normalizeTestAdvancedConfig(
      resolveAdvancedConfigForTest(advancedMap, row.id),
    );
    const appliedAt = applicationRes.rows[0]?.applied_at
      ? new Date(applicationRes.rows[0].applied_at).toISOString()
      : null;
    const fromOlderCycle = isApplicationFromOlderCycle(row, appliedAt);
    const alreadyAppliedInCurrentCycle = Boolean(appliedAt) && !fromOlderCycle;
    const mayReapplyForNewCycle = Boolean(appliedAt) && fromOlderCycle;

    const payload = buildTestResolvePayload({
      row,
      advancedConfig,
      publishScheduleItems,
      alreadyAppliedInCurrentCycle,
      mayReapplyForNewCycle,
      scheduleTimerEnabled,
      examDate: resolveExamDate(row),
      slotLabel: String(row.slot_label || ''),
      attemptAccess: alreadyAppliedInCurrentCycle
        ? await assertUserCanStartAttempt(pool, req.userId, row, advancedConfig, nowMs)
        : null,
    });

    return res.json(payload);
  } catch (e) {
    console.error('tests_resolve_error', e);
    return res.status(500).json({ error: 'Failed to resolve test' });
  }
});

router.get('/my-applications', requireAuth, async (req, res) => {
  try {
    const nowMs = Date.now();
    const [rowsRes, scheduleTimerEnabled, advancedMap, publishScheduleItems] = await Promise.all([
      pool.query(
        `SELECT t.id, t.title, t.is_published, ta.applied_at,
                t.exam_date, t.dynamic_date_enabled, t.date_cycle_days, t.last_cycle_started_at,
                t.capacity_total, t.enrolled_count, t.slot_label, t.duration_minutes,
                t.valid_until, t.attempts_allowed
         FROM test_applications ta
         INNER JOIN tests t ON t.id = ta.test_id
         WHERE ta.user_id = $1::uuid
         ORDER BY ta.applied_at DESC`,
        [req.userId],
      ),
      loadScheduleTimerEnabled(pool),
      loadAdvancedConfigMap(),
      loadPublishScheduleItemsSafe(pool),
    ]);

    const items = [];
    for (const row of rowsRes.rows) {
      if (isApplicationFromOlderCycle(row, row.applied_at)) continue;

      const advancedConfig = normalizeTestAdvancedConfig(
        resolveAdvancedConfigForTest(advancedMap, row.id),
      );
      const examDate = resolveExamDate(row);
      const cyclePhase = resolveTestCyclePhase(row, advancedConfig, nowMs, publishScheduleItems);
      const catalogError = catalogVisibilityError(row, advancedConfig, nowMs);
      const cycleStartedAtMs = Date.parse(String(row.last_cycle_started_at || ''));
      const [attemptCount, lastAttemptAtMs] = await Promise.all([
        countUserTestAttempts(
          pool,
          req.userId,
          row.id,
          Number.isFinite(cycleStartedAtMs) ? cycleStartedAtMs : null,
        ),
        lastUserTestAttemptAt(
          pool,
          req.userId,
          row.id,
          Number.isFinite(cycleStartedAtMs) ? cycleStartedAtMs : null,
        ),
      ]);
      const attemptAccess = evaluateAttemptAccess({
        attemptsAllowed: row.attempts_allowed,
        reattemptCooldownMinutes: advancedConfig.reattemptCooldownMinutes,
        attemptCount,
        lastAttemptAtMs,
        nowMs,
      });
      const startAccess = evaluateTestStartAccess({
        alreadyAppliedInCurrentCycle: true,
        scheduleTimerEnabled,
        cyclePhase,
        catalogError,
        examDate,
        slotLabel: String(row.slot_label || ''),
        lateJoinMinutes: advancedConfig.lateJoinMinutes,
        attemptAccess,
        nowMs,
        row,
        advancedConfig,
      });

      const capacityTotal = Math.max(0, Number(row.capacity_total || 0));
      const enrolledCount = Math.max(0, Number(row.enrolled_count || 0));
      items.push({
        testId: String(row.id),
        testTitle: String(row.title || 'Test'),
        appliedAt: row.applied_at ? new Date(row.applied_at).toISOString() : null,
        isPublished: row.is_published === true,
        enrolledCount,
        capacityTotal,
        remainingSeats: Math.max(0, capacityTotal - enrolledCount),
        slotLabel: String(row.slot_label || ''),
        examDate,
        canStart: startAccess.canStart,
        startBlockReason: startAccess.startBlockReason,
        joinClosesAt: startAccess.joinClosesAt,
      });
    }
    return res.json({ items });
  } catch (e) {
    if (e.code === '42P01') {
      return res.json({ items: [] });
    }
    console.error(e);
    return res.status(500).json({ error: 'Failed to load your test applications' });
  }
});

/** Public catalog: DB question order only — never apply per-user shuffle (SHUFFLE_AND_ATTEMPT_RULES.txt §3C). */
router.get('/:id/questions', async (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!id) return res.status(400).json({ error: 'test id required' });
  try {
    const testRes = await pool.query(
      `SELECT id
       FROM tests
       WHERE id = $1::uuid AND is_published = true
       LIMIT 1`,
      [id],
    );
    if (!testRes.rows[0]) return res.status(404).json({ error: 'Test not found' });
    const { rows } = await pool.query(
      `SELECT id, position, stem, choice_a, choice_b, choice_c, choice_d, correct_index, explanation,
              COALESCE(subject_key, '') AS subject_key
       FROM questions
       WHERE test_id = $1::uuid AND is_published = true
       ORDER BY position ASC, id ASC`,
      [id],
    );
    const items = rows.map((row) => mapDbRowToDeliveryItem(row));
    return res.json({ items });
  } catch (e) {
    if (e.code === '22P02') {
      return res.status(400).json({ error: 'Invalid test id' });
    }
    console.error(e);
    return res.status(500).json({ error: 'Failed to list questions' });
  }
});

/** Authenticated attempt delivery: applies shuffleQuestions/shuffleOptions via applyPerUserShuffleToQuestions. */
router.get('/:id/questions-attempt', requireAuth, async (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!id) return res.status(400).json({ error: 'test id required' });
  try {
    const [testRes, advancedMap] = await Promise.all([
      pool.query(
        `SELECT id, is_published, exam_date, valid_until, slot_label, attempts_allowed, total_marks,
                negative_marking_text, question_count, dynamic_date_enabled, date_cycle_days, last_cycle_started_at
         FROM tests
         WHERE id = $1::uuid
         LIMIT 1`,
        [id],
      ),
      loadAdvancedConfigMap(),
    ]);
    const test = testRes.rows[0];
    if (!test || test.is_published !== true) {
      return res.status(404).json({ error: 'Test not found' });
    }
    const advancedConfig = normalizeTestAdvancedConfig(resolveAdvancedConfigForTest(advancedMap, id));
    const visibilityError = catalogVisibilityError(test, advancedConfig);
    if (visibilityError) {
      return res.status(403).json({ error: visibilityError });
    }
    const attemptAccess = await assertUserCanStartAttempt(pool, req.userId, test, advancedConfig);
    if (!attemptAccess.allowed) {
      return res.status(403).json({
        error: attemptAccess.error || 'Attempt not allowed',
        attemptsUsed: attemptAccess.attemptsUsed,
        attemptsAllowed: attemptAccess.attemptsAllowed,
        retryAt: attemptAccess.retryAt || null,
      });
    }
    const resolvedExamDate = resolveExamDate(test);
    if (!isExamJoinAllowed(resolvedExamDate, test.slot_label, advancedConfig.lateJoinMinutes)) {
      if (isBeforeExamStart(resolvedExamDate, test.slot_label)) {
        return res.status(403).json({
          error: 'Test has not started yet',
          examDate: resolvedExamDate,
          slotLabel: String(test.slot_label || ''),
        });
      }
      return res.status(403).json({
        error: 'Late join window has closed for this test',
        examDate: resolvedExamDate,
        slotLabel: String(test.slot_label || ''),
        lateJoinMinutes: Math.max(0, Number(advancedConfig.lateJoinMinutes || 0)),
      });
    }
    const rowsRes = await pool.query(
      `SELECT id, position, stem, choice_a, choice_b, choice_c, choice_d, correct_index, explanation,
              COALESCE(subject_key, '') AS subject_key
       FROM questions
       WHERE test_id = $1::uuid AND is_published = true
       ORDER BY position ASC, id ASC`,
      [id],
    );
    const cycleKey = String(test.last_cycle_started_at || '').trim() || 'no_cycle';
    // Seed ties shuffle to user + catalog + cycle — NOT to attempt number (see SHUFFLE_AND_ATTEMPT_RULES.txt §4–5).
    const seedText = `${req.userId}:${id}:${cycleKey}`;
    const useWithinSubject =
      advancedConfig.shuffleQuestions === true && (advancedConfig.subjectSections || []).length > 0;
    const shuffleQuestions = advancedConfig.shuffleQuestions === true;
    const shuffleOptions = advancedConfig.shuffleOptions === true;
    const items = applyPerUserShuffleToQuestions(rowsRes.rows || [], seedText, {
      shuffleQuestions,
      shuffleOptions,
      subjectSections: useWithinSubject ? advancedConfig.subjectSections : [],
    });
    const invariant = verifyAllMcqDeliveryItems(items);
    if (!invariant.ok) {
      console.error('questions_attempt_invariant_failed', {
        testId: id,
        userId: req.userId,
        cycleKey,
        failures: invariant.failures,
      });
    }
    return res.json({
      items,
      cycleKey,
      shuffleQuestions,
      shuffleOptions,
    });
  } catch (e) {
    if (e.code === '22P02') {
      return res.status(400).json({ error: 'Invalid test id' });
    }
    console.error(e);
    return res.status(500).json({ error: 'Failed to load attempt questions' });
  }
});

router.post('/:id/apply', requireAuth, async (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!id) return res.status(400).json({ error: 'test id required' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const testRes = await client.query(
      `SELECT id, title, is_published, capacity_total, enrolled_count, exam_date, valid_until,
              slot_label, dynamic_date_enabled, date_cycle_days, last_cycle_started_at
       FROM tests
       WHERE id = $1::uuid
       LIMIT 1
       FOR UPDATE`,
      [id],
    );
    const test = testRes.rows[0];
    if (!test) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Test not found' });
    }
    const advancedMap = await loadAdvancedConfigMap();
    const advancedConfig = normalizeTestAdvancedConfig(resolveAdvancedConfigForTest(advancedMap, test.id));
    const visibilityError = catalogVisibilityError(test, advancedConfig);
    if (visibilityError) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: visibilityError });
    }
    const alreadyRes = await client.query(
      `SELECT applied_at
       FROM test_applications
       WHERE user_id = $1::uuid AND test_id = $2::uuid
       LIMIT 1`,
      [req.userId, id],
    );
    const capacity = Math.max(0, Number(test.capacity_total || 0));
    const currentEnrolled = Math.max(0, Number(test.enrolled_count || 0));
    const existing = alreadyRes.rows[0];
    if (existing && !isApplicationFromOlderCycle(test, existing.applied_at)) {
      await client.query(
        `UPDATE test_waitlist
         SET status = 'cancelled'
         WHERE user_id = $1::uuid AND test_id = $2::uuid AND status = 'waiting'`,
        [req.userId, id],
      );
      await client.query('COMMIT');
      const remaining = capacity > 0 ? Math.max(0, capacity - currentEnrolled) : 0;
      return res.json({
        ok: true,
        alreadyApplied: true,
        message: 'You already applied for this test',
        testId: String(test.id),
        testTitle: String(test.title || 'Test'),
        enrolledCount: currentEnrolled,
        capacityTotal: capacity,
        remainingSeats: remaining,
      });
    }
    if (existing) {
      await client.query(
        `UPDATE test_waitlist
         SET status = 'cancelled'
         WHERE user_id = $1::uuid AND test_id = $2::uuid AND status = 'waiting'`,
        [req.userId, id],
      );
      await client.query(
        `UPDATE test_applications
         SET applied_at = now()
         WHERE user_id = $1::uuid AND test_id = $2::uuid`,
        [req.userId, id],
      );
      await client.query('COMMIT');
      const remaining = capacity > 0 ? Math.max(0, capacity - currentEnrolled) : 0;
      return res.status(201).json({
        ok: true,
        alreadyApplied: false,
        message: 'Re-enrolled for new test cycle',
        testId: String(test.id),
        testTitle: String(test.title || 'Test'),
        enrolledCount: currentEnrolled,
        capacityTotal: capacity,
        remainingSeats: remaining,
      });
    }
    if (capacity > 0 && currentEnrolled >= capacity) {
      let waitlistId = null;
      const existingWaitRes = await client.query(
        `SELECT id
         FROM test_waitlist
         WHERE user_id = $1::uuid
           AND test_id = $2::uuid
           AND status = 'waiting'
         LIMIT 1`,
        [req.userId, id],
      );
      if (existingWaitRes.rows[0]) {
        waitlistId = Number(existingWaitRes.rows[0].id);
      } else {
        const insWaitRes = await client.query(
          `INSERT INTO test_waitlist (user_id, test_id, status)
           VALUES ($1::uuid, $2::uuid, 'waiting')
           RETURNING id`,
          [req.userId, id],
        );
        waitlistId = Number(insWaitRes.rows?.[0]?.id || 0);
      }
      const waitSnapshot = await readWaitlistPosition(client, id, waitlistId);
      await client.query('COMMIT');
      return res.status(202).json({
        ok: true,
        alreadyApplied: false,
        waitlisted: true,
        message: 'All seats are filled. You are added to waiting list.',
        testId: String(test.id),
        testTitle: String(test.title || 'Test'),
        enrolledCount: currentEnrolled,
        capacityTotal: capacity,
        remainingSeats: 0,
        waitingPosition: waitSnapshot.waitingPosition,
        waitingTotal: waitSnapshot.waitingTotal,
      });
    }
    await client.query(
      `UPDATE test_waitlist
       SET status = 'cancelled'
       WHERE user_id = $1::uuid AND test_id = $2::uuid AND status = 'waiting'`,
      [req.userId, id],
    );
    await client.query(
      `INSERT INTO test_applications (user_id, test_id) VALUES ($1::uuid, $2::uuid)`,
      [req.userId, id],
    );
    const updRes = await client.query(
      `UPDATE tests
       SET enrolled_count = enrolled_count + 1, updated_at = now()
       WHERE id = $1::uuid
       RETURNING id, title, capacity_total, enrolled_count`,
      [id],
    );
    const updated = updRes.rows[0];
    await client.query('COMMIT');
    const updatedCapacity = Math.max(0, Number(updated.capacity_total || 0));
    const updatedEnrolled = Math.max(0, Number(updated.enrolled_count || 0));
    const remaining = updatedCapacity > 0 ? Math.max(0, updatedCapacity - updatedEnrolled) : 0;
    return res.status(201).json({
      ok: true,
      alreadyApplied: false,
      message: 'Application submitted successfully',
      testId: String(updated.id),
      testTitle: String(updated.title || 'Test'),
      enrolledCount: updatedEnrolled,
      capacityTotal: updatedCapacity,
      remainingSeats: remaining,
    });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    if (e.code === '22P02') {
      return res.status(400).json({ error: 'Invalid test id' });
    }
    if (e.code === '42P01') {
      return res.status(500).json({ error: 'Apply feature not initialized. Restart server once.' });
    }
    console.error(e);
    return res.status(500).json({ error: 'Failed to apply for test' });
  } finally {
    client.release();
  }
});

router.get('/:id/waitlist-status', requireAuth, async (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!id) return res.status(400).json({ error: 'test id required' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const testRes = await client.query(
      `SELECT id FROM tests WHERE id = $1::uuid LIMIT 1`,
      [id],
    );
    if (!testRes.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Test not found' });
    }
    const rowRes = await client.query(
      `SELECT id
       FROM test_waitlist
       WHERE user_id = $1::uuid AND test_id = $2::uuid AND status = 'waiting'
       LIMIT 1`,
      [req.userId, id],
    );
    const row = rowRes.rows[0];
    if (!row) {
      await client.query('COMMIT');
      return res.json({ waitlisted: false, waitingPosition: 0, waitingTotal: 0 });
    }
    const waitSnapshot = await readWaitlistPosition(client, id, Number(row.id));
    await client.query('COMMIT');
    return res.json({
      waitlisted: true,
      waitingPosition: waitSnapshot.waitingPosition,
      waitingTotal: waitSnapshot.waitingTotal,
    });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    if (e.code === '22P02') {
      return res.status(400).json({ error: 'Invalid test id' });
    }
    console.error(e);
    return res.status(500).json({ error: 'Failed to fetch waitlist status' });
  } finally {
    client.release();
  }
});

module.exports = router;
