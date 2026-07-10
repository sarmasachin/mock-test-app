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
 * - evaluateApplicationCycleState() gates re-apply / my-applications (§5, Phase 5).
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
const {
  evaluateApplicationCycleState,
  buildApplyResponseBody,
  resolveApplyEligibilityForTest,
  resolveAlreadyAppliedForTarget,
  resolveExamDate,
  resolveAttemptCycleStartedAtMs,
  buildMyTestApplicationItem,
} = require('../lib/testApplicationCycle');
const { resolveApplyWindowState } = require('../lib/testCycleWindow');

const USER_TEST_APPLICATIONS_SQL = `
  SELECT t.id, t.title, t.subcategory, t.is_published, t.capacity_total, t.enrolled_count,
         t.exam_date, t.dynamic_date_enabled, t.date_cycle_days, t.last_cycle_started_at,
         ta.applied_at
  FROM test_applications ta
  INNER JOIN tests t ON t.id = ta.test_id
  WHERE ta.user_id = $1::uuid
`;

const PUBLISHED_QUESTION_COUNT_SQL = `(SELECT COUNT(*)::int FROM questions q WHERE q.test_id = tests.id AND q.is_published = true) AS published_question_count`;

const router = express.Router();

function toIsoDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
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

/** Atomically bump tests.enrolled_count after a successful apply or cycle re-apply. */
async function incrementTestEnrolledCount(client, testId) {
  const updRes = await client.query(
    `UPDATE tests
     SET enrolled_count = enrolled_count + 1, updated_at = now()
     WHERE id = $1::uuid
     RETURNING id, title, capacity_total, enrolled_count`,
    [testId],
  );
  return updRes.rows[0] || null;
}

async function enqueueUserWaitlist(client, userId, testId) {
  let waitlistId = null;
  const existingWaitRes = await client.query(
    `SELECT id
     FROM test_waitlist
     WHERE user_id = $1::uuid
       AND test_id = $2::uuid
       AND status = 'waiting'
     LIMIT 1`,
    [userId, testId],
  );
  if (existingWaitRes.rows[0]) {
    waitlistId = Number(existingWaitRes.rows[0].id);
  } else {
    const insWaitRes = await client.query(
      `INSERT INTO test_waitlist (user_id, test_id, status)
       VALUES ($1::uuid, $2::uuid, 'waiting')
       RETURNING id`,
      [userId, testId],
    );
    waitlistId = Number(insWaitRes.rows?.[0]?.id || 0);
  }
  return readWaitlistPosition(client, testId, waitlistId);
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
    const [advancedMap, publishScheduleItems, userAppsRes, scheduleTimerEnabled] =
      await Promise.all([
        loadAdvancedConfigMap(),
        loadPublishScheduleItemsSafe(pool),
        pool.query(USER_TEST_APPLICATIONS_SQL, [req.userId]).catch((e) => {
          if (e && e.code === '42P01') return { rows: [] };
          throw e;
        }),
        loadScheduleTimerEnabled(pool),
      ]);

    const advancedConfig = normalizeTestAdvancedConfig(
      resolveAdvancedConfigForTest(advancedMap, row.id),
    );
    const applyState = resolveAlreadyAppliedForTarget(row, userAppsRes.rows);
    const attemptRow =
      applyState.appliedTestRow && applyState.alreadyAppliedInCurrentCycle
        ? applyState.appliedTestRow
        : row;
    const attemptAdvancedConfig = normalizeTestAdvancedConfig(
      resolveAdvancedConfigForTest(advancedMap, attemptRow.id),
    );

    const payload = buildTestResolvePayload({
      row,
      advancedConfig,
      publishScheduleItems,
      alreadyAppliedInCurrentCycle: applyState.alreadyAppliedInCurrentCycle,
      mayReapplyForNewCycle: applyState.mayReapplyForNewCycle,
      scheduleTimerEnabled,
      examDate: resolveExamDate(row),
      slotLabel: String(row.slot_label || ''),
      attemptAccess: applyState.alreadyAppliedInCurrentCycle
        ? await assertUserCanStartAttempt(
            pool,
            req.userId,
            attemptRow,
            attemptAdvancedConfig,
            nowMs,
          )
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
      const appliedAtIso = row.applied_at ? new Date(row.applied_at).toISOString() : null;
      const cycleState = evaluateApplicationCycleState(row, appliedAtIso, nowMs);
      const advancedConfig = normalizeTestAdvancedConfig(
        resolveAdvancedConfigForTest(advancedMap, row.id),
      );
      const examDate = resolveExamDate(row);
      const cyclePhase = resolveTestCyclePhase(row, advancedConfig, nowMs, publishScheduleItems);
      const catalogError = catalogVisibilityError(row, advancedConfig, nowMs);
      const capacityTotal = Math.max(0, Number(row.capacity_total || 0));
      const enrolledCount = Math.max(0, Number(row.enrolled_count || 0));

      if (cycleState.mayReapplyForNewCycle) {
        const applyWindow = resolveApplyWindowState(row, nowMs);
        const canReapply =
          cyclePhase === 'live' && !catalogError && applyWindow.open;
        items.push(
          buildMyTestApplicationItem({
            row,
            appliedAtIso,
            cycleState,
            cyclePhase,
            examDate,
            enrolledCount,
            capacityTotal,
            mayReapplyForNewCycle: canReapply,
            applyBlockReason: canReapply
              ? null
              : catalogError || applyWindow.reason || 'Test is not open for applications right now',
          }),
        );
        continue;
      }

      if (!cycleState.alreadyAppliedInCurrentCycle) continue;

      const cycleStartedAtMs = resolveAttemptCycleStartedAtMs(row, nowMs);
      const [attemptCount, lastAttemptAtMs] = await Promise.all([
        countUserTestAttempts(
          pool,
          req.userId,
          row.id,
          cycleStartedAtMs,
        ),
        lastUserTestAttemptAt(
          pool,
          req.userId,
          row.id,
          cycleStartedAtMs,
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

      items.push(
        buildMyTestApplicationItem({
          row,
          appliedAtIso,
          cycleState,
          cyclePhase,
          examDate,
          startAccess,
          enrolledCount,
          capacityTotal,
        }),
      );
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
      `SELECT id, title, subcategory, is_published, capacity_total, enrolled_count, exam_date, valid_until,
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
    const userAppsRes = await client.query(USER_TEST_APPLICATIONS_SQL, [req.userId]);
    const capacity = Math.max(0, Number(test.capacity_total || 0));
    const currentEnrolled = Math.max(0, Number(test.enrolled_count || 0));
    const eligibility = resolveApplyEligibilityForTest(test, userAppsRes.rows);

    if (
      eligibility.kind === 'already_applied_same_test' ||
      eligibility.kind === 'already_applied_sibling_subcategory'
    ) {
      await client.query(
        `UPDATE test_waitlist
         SET status = 'cancelled'
         WHERE user_id = $1::uuid AND test_id = $2::uuid AND status = 'waiting'`,
        [req.userId, id],
      );
      await client.query('COMMIT');
      const responseTest = eligibility.testRow || test;
      const responseEnrolled = Math.max(0, Number(responseTest.enrolled_count ?? currentEnrolled));
      const responseCapacity = Math.max(0, Number(responseTest.capacity_total ?? capacity));
      return res.json(
        buildApplyResponseBody({
          test: responseTest,
          enrolledCount: responseEnrolled,
          capacityTotal: responseCapacity,
          alreadyApplied: true,
          alreadyAppliedInCurrentCycle: true,
          message:
            eligibility.kind === 'already_applied_sibling_subcategory'
              ? 'You already applied for a test in this category'
              : 'You already applied for this test',
        }),
      );
    }

    const applyWindow = resolveApplyWindowState(test);
    if (!applyWindow.open) {
      await client.query('ROLLBACK');
      return res.status(403).json({
        error: applyWindow.reason || 'Registration is not open for this test',
      });
    }

    if (eligibility.kind === 'may_reapply_same_test') {
      await client.query(
        `UPDATE test_waitlist
         SET status = 'cancelled'
         WHERE user_id = $1::uuid AND test_id = $2::uuid AND status = 'waiting'`,
        [req.userId, id],
      );
      if (capacity > 0 && currentEnrolled >= capacity) {
        const waitSnapshot = await enqueueUserWaitlist(client, req.userId, id);
        await client.query('COMMIT');
        return res.status(202).json(
          buildApplyResponseBody({
            test,
            enrolledCount: currentEnrolled,
            capacityTotal: capacity,
            waitlisted: true,
            message: 'All seats are filled. You are added to waiting list.',
            waitingPosition: waitSnapshot.waitingPosition,
            waitingTotal: waitSnapshot.waitingTotal,
          }),
        );
      }
      await client.query(
        `UPDATE test_applications
         SET applied_at = now()
         WHERE user_id = $1::uuid AND test_id = $2::uuid`,
        [req.userId, id],
      );
      const updated = await incrementTestEnrolledCount(client, id);
      await client.query('COMMIT');
      return res.status(201).json(
        buildApplyResponseBody({
          test: updated || test,
          enrolledCount: updated?.enrolled_count ?? currentEnrolled + 1,
          capacityTotal: updated?.capacity_total ?? capacity,
          alreadyAppliedInCurrentCycle: true,
          reenrolledForNewCycle: true,
          message: 'Re-enrolled for new test cycle',
        }),
      );
    }

    if (capacity > 0 && currentEnrolled >= capacity) {
      const waitSnapshot = await enqueueUserWaitlist(client, req.userId, id);
      await client.query('COMMIT');
      return res.status(202).json(
        buildApplyResponseBody({
          test,
          enrolledCount: currentEnrolled,
          capacityTotal: capacity,
          waitlisted: true,
          message: 'All seats are filled. You are added to waiting list.',
          waitingPosition: waitSnapshot.waitingPosition,
          waitingTotal: waitSnapshot.waitingTotal,
        }),
      );
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
    const updated = await incrementTestEnrolledCount(client, id);
    await client.query('COMMIT');
    return res.status(201).json(
      buildApplyResponseBody({
        test: updated || test,
        enrolledCount: updated?.enrolled_count,
        capacityTotal: updated?.capacity_total ?? capacity,
        alreadyAppliedInCurrentCycle: true,
        message: 'Application submitted successfully',
      }),
    );
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
