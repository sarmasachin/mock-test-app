'use strict';

const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '..', '.env');
// Load server/.env by path (PM2 cwd can differ).
require('dotenv').config({ path: envPath });
// PM2 keeps a snapshot of env at first start; dotenv does not override existing keys.
// Always prefer server/.env for FCM so credential updates apply after restart.
if (fs.existsSync(envPath)) {
  const fromFile = require('dotenv').parse(fs.readFileSync(envPath, 'utf8'));
  if (fromFile.FCM_PROJECT_ID) process.env.FCM_PROJECT_ID = fromFile.FCM_PROJECT_ID;
  if (fromFile.FCM_SERVICE_ACCOUNT_JSON) {
    process.env.FCM_SERVICE_ACCOUNT_JSON = fromFile.FCM_SERVICE_ACCOUNT_JSON;
  }
}

const express = require('express');
const cors = require('cors');
const { requireAuth } = require('./middleware/requireAuth');
const { requireAdmin } = require('./middleware/requireAdmin');
const authRouter = require('./routes/auth');
const meRouter = require('./routes/me');
const attemptsRouter = require('./routes/attempts');
const newsRouter = require('./routes/news');
const digestRouter = require('./routes/digest');
const dailyQuizRouter = require('./routes/dailyQuiz');
const testsCatalogRouter = require('./routes/tests');
const leaderboardRouter = require('./routes/leaderboard');
const homeRouter = require('./routes/home');
const adminRouter = require('./routes/admin');
const emailPreferencesRouter = require('./routes/emailPreferences');
const { PROTECTED_SUPER_ADMIN_EMAIL_LIST } = require('./constants/protectedSuperAdminEmails');
const pollsRouter = require('./routes/polls');
const { pool } = require('./db');
const { clampMcqCorrectIndex, verifyDbRowMcqInvariant } = require('./mcqShuffle');
const { selectQuestionsFromSubcategoryPool } = require('./lib/subcategoryPoolSelection');
const {
  getPublishSchedulingItems,
  savePublishSchedulingItems,
  isPublishScheduleItemPending,
  recoverStalePublishScheduleItems,
  withPublishSchedulingLock,
  markPublishScheduleNotifySent,
  resolveNotifyOnCycleRepublish,
} = require('./lib/testVisibility');
const { cycleRepublishAtMs } = require('./lib/cycleRepublishGap');
const {
  shouldRunSchedulerRollover,
  resolveSchedulerCycleEndMs,
  resolveAdminCycleStartUpdate,
} = require('./lib/testCycleWindow');
const { countOverduePublishSchedules } = require('./lib/adminTestCycleStatus');
const { promoteWaitlistForTest } = require('./lib/testRepublishNow');
const { buildPublishSchedulingDiagnostics } = require('./lib/publishScheduleDiagnostics');
const {
  buildTestPublishDedupeKey,
  prependNotificationIfNotDuplicate,
  resolveNotificationDeliveryOutcome,
} = require('./lib/notificationScheduling');
const {
  triggerTestPublishAnnouncementEmail,
  mergePublishEmailDedupeKey,
} = require('./lib/publishAnnouncementEmail');
const { trimNotificationSchedulingPayload } = require('./lib/schedulingQueueLimits');
const { sendPushToToken } = require('./notificationDispatch');
const {
  isMailConfigured,
  sendCompleteProfileReminderEmail,
  sendResultUnlockedEmail,
  sendMockTestStartingSoonEmail,
  sendMissedTestFollowupEmail,
  sendStreakRiskAlertEmail,
  sendWeeklyPerformanceReportEmail,
  sendRankMilestoneEmail,
  sendBirthdayEmail,
  sendNewContentByInterestEmail,
  sendReEngagementEmail,
} = require('./mail');

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
  console.error('FATAL: set JWT_SECRET (min 16 chars) in .env');
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error('FATAL: set DATABASE_URL in .env');
  process.exit(1);
}

const app = express();
// Ensure req.protocol reflects HTTPS when behind a reverse proxy (x-forwarded-proto).
// This is important for generating correct public asset URLs (e.g. /uploads/*) consumed by Android,
// where cleartext http:// images are blocked in release builds.
app.set('trust proxy', 1);

/** When CORS_ALLOWED_ORIGINS is set (comma-separated), only those browser origins may call the API. */
function buildCorsMiddleware() {
  const raw = process.env.CORS_ALLOWED_ORIGINS;
  if (!raw || !String(raw).trim()) {
    return cors();
  }
  const allowList = String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!allowList.length) return cors();
  return cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (allowList.includes(origin)) return callback(null, true);
      return callback(new Error(`CORS blocked origin: ${origin}`));
    },
  });
}

app.use(buildCorsMiddleware());
app.use(express.json({ limit: '8mb' }));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));
app.use(async (req, res, next) => {
  const path = String(req.path || '');
  if (
    path === '/health' ||
    path.startsWith('/v1/email/') ||
    path.startsWith('/v1/admin') ||
    path.startsWith('/v1/auth/')
  ) {
    return next();
  }
  try {
    const { rows } = await pool.query(
      `SELECT setting_key, setting_value FROM app_settings WHERE setting_key IN ('maintenanceMode', 'maintenanceMessage')`,
    );
    const map = {};
    for (const row of rows) map[row.setting_key] = row.setting_value;
    const maintenanceMode = String(map.maintenanceMode || 'false').toLowerCase() === 'true';
    if (!maintenanceMode) return next();
    return res.status(503).json({
      error: String(map.maintenanceMessage || 'Service is temporarily under maintenance'),
      maintenanceMode: true,
    });
  } catch (e) {
    if (e.code === '42P01') return next();
    console.error(e);
    return res.status(500).json({ error: 'Service state check failed' });
  }
});

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/v1/email', emailPreferencesRouter);

app.use('/v1/auth', authRouter);
app.use('/v1/me', requireAuth, meRouter);
app.use('/v1/attempts', requireAuth, attemptsRouter);
app.use('/v1/news', newsRouter);
app.use('/v1/digest', digestRouter);
app.use('/v1/daily-quiz', requireAuth, dailyQuizRouter);
app.use('/v1/tests', testsCatalogRouter);
app.use('/v1/leaderboard', leaderboardRouter);
app.use('/v1/home', homeRouter);
app.use('/v1/polls', requireAuth, pollsRouter);
app.use('/v1/admin', requireAuth, requireAdmin, adminRouter);

async function ensureOptionalColumns() {
  try {
    await pool.query(
      `ALTER TABLE tests
       ADD COLUMN IF NOT EXISTS dynamic_fluctuation_on_publish BOOLEAN NOT NULL DEFAULT true`,
    );
    await pool.query(
      `ALTER TABLE tests
       ADD COLUMN IF NOT EXISTS answer_key_release_at TIMESTAMPTZ`,
    );
    await pool.query(
      `ALTER TABLE tests
       ADD COLUMN IF NOT EXISTS result_release_at TIMESTAMPTZ`,
    );
    await pool.query(
      `ALTER TABLE tests
       ADD COLUMN IF NOT EXISTS capacity_total INTEGER NOT NULL DEFAULT 0`,
    );
    await pool.query(
      `ALTER TABLE tests
       ADD COLUMN IF NOT EXISTS enrolled_count INTEGER NOT NULL DEFAULT 0`,
    );
    await pool.query(
      `ALTER TABLE tests
       ADD COLUMN IF NOT EXISTS badge_enabled BOOLEAN NOT NULL DEFAULT false`,
    );
    await pool.query(
      `ALTER TABLE tests
       ADD COLUMN IF NOT EXISTS badge_text VARCHAR(40) NOT NULL DEFAULT 'Live'`,
    );
    await pool.query(
      `ALTER TABLE tests
       ADD COLUMN IF NOT EXISTS last_cycle_started_at TIMESTAMPTZ`,
    );
    await pool.query(
      `UPDATE tests
       SET last_cycle_started_at = now()
       WHERE is_published = true AND last_cycle_started_at IS NULL`,
    );
    await pool.query(
      `CREATE TABLE IF NOT EXISTS test_applications (
         user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
         test_id UUID NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
         applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
         PRIMARY KEY (user_id, test_id)
       )`,
    );
    await pool.query(
      `CREATE TABLE IF NOT EXISTS user_test_interests (
         user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
         subcategory VARCHAR(120) NOT NULL,
         created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
         PRIMARY KEY (user_id, subcategory)
       )`,
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_user_test_interests_user
       ON user_test_interests (user_id)`,
    );
    await pool.query(
      `ALTER TABLE test_attempts
       ADD COLUMN IF NOT EXISTS client_submission_id VARCHAR(120)`,
    );
    await pool.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_test_attempts_submission_unique
       ON test_attempts (user_id, test_catalog_id, client_submission_id)
       WHERE test_catalog_id IS NOT NULL AND client_submission_id IS NOT NULL`,
    );
    await pool.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_test_attempts_submission_unique_all
       ON test_attempts (user_id, test_catalog_id, client_submission_id)`,
    );
    await pool.query(
      `CREATE TABLE IF NOT EXISTS test_waitlist (
         id BIGSERIAL PRIMARY KEY,
         user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
         test_id UUID NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
         status TEXT NOT NULL DEFAULT 'waiting',
         created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
         promoted_at TIMESTAMPTZ NULL,
         CONSTRAINT test_waitlist_status_check CHECK (status IN ('waiting', 'promoted', 'cancelled'))
       )`,
    );
    await pool.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_test_waitlist_unique_waiting
       ON test_waitlist (user_id, test_id)
       WHERE status = 'waiting'`,
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_test_waitlist_test_status_created
       ON test_waitlist (test_id, status, created_at)`,
    );
    await pool.query(
      `ALTER TABLE questions
       ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT true`,
    );
    await pool.query(
      `ALTER TABLE questions
       ADD COLUMN IF NOT EXISTS subject_key VARCHAR(64) NOT NULL DEFAULT ''`,
    );
    await pool.query(
      `ALTER TABLE questions
       ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now()`,
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_questions_created_at ON questions (created_at DESC)`,
    );
    await pool.query(
      `ALTER TABLE users
       ADD COLUMN IF NOT EXISTS date_of_birth DATE`,
    );
    await pool.query(
      `ALTER TABLE users
       ADD COLUMN IF NOT EXISTS gender VARCHAR(20) NOT NULL DEFAULT ''`,
    );
    await pool.query(
      `ALTER TABLE users
       ADD COLUMN IF NOT EXISTS marketing_emails_unsubscribed_at TIMESTAMPTZ`,
    );
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub VARCHAR(255)`);
    await pool.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_users_google_sub_nonempty
       ON users (google_sub)
       WHERE google_sub IS NOT NULL AND trim(google_sub) <> ''`,
    );
    await pool.query(
      `ALTER TABLE news_articles
       ADD COLUMN IF NOT EXISTS feature_image_url TEXT`,
    );
    await pool.query(
      `ALTER TABLE news_articles
       DROP CONSTRAINT IF EXISTS news_articles_feed_kind_check`,
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_news_articles_kind_updated
       ON news_articles (feed_kind, updated_at DESC)
       WHERE is_published = true`,
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_news_articles_published_updated
       ON news_articles (is_published, updated_at DESC)
       WHERE is_published = true`,
    );
    await pool.query(`DROP INDEX IF EXISTS idx_news_articles_kind_published`);
    await pool.query(
      `CREATE TABLE IF NOT EXISTS user_login_devices (
         user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
         fingerprint VARCHAR(128) NOT NULL,
         first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
         last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
         PRIMARY KEY (user_id, fingerprint)
       )`,
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_user_login_devices_user ON user_login_devices (user_id)`,
    );
    await pool.query(`ALTER TABLE user_one_time_tokens DROP CONSTRAINT IF EXISTS user_one_time_tokens_purpose_check`);
    await pool.query(`
      ALTER TABLE user_one_time_tokens
      ADD CONSTRAINT user_one_time_tokens_purpose_check
      CHECK (
        purpose IN (
          'email_verify',
          'password_reset',
          'phone_verify',
          'admin_password_reset',
          'admin_login'
        )
      )
    `);
    await pool.query(
      `CREATE TABLE IF NOT EXISTS daily_quiz_attempts (
         id BIGSERIAL PRIMARY KEY,
         user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
         quiz_day DATE NOT NULL,
         item_id VARCHAR(80) NOT NULL,
         selected_option_index SMALLINT CHECK (
           selected_option_index IS NULL
           OR (selected_option_index >= 0 AND selected_option_index <= 3)
         ),
         correct_index SMALLINT NOT NULL CHECK (correct_index >= 0 AND correct_index <= 3),
         is_correct BOOLEAN NOT NULL DEFAULT false,
         time_taken_seconds INTEGER NOT NULL DEFAULT 0 CHECK (
           time_taken_seconds >= 0 AND time_taken_seconds <= 86400
         ),
         question_prompt TEXT NOT NULL DEFAULT '',
         options_json JSONB NOT NULL DEFAULT '[]'::jsonb,
         explanation TEXT NOT NULL DEFAULT '',
         client_submission_id VARCHAR(120),
         submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
         updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
         CONSTRAINT daily_quiz_attempts_user_day_item_unique UNIQUE (user_id, quiz_day, item_id)
       )`,
    );
    await pool.query(
      `ALTER TABLE daily_quiz_attempts
       DROP CONSTRAINT IF EXISTS daily_quiz_attempts_user_day_unique`,
    );
    await pool.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_quiz_attempts_user_day_item
       ON daily_quiz_attempts (user_id, quiz_day, item_id)`,
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_daily_quiz_attempts_user_submitted
       ON daily_quiz_attempts (user_id, submitted_at DESC)`,
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_daily_quiz_attempts_quiz_day
       ON daily_quiz_attempts (quiz_day, is_correct, time_taken_seconds)`,
    );
    await pool.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_quiz_attempts_client_submission
       ON daily_quiz_attempts (user_id, client_submission_id)
       WHERE client_submission_id IS NOT NULL AND trim(client_submission_id) <> ''`,
    );
    /** Locked super-admin roster — sourced from `./constants/protectedSuperAdminEmails.js`. */
    for (const em of PROTECTED_SUPER_ADMIN_EMAIL_LIST) {
      await pool.query(
        `UPDATE users
         SET is_admin = true,
             is_super_admin = true,
             updated_at = now()
         WHERE lower(trim(email::text)) = lower(trim($1::text))`,
        [em],
      );
    }
    const { ensureAdminPermissionsSchema, backfillLegacyAdminPermissions } = require('./lib/adminPermissions');
    await ensureAdminPermissionsSchema();
    const backfill = await backfillLegacyAdminPermissions();
    if (backfill.backfilledUsers > 0) {
      console.log('admin_permissions_backfill', backfill);
    }
  } catch (e) {
    if (e && e.code === '42P01') return;
    console.error('optional_columns_init_error', e);
  }
}

function shuffleArray(arr) {
  const list = [...arr];
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = list[i];
    list[i] = list[j];
    list[j] = tmp;
  }
  return list;
}

function shuffleQuestionOptions(row) {
  const sourceOld = clampMcqCorrectIndex(row.correct_index);
  const options = [
    { text: row.choice_a, oldIndex: 0 },
    { text: row.choice_b, oldIndex: 1 },
    { text: row.choice_c, oldIndex: 2 },
    { text: row.choice_d, oldIndex: 3 },
  ];
  const shuffled = shuffleArray(options);
  const newCorrectIndex = shuffled.findIndex((x) => x.oldIndex === sourceOld);
  if (newCorrectIndex < 0) {
    const fallback = {
      stem: row.stem,
      choice_a: row.choice_a,
      choice_b: row.choice_b,
      choice_c: row.choice_c,
      choice_d: row.choice_d,
      correct_index: sourceOld,
      explanation: row.explanation || '',
    };
    const invariant = verifyDbRowMcqInvariant(fallback);
    if (!invariant.ok) {
      console.error('shuffleQuestionOptions_invariant_failed', invariant);
    }
    return fallback;
  }
  const out = {
    stem: row.stem,
    choice_a: shuffled[0]?.text || '',
    choice_b: shuffled[1]?.text || '',
    choice_c: shuffled[2]?.text || '',
    choice_d: shuffled[3]?.text || '',
    correct_index: newCorrectIndex,
    explanation: row.explanation || '',
  };
  const invariant = verifyDbRowMcqInvariant(out);
  if (!invariant.ok) {
    console.error('shuffleQuestionOptions_invariant_failed', invariant);
  }
  return out;
}

async function regenerateTestFromSubcategoryPool(testId) {
  const baseRes = await pool.query(
    `SELECT id, subcategory, question_count, dynamic_fluctuation_on_publish
     FROM tests
     WHERE id = $1::uuid
     LIMIT 1`,
    [testId],
  );
  const base = baseRes.rows[0];
  if (!base || base.dynamic_fluctuation_on_publish === false) return;
  if (!String(base.subcategory || '').trim()) return;
  const needed = Math.max(1, Number(base.question_count || 0));
  const poolRes = await pool.query(
    `SELECT q.id, q.stem, q.choice_a, q.choice_b, q.choice_c, q.choice_d, q.correct_index, q.explanation, q.created_at,
            COALESCE(q.subject_key, '') AS subject_key
     FROM questions q
     INNER JOIN tests t ON t.id = q.test_id
     WHERE t.subcategory = $1
     ORDER BY q.id DESC`,
    [String(base.subcategory)],
  );
  const poolRows = poolRes.rows || [];
  if (!poolRows.length) return;
  const selected = selectQuestionsFromSubcategoryPool(poolRows, needed, {
    newRatio: 0.8,
    newWindowDays: 7,
  });
  if (!selected.length) return;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM questions WHERE test_id = $1::uuid`, [testId]);
    let position = 1;
    for (const row of selected) {
      const randomized = shuffleQuestionOptions(row);
      const subjectKey = String(row.subject_key || '')
        .trim()
        .slice(0, 64);
      await client.query(
        `INSERT INTO questions (
           test_id, position, stem, choice_a, choice_b, choice_c, choice_d, correct_index, explanation, is_published, subject_key
         ) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          testId,
          position,
          randomized.stem,
          randomized.choice_a,
          randomized.choice_b,
          randomized.choice_c,
          randomized.choice_d,
          randomized.correct_index,
          randomized.explanation,
          true,
          subjectKey,
        ],
      );
      position += 1;
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

async function runSchedulerBootTick() {
  try {
    const publishItems = await getPublishSchedulingItems(pool);
    const overdueCount = countOverduePublishSchedules(publishItems);
    if (overdueCount > 0) {
      console.warn('publish_schedule_overdue_count', { overdueCount });
    }
  } catch (e) {
    if (e && e.code === '42P01') return;
    console.error('publish_schedule_overdue_boot_check', e);
  }

  setImmediate(() => {
    processPublishSchedules().catch((e) => console.error('publish_scheduler_boot', e));
    processTestCycleAutoReschedule().catch((e) => console.error('cycle_scheduler_boot', e));
  });
}

async function runPublishScheduleItemWork(item) {
  const scheduleItem = item || {};
  let notifySentAt = String(scheduleItem.notifySentAt || '').trim();

  if (scheduleItem.entityType === 'test') {
    const testId = String(scheduleItem.entityId || '').trim();
    const action = String(scheduleItem.action || 'publish').trim().toLowerCase();
    if (action === 'unpublish') {
      await pool.query(
        `UPDATE tests
         SET is_published = false, updated_at = now()
         WHERE id = $1::uuid`,
        [testId],
      );
    } else {
      const existingRes = await pool.query(
        `SELECT is_published, last_cycle_started_at, exam_date, slot_label,
                dynamic_date_enabled, date_cycle_days, duration_minutes
         FROM tests
         WHERE id = $1::uuid
         LIMIT 1`,
        [testId],
      );
      const existing = existingRes.rows[0];
      const scheduleMs = Date.parse(String(scheduleItem.scheduleAt || ''));
      const cycleMs = Date.parse(String(existing?.last_cycle_started_at || ''));
      const alreadyPublishedForSchedule =
        existing?.is_published === true &&
        Number.isFinite(cycleMs) &&
        Number.isFinite(scheduleMs) &&
        cycleMs >= scheduleMs;

      if (!alreadyPublishedForSchedule) {
        await regenerateTestFromSubcategoryPool(testId);
        const justPublished = existing?.is_published !== true;
        const publishedRow = { ...existing, is_published: true };
        const cycleAction = resolveAdminCycleStartUpdate(publishedRow, existing, { justPublished });
        if (cycleAction.setCycleStart) {
          await pool.query(
            `UPDATE tests
             SET is_published = true, last_cycle_started_at = now(), updated_at = now()
             WHERE id = $1::uuid`,
            [testId],
          );
        } else {
          await pool.query(
            `UPDATE tests
             SET is_published = true, updated_at = now()
             WHERE id = $1::uuid`,
            [testId],
          );
        }
        await promoteWaitlistForTest(pool, testId);
      }

      if (!alreadyPublishedForSchedule) {
        const advancedMap = await getSettingJson('testAdvancedConfigs', {});
        const adv = resolveAdvancedConfigForTest(advancedMap, testId);
        if (!notifySentAt && scheduleItem.notifyOnPublish !== false && adv?.notifyOnPublish !== false) {
          const metaRes = await pool.query(
            `SELECT title, last_cycle_started_at
             FROM tests
             WHERE id = $1::uuid
             LIMIT 1`,
            [testId],
          );
          const testTitle = String(metaRes.rows[0]?.title || 'New test').trim() || 'New test';
          const cycleIso = String(metaRes.rows[0]?.last_cycle_started_at || '').trim();
          const dedupeKey = buildTestPublishDedupeKey(testId, cycleIso);
          const enqueueResult = await enqueueScheduledPushNotification({
            title: 'New Test Published',
            message: `${testTitle} is now available.`,
            target: 'all',
            deepLink: 'main/tests',
            dedupeKey,
          });
          if (enqueueResult.enqueued || enqueueResult.skipped) {
            notifySentAt = new Date().toISOString();
            await markPublishScheduleNotifySent(scheduleItem.id, notifySentAt);
          }
        }
        const metaRes = await pool.query(
          `SELECT title, last_cycle_started_at, is_published
           FROM tests
           WHERE id = $1::uuid
           LIMIT 1`,
          [testId],
        );
        const meta = metaRes.rows[0] || {};
        const emailResult = triggerTestPublishAnnouncementEmail({
          testId,
          testTitle: meta.title,
          isPublished: meta.is_published === true,
          lastCycleStartedAt: meta.last_cycle_started_at,
          advancedConfig: adv || {},
          previousAdvancedConfig: adv || {},
          justPublished: false,
          cycleRenewed: true,
        });
        if (emailResult.updateDedupeKey) {
          const nextAdvancedMap = advancedMap && typeof advancedMap === 'object' ? { ...advancedMap } : {};
          const mapKey = String(testId || '').trim();
          nextAdvancedMap[mapKey] = mergePublishEmailDedupeKey(adv || {}, emailResult.updateDedupeKey);
          await setSettingJson('testAdvancedConfigs', nextAdvancedMap);
        }
      }
    }
  } else if (scheduleItem.entityType === 'article') {
    await pool.query(`UPDATE news_articles SET is_published = true WHERE id = $1::uuid`, [
      String(scheduleItem.entityId || ''),
    ]);
  }

  return { notifySentAt };
}

let lastPublishOverdueAlertLogMs = 0;
const PUBLISH_OVERDUE_ALERT_LOG_COOLDOWN_MS = 5 * 60 * 1000;

async function maybeLogOverduePublishAlert() {
  try {
    const nowMs = Date.now();
    const items = await getPublishSchedulingItems(pool);
    const { diagnostics } = buildPublishSchedulingDiagnostics(items, nowMs);
    if (!diagnostics.alertWorthyCount) return;
    if (nowMs - lastPublishOverdueAlertLogMs < PUBLISH_OVERDUE_ALERT_LOG_COOLDOWN_MS) return;
    lastPublishOverdueAlertLogMs = nowMs;
    console.warn('publish_schedule_overdue_alert', {
      overdueCount: diagnostics.overdueCount,
      alertWorthyCount: diagnostics.alertWorthyCount,
      maxOverdueMinutes: diagnostics.maxOverdueMinutes,
      alertAfterMinutes: diagnostics.alertAfterMinutes,
    });
  } catch (e) {
    if (e && e.code === '42P01') return;
    console.error('publish_schedule_overdue_alert_check', e);
  }
}

async function processPublishSchedules() {
  try {
    await maybeLogOverduePublishAlert();
    const claimedItems = await withPublishSchedulingLock(async (client) => {
      const nowMs = Date.now();
      const nowIso = new Date(nowMs).toISOString();
      const items = recoverStalePublishScheduleItems(await getPublishSchedulingItems(client), nowMs);
      if (!items.length) return [];

      const claimed = [];
      const nextItems = [];
      for (const raw of items) {
        const item = raw || {};
        const status = String(item.status || '').trim().toLowerCase();
        if (status !== 'scheduled') {
          nextItems.push(item);
          continue;
        }
        const scheduleMs = Date.parse(String(item.scheduleAt || ''));
        if (!Number.isFinite(scheduleMs) || scheduleMs > nowMs) {
          nextItems.push(item);
          continue;
        }
        const claimedItem = {
          ...item,
          status: 'processing',
          processingStartedAt: nowIso,
        };
        nextItems.push(claimedItem);
        claimed.push(claimedItem);
      }

      if (claimed.length) {
        await savePublishSchedulingItems(nextItems, null, client);
      }
      return claimed;
    });

    if (!claimedItems.length) return;

    const outcomes = [];
    for (const item of claimedItems) {
      try {
        const result = await runPublishScheduleItemWork(item);
        outcomes.push({ item, ok: true, notifySentAt: result.notifySentAt || '' });
      } catch (e) {
        outcomes.push({
          item,
          ok: false,
          error: String(e && (e.message || e) || 'publish_failed'),
        });
      }
    }

    await withPublishSchedulingLock(async (client) => {
      const nowIso = new Date().toISOString();
      const items = recoverStalePublishScheduleItems(await getPublishSchedulingItems(client));
      for (const outcome of outcomes) {
        const itemId = String((outcome.item || {}).id || '').trim();
        if (!itemId) continue;
        const idx = items.findIndex((x) => String((x || {}).id || '') === itemId);
        if (idx < 0) continue;
        if (outcome.ok) {
          items[idx] = {
            ...items[idx],
            status: 'published',
            processedAt: nowIso,
            processingStartedAt: String(items[idx].processingStartedAt || nowIso),
            notifySentAt: String(outcome.notifySentAt || items[idx].notifySentAt || ''),
            lastError: '',
          };
        } else {
          items[idx] = {
            ...items[idx],
            status: 'scheduled',
            processingStartedAt: '',
            lastError: String(outcome.error || 'publish_failed').slice(0, 200),
          };
        }
      }
      await savePublishSchedulingItems(items, null, client);
    });
  } catch (e) {
    if (e && e.code === '42P01') return;
    console.error('publish_scheduler_error', e);
  }
}

async function processTestCycleAutoReschedule() {
  try {
    const nowMs = Date.now();
    const advancedMap = await getSettingJson('testAdvancedConfigs', {});

    const testsRes = await pool.query(
      `SELECT id, duration_minutes, last_cycle_started_at, exam_date, slot_label,
              dynamic_date_enabled, date_cycle_days, is_published, updated_at
       FROM tests
       WHERE is_published = true
         AND last_cycle_started_at IS NOT NULL`,
    );

    const legacyCycleActions = [];
    const rolloverTestIds = [];

    for (const row of testsRes.rows || []) {
      const testId = String(row.id || '').trim();
      if (!testId) continue;
      if (!shouldRunSchedulerRollover(row, nowMs)) continue;

      const adv = resolveAdvancedConfigForTest(advancedMap, testId);
      const useLegacyCatalogUnpublish = adv?.autoCatalogUnpublish === true;

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const lockedRes = await client.query(
          `SELECT id, is_published, duration_minutes, last_cycle_started_at, updated_at,
                  exam_date, slot_label, dynamic_date_enabled, date_cycle_days
           FROM tests
           WHERE id = $1::uuid
           LIMIT 1
           FOR UPDATE`,
          [testId],
        );
        const locked = lockedRes.rows[0];
        if (!locked || locked.is_published !== true) {
          await client.query('COMMIT');
          continue;
        }
        const lockedNowMs = Date.now();
        if (!shouldRunSchedulerRollover(locked, lockedNowMs)) {
          await client.query('COMMIT');
          continue;
        }
        const lockedCycleEndMs = resolveSchedulerCycleEndMs(locked);
        if (!Number.isFinite(lockedCycleEndMs)) {
          await client.query('COMMIT');
          continue;
        }
        const lockedUpdatedMs = Date.parse(String(locked.updated_at || ''));
        if (
          Number.isFinite(lockedUpdatedMs) &&
          Number.isFinite(lockedCycleEndMs) &&
          lockedUpdatedMs > lockedCycleEndMs
        ) {
          await client.query('COMMIT');
          continue;
        }

        await client.query(
          `UPDATE test_waitlist
           SET status = 'cancelled'
           WHERE test_id = $1::uuid AND status = 'waiting'`,
          [testId],
        );

        if (useLegacyCatalogUnpublish) {
          const republishAtMs = cycleRepublishAtMs(lockedCycleEndMs, adv);
          if (!Number.isFinite(republishAtMs)) {
            await client.query('COMMIT');
            continue;
          }
          await client.query(
            `UPDATE tests
             SET is_published = false, enrolled_count = 0, updated_at = now()
             WHERE id = $1::uuid`,
            [testId],
          );
          await client.query('COMMIT');
          legacyCycleActions.push({
            testId,
            scheduleAtIso: new Date(republishAtMs).toISOString(),
          });
        } else {
          await client.query(
            `UPDATE tests
             SET enrolled_count = 0, last_cycle_started_at = now(), updated_at = now()
             WHERE id = $1::uuid`,
            [testId],
          );
          await client.query('COMMIT');
          rolloverTestIds.push(testId);
        }
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    }

    for (const testId of rolloverTestIds) {
      try {
        await regenerateTestFromSubcategoryPool(testId);
      } catch (e) {
        console.error('cycle_rollover_regenerate_error', testId, e);
      }
    }

    if (!legacyCycleActions.length) return;

    await withPublishSchedulingLock(async (client) => {
      const items = recoverStalePublishScheduleItems(await getPublishSchedulingItems(client), nowMs);
      let changedSettings = false;
      const nowIso = new Date().toISOString();

      for (const action of legacyCycleActions) {
        const testId = String(action.testId || '').trim();
        if (!testId) continue;
        const hasPendingSchedule = items.some(
          (x) =>
            String((x || {}).entityType || '').toLowerCase() === 'test' &&
            String((x || {}).entityId || '') === testId &&
            isPublishScheduleItemPending(x),
        );
        if (hasPendingSchedule) continue;

        const adv = resolveAdvancedConfigForTest(advancedMap, testId);
        const notifyOnCycleRepublish = resolveNotifyOnCycleRepublish(adv);

        items.unshift({
          id: `publish-${Date.now()}-${testId.slice(0, 8)}`,
          entityType: 'test',
          entityId: testId,
          scheduleAt: action.scheduleAtIso,
          notifyOnPublish: notifyOnCycleRepublish,
          source: 'autoCycle',
          status: 'scheduled',
          createdAt: nowIso,
          processedAt: '',
        });
        changedSettings = true;
      }

      if (changedSettings) {
        await savePublishSchedulingItems(items, null, client);
      }
    });
  } catch (e) {
    if (e && e.code === '42P01') return;
    if (e && e.code === '42703') return;
    console.error('test_cycle_auto_reschedule_error', e);
  }
}

async function processProfileReminderEmails() {
  if (!isMailConfigured()) return;
  try {
    const settingKey = 'profileReminderEmailState';
    const stateRes = await pool.query(
      `SELECT setting_value FROM app_settings WHERE setting_key = $1 LIMIT 1`,
      [settingKey],
    );
    let state = { sentUserIds: [] };
    if (stateRes.rows[0]) {
      try {
        state = JSON.parse(String(stateRes.rows[0].setting_value || '{}')) || { sentUserIds: [] };
      } catch (_e) {
        state = { sentUserIds: [] };
      }
    }
    const sent = new Set(Array.isArray(state.sentUserIds) ? state.sentUserIds.map((x) => String(x || '').trim()) : []);
    const { rows } = await pool.query(
      `SELECT id, email, display_name
       FROM users
       WHERE is_banned = false
         AND marketing_emails_unsubscribed_at IS NULL
         AND created_at <= (now() - interval '10 minutes')
         AND (
           length(regexp_replace(COALESCE(phone, ''), '\D', '', 'g')) <> 10
           OR trim(COALESCE(signup_state, '')) = ''
           OR trim(COALESCE(signup_district, '')) = ''
         )
       ORDER BY created_at DESC
       LIMIT 200`,
    );
    let changed = false;
    for (const row of rows || []) {
      const userId = String(row.id || '').trim();
      const email = String(row.email || '').trim();
      if (!userId || !email || sent.has(userId)) continue;
      try {
        await sendCompleteProfileReminderEmail({
          userId,
          to: email,
          displayName: String(row.display_name || '').trim(),
        });
        sent.add(userId);
        changed = true;
      } catch (mailErr) {
        console.error('profile_reminder_email_failed', userId, mailErr && (mailErr.message || mailErr));
      }
    }
    if (changed) {
      const next = { sentUserIds: Array.from(sent).slice(-10000) };
      await pool.query(
        `INSERT INTO app_settings (setting_key, setting_value, updated_by)
         VALUES ($1, $2, NULL)
         ON CONFLICT (setting_key)
         DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = now()`,
        [settingKey, JSON.stringify(next)],
      );
    }
  } catch (e) {
    if (e && e.code === '42P01') return;
    console.error('profile_reminder_scheduler_error', e);
  }
}

async function processUnlockedResultEmails() {
  if (!isMailConfigured()) return;
  try {
    const settingsRes = await pool.query(
      `SELECT setting_value FROM app_settings WHERE setting_key = 'resultUnlockEmailSettings' LIMIT 1`,
    );
    let settings = { enabled: true, delayHours: 3 };
    if (settingsRes.rows[0]) {
      try {
        const parsed = JSON.parse(String(settingsRes.rows[0].setting_value || '{}')) || {};
        settings = {
          enabled: parsed.enabled !== false,
          delayHours: Math.max(0, Math.min(168, Number(parsed.delayHours ?? 3))),
        };
      } catch (_e) {
        settings = { enabled: true, delayHours: 3 };
      }
    }
    if (!settings.enabled) return;
    const delayHours = settings.delayHours;
    const stateKey = 'resultUnlockEmailState';
    const stateRes = await pool.query(
      `SELECT setting_value FROM app_settings WHERE setting_key = $1 LIMIT 1`,
      [stateKey],
    );
    let state = { sentAttemptIds: [] };
    if (stateRes.rows[0]) {
      try {
        state = JSON.parse(String(stateRes.rows[0].setting_value || '{}')) || { sentAttemptIds: [] };
      } catch (_e) {
        state = { sentAttemptIds: [] };
      }
    }
    const sent = new Set(
      Array.isArray(state.sentAttemptIds) ? state.sentAttemptIds.map((x) => String(x || '').trim()) : [],
    );
    const { rows } = await pool.query(
      `WITH base AS (
         SELECT
           ta.id,
           ta.user_id,
           ta.correct,
           ta.total,
           ta.completed_at,
           u.email,
           u.display_name,
           COALESCE(t.title, ta.test_name) AS test_title,
           COALESCE(
             t.result_release_at,
             ta.completed_at + make_interval(hours => $1::int)
           ) AS unlock_at,
           COALESCE(ta.test_catalog_id::text, lower(trim(ta.test_name))) AS test_key
         FROM test_attempts ta
         INNER JOIN users u ON u.id = ta.user_id
         LEFT JOIN tests t ON t.id = ta.test_catalog_id
         WHERE u.is_banned = false
           AND trim(COALESCE(u.email, '')) <> ''
           AND u.marketing_emails_unsubscribed_at IS NULL
       ),
       ranked AS (
         SELECT
           b.*,
           ROW_NUMBER() OVER (
             PARTITION BY b.test_key
             ORDER BY b.correct DESC, b.total DESC, b.completed_at ASC, b.id ASC
           ) AS rank,
           COUNT(*) OVER (PARTITION BY b.test_key) AS participants
         FROM base b
       )
       SELECT
         id::text AS attempt_id,
         user_id::text AS user_id,
         email,
         display_name,
         test_title,
         correct,
         total,
         rank,
         participants,
         unlock_at
       FROM ranked
       WHERE unlock_at <= now()
       ORDER BY unlock_at DESC
       LIMIT 200`,
      [delayHours],
    );

    let changed = false;
    for (const row of rows || []) {
      const attemptId = String(row.attempt_id || '').trim();
      if (!attemptId || sent.has(attemptId)) continue;
      try {
        await sendResultUnlockedEmail({
          userId: String(row.user_id || '').trim(),
          to: String(row.email || '').trim(),
          displayName: String(row.display_name || '').trim(),
          testTitle: String(row.test_title || '').trim() || 'Mock Test',
          correct: Number(row.correct || 0),
          total: Number(row.total || 0),
          rank: Number(row.rank || 0),
          participants: Number(row.participants || 0),
          unlockAtIso: row.unlock_at ? new Date(row.unlock_at).toISOString() : new Date().toISOString(),
        });
        sent.add(attemptId);
        changed = true;
      } catch (mailErr) {
        console.error('result_unlock_email_failed', attemptId, mailErr && (mailErr.message || mailErr));
      }
    }

    if (changed) {
      const next = { sentAttemptIds: Array.from(sent).slice(-20000) };
      await pool.query(
        `INSERT INTO app_settings (setting_key, setting_value, updated_by)
         VALUES ($1, $2, NULL)
         ON CONFLICT (setting_key)
         DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = now()`,
        [stateKey, JSON.stringify(next)],
      );
    }
  } catch (e) {
    if (e && e.code === '42P01') return;
    console.error('result_unlock_email_scheduler_error', e);
  }
}

function parseHourMinuteFromSlotLabel(slotLabel) {
  const raw = String(slotLabel || '').trim().toLowerCase();
  if (!raw) return null;
  const m = raw.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = Number(m[2] || 0);
  const meridiem = String(m[3] || '').toLowerCase();
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    if (meridiem === 'pm' && hour !== 12) hour += 12;
    if (meridiem === 'am' && hour === 12) hour = 0;
  } else if (hour < 0 || hour > 23) {
    return null;
  }
  return { hour, minute };
}

function buildExamStartIso(examDate, slotLabel) {
  const date = String(examDate || '').trim();
  if (!date) return null;
  const hm = parseHourMinuteFromSlotLabel(slotLabel);
  if (!hm) return null;
  const tzOffsetMinutes = Number(process.env.EXAM_TIMEZONE_OFFSET_MINUTES || 330);
  const sign = tzOffsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(tzOffsetMinutes);
  const tzH = String(Math.floor(abs / 60)).padStart(2, '0');
  const tzM = String(abs % 60).padStart(2, '0');
  const hh = String(hm.hour).padStart(2, '0');
  const mm = String(hm.minute).padStart(2, '0');
  const iso = `${date}T${hh}:${mm}:00${sign}${tzH}:${tzM}`;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}

async function processMockTestStartReminderEmails() {
  if (!isMailConfigured()) return;
  try {
    const stateKey = 'mockTestStartReminderEmailState';
    const stateRes = await pool.query(
      `SELECT setting_value FROM app_settings WHERE setting_key = $1 LIMIT 1`,
      [stateKey],
    );
    let state = { sentTestIds: [] };
    if (stateRes.rows[0]) {
      try {
        state = JSON.parse(String(stateRes.rows[0].setting_value || '{}')) || { sentTestIds: [] };
      } catch (_e) {
        state = { sentTestIds: [] };
      }
    }
    const sentTestIds = new Set(
      Array.isArray(state.sentTestIds) ? state.sentTestIds.map((x) => String(x || '').trim()) : [],
    );
    const testsRes = await pool.query(
      `SELECT id::text AS id, title, exam_date, slot_label
       FROM tests
       WHERE is_published = true
         AND exam_date IS NOT NULL
         AND trim(COALESCE(slot_label, '')) <> ''
         AND exam_date BETWEEN (now()::date - interval '1 day') AND (now()::date + interval '2 days')
       ORDER BY exam_date ASC
       LIMIT 120`,
    );
    const usersRes = await pool.query(
      `SELECT id::text AS user_id, email, display_name
       FROM users
       WHERE is_banned = false
         AND trim(COALESCE(email, '')) <> ''
         AND marketing_emails_unsubscribed_at IS NULL
       ORDER BY created_at DESC
       LIMIT 8000`,
    );
    const advancedMap = await getSettingJson('testAdvancedConfigs', {});
    const nowMs = Date.now();
    let changed = false;

    for (const testRow of testsRes.rows || []) {
      const testId = String(testRow.id || '').trim();
      if (!testId || sentTestIds.has(testId)) continue;
      const startAtIso = buildExamStartIso(testRow.exam_date, testRow.slot_label);
      if (!startAtIso) continue;
      const diffMin = (Date.parse(startAtIso) - nowMs) / 60000;
      const adv = resolveAdvancedConfigForTest(advancedMap, testId) || {};
      const notifyBefore = Math.max(0, Number(adv.notifyBeforeMinutes || 0));
      const targetMinutes = notifyBefore > 0 ? notifyBefore : 60;
      if (diffMin < targetMinutes - 5 || diffMin > targetMinutes + 5) continue;

      for (const userRow of usersRes.rows || []) {
        const email = String(userRow.email || '').trim();
        if (!email) continue;
        try {
          await sendMockTestStartingSoonEmail({
            userId: String(userRow.user_id || '').trim(),
            to: email,
            displayName: String(userRow.display_name || '').trim(),
            testTitle: String(testRow.title || '').trim() || 'Mock Test',
            examDate: String(testRow.exam_date || '').trim(),
            slotLabel: String(testRow.slot_label || '').trim(),
            startAtIso,
          });
        } catch (mailErr) {
          console.error('mocktest_start_reminder_email_failed', testId, email, mailErr && (mailErr.message || mailErr));
        }
      }
      sentTestIds.add(testId);
      changed = true;
    }

    if (changed) {
      const next = { sentTestIds: Array.from(sentTestIds).slice(-10000) };
      await pool.query(
        `INSERT INTO app_settings (setting_key, setting_value, updated_by)
         VALUES ($1, $2, NULL)
         ON CONFLICT (setting_key)
         DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = now()`,
        [stateKey, JSON.stringify(next)],
      );
    }
  } catch (e) {
    if (e && e.code === '42P01') return;
    console.error('mocktest_start_reminder_scheduler_error', e);
  }
}

async function getSettingJson(settingKey, fallback) {
  const res = await pool.query(`SELECT setting_value FROM app_settings WHERE setting_key = $1 LIMIT 1`, [settingKey]);
  if (!res.rows[0]) return fallback;
  try {
    return JSON.parse(String(res.rows[0].setting_value || 'null')) ?? fallback;
  } catch (_e) {
    return fallback;
  }
}

async function setSettingJson(settingKey, value) {
  let payload = value;
  if (settingKey === 'notificationScheduling') {
    payload = trimNotificationSchedulingPayload(value);
  }
  await pool.query(
    `INSERT INTO app_settings (setting_key, setting_value, updated_by)
     VALUES ($1, $2, NULL)
     ON CONFLICT (setting_key)
     DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = now()`,
    [settingKey, JSON.stringify(payload)],
  );
}

function resolveAdvancedConfigForTest(advancedMap, testId) {
  const key = String(testId || '').trim();
  if (!key || !advancedMap || typeof advancedMap !== 'object') return null;
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

async function enqueueScheduledPushNotification(payload) {
  const current = await getSettingJson('notificationScheduling', { items: [] });
  const result = prependNotificationIfNotDuplicate(current, payload);
  if (result.enqueued) {
    await setSettingJson('notificationScheduling', result.current);
  }
  return result;
}

async function sendPushToAudience({ title, message, target, deepLink }) {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS user_device_tokens (
       id BIGSERIAL PRIMARY KEY,
       user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       device_token TEXT NOT NULL,
       platform VARCHAR(20) NOT NULL DEFAULT 'android',
       app_version VARCHAR(40) NOT NULL DEFAULT '',
       device_model VARCHAR(120) NOT NULL DEFAULT '',
       is_active BOOLEAN NOT NULL DEFAULT true,
       created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
       last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
       UNIQUE (device_token)
     )`,
  );
  let whereClause = 'TRUE';
  if (target === 'new_users') {
    whereClause = `u.created_at >= now() - interval '7 days'`;
  } else if (target === 'active_users') {
    whereClause = `EXISTS (
      SELECT 1 FROM test_attempts ta
      WHERE ta.user_id = u.id AND ta.completed_at >= now() - interval '30 days'
    )`;
  }
  const tableColsRes = await pool.query(
    `SELECT table_name, column_name
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name IN ('user_device_tokens', 'user_devices')`,
  );
  const tableCols = {};
  for (const row of tableColsRes.rows || []) {
    const table = String(row.table_name || '');
    const col = String(row.column_name || '');
    if (!table || !col) continue;
    if (!tableCols[table]) tableCols[table] = new Set();
    tableCols[table].add(col);
  }
  const hasUdt = tableCols.user_device_tokens && tableCols.user_device_tokens.size > 0;
  const hasUd = tableCols.user_devices && tableCols.user_devices.size > 0;
  if (!hasUdt && !hasUd) return { total: 0, sent: 0, failed: 0, deactivated: 0 };
  const sourceTable = hasUdt ? 'user_device_tokens' : 'user_devices';
  const cols = tableCols[sourceTable];
  const tokenColumn = cols.has('device_token')
    ? 'device_token'
    : cols.has('token')
      ? 'token'
      : cols.has('fcm_token')
        ? 'fcm_token'
        : null;
  if (!tokenColumn) return { total: 0, sent: 0, failed: 0, deactivated: 0 };
  const activeColumn = cols.has('is_active')
    ? 'is_active'
    : cols.has('active')
      ? 'active'
      : cols.has('enabled')
        ? 'enabled'
        : null;
  const orderColumn = cols.has('updated_at')
    ? 'updated_at'
    : cols.has('last_seen_at')
      ? 'last_seen_at'
      : cols.has('created_at')
        ? 'created_at'
        : null;
  const activeClause = activeColumn ? `src.${activeColumn} = true AND ` : '';
  const orderClause = orderColumn ? `ORDER BY src.${orderColumn} DESC` : '';
  const tokenRows = await pool.query(
    `SELECT src.${tokenColumn} AS token
     FROM ${sourceTable} src
     INNER JOIN users u ON u.id = src.user_id
     WHERE ${activeClause}${whereClause}
     ${orderClause}
     LIMIT 10000`,
  );
  const rows = tokenRows.rows || [];
  let sent = 0;
  let failed = 0;
  let deactivated = 0;
  for (const row of rows) {
    const currentToken = String(row.token || '').trim();
    if (!currentToken) {
      failed += 1;
      continue;
    }
    try {
      const result = await sendPushToToken(currentToken, { title, message, deepLink });
      if (result.ok) {
        sent += 1;
      } else {
        failed += 1;
        if (result.code === 'UNREGISTERED') {
          if (activeColumn) {
            const updateTs = cols.has('updated_at') ? ', updated_at = now()' : '';
            await pool.query(
              `UPDATE ${sourceTable}
               SET ${activeColumn} = false${updateTs}
               WHERE ${tokenColumn} = $1`,
              [currentToken],
            );
          } else {
            await pool.query(`DELETE FROM ${sourceTable} WHERE ${tokenColumn} = $1`, [currentToken]);
          }
          deactivated += 1;
        }
      }
    } catch (e) {
      failed += 1;
      console.error('notification_scheduler_token_send_failed', e && (e.message || e));
    }
  }
  return { total: rows.length, sent, failed, deactivated };
}

function computeNextNotificationSchedule(item, baseIso) {
  const repeatType = String(item.repeatType || 'none').trim().toLowerCase();
  if (!['daily', 'weekly', 'monthly'].includes(repeatType)) return null;
  const baseMs = Date.parse(String(baseIso || ''));
  if (!Number.isFinite(baseMs)) return null;
  const d = new Date(baseMs);
  if (repeatType === 'daily') {
    d.setUTCDate(d.getUTCDate() + 1);
  } else if (repeatType === 'weekly') {
    const targetDow = Math.max(0, Math.min(6, Number(item.dayOfWeek || 1)));
    const currentDow = d.getUTCDay();
    let addDays = (targetDow - currentDow + 7) % 7;
    if (addDays === 0) addDays = 7;
    d.setUTCDate(d.getUTCDate() + addDays);
  } else if (repeatType === 'monthly') {
    const targetDom = Math.max(1, Math.min(31, Number(item.dayOfMonth || 1)));
    const monthProbe = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), 0));
    const lastDay = new Date(Date.UTC(monthProbe.getUTCFullYear(), monthProbe.getUTCMonth() + 1, 0)).getUTCDate();
    monthProbe.setUTCDate(Math.min(targetDom, lastDay));
    return monthProbe.toISOString();
  }
  return d.toISOString();
}

async function processNotificationSchedules() {
  try {
    const payload = await getSettingJson('notificationScheduling', { items: [] });
    const items = Array.isArray(payload.items) ? payload.items : [];
    if (!items.length) return;
    const nowMs = Date.now();
    // Safety: never blast a huge backlog in one scheduler tick.
    // If multiple items are overdue (scheduleAt in the past), we process only a limited number per run,
    // and defer the rest slightly into the future.
    const maxPerRunRaw = Number(process.env.NOTIFICATION_SCHEDULER_MAX_PER_RUN || 3);
    const maxPerRun = Number.isFinite(maxPerRunRaw) ? Math.max(1, Math.min(50, Math.floor(maxPerRunRaw))) : 3;
    const deferMsRaw = Number(process.env.NOTIFICATION_SCHEDULER_DEFER_MS || 120000);
    const deferMs = Number.isFinite(deferMsRaw) ? Math.max(10000, Math.min(3600000, Math.floor(deferMsRaw))) : 120000;
    let processedThisRun = 0;
    let changed = false;
    const nextItems = [];
    for (const raw of items) {
      const item = raw || {};
      const status = String(item.status || '').trim().toLowerCase();
      if (status !== 'scheduled') {
        nextItems.push(item);
        continue;
      }
      const scheduleAt = String(item.scheduleAt || '').trim();
      const scheduleMs = Date.parse(scheduleAt);
      if (!Number.isFinite(scheduleMs) || scheduleMs > nowMs) {
        nextItems.push(item);
        continue;
      }
      if (processedThisRun >= maxPerRun) {
        // Defer: keep order stable and avoid re-sending immediately on the next tick.
        nextItems.push({
          ...item,
          scheduleAt: new Date(nowMs + deferMs).toISOString(),
          status: 'scheduled',
          lastRunAt: String(item.lastRunAt || ''),
          lastRunSent: Number(item.lastRunSent || 0),
          lastRunFailed: Number(item.lastRunFailed || 0),
          lastError: 'deferred_backlog_limit',
        });
        changed = true;
        continue;
      }
      const title = String(item.title || '').trim();
      const message = String(item.message || '').trim();
      const target = ['all', 'new_users', 'active_users'].includes(String(item.target || '').trim().toLowerCase())
        ? String(item.target).trim().toLowerCase()
        : 'all';
      const deepLink = String(item.deepLink || '').trim();
      if (!title || !message) {
        nextItems.push({
          ...item,
          status: 'failed',
          failedAt: new Date().toISOString(),
          lastError: 'missing_title_or_message',
        });
        changed = true;
        continue;
      }
      const result = await sendPushToAudience({ title, message, target, deepLink });
      processedThisRun += 1;
      const delivery = resolveNotificationDeliveryOutcome(result);
      const runSucceeded = delivery.succeeded;
      const nextScheduleAt = computeNextNotificationSchedule(item, scheduleAt);
      const repeatUntilMs = Date.parse(String(item.repeatUntil || '').trim());
      const hasValidRepeatUntil = Number.isFinite(repeatUntilMs);
      const nextScheduleMs = Date.parse(String(nextScheduleAt || ''));
      const canRepeat = Number.isFinite(nextScheduleMs) && (!hasValidRepeatUntil || nextScheduleMs <= repeatUntilMs);
      if (nextScheduleAt && canRepeat) {
        nextItems.push({
          ...item,
          scheduleAt: nextScheduleAt,
          status: 'scheduled',
          sentAt: runSucceeded ? new Date().toISOString() : String(item.sentAt || ''),
          lastRunAt: new Date().toISOString(),
          lastRunSent: result.sent,
          lastRunFailed: result.failed,
          lastError: runSucceeded ? '' : delivery.lastError,
        });
      } else {
        nextItems.push({
          ...item,
          status: runSucceeded ? 'sent' : 'failed',
          sentAt: runSucceeded ? new Date().toISOString() : String(item.sentAt || ''),
          failedAt: runSucceeded ? String(item.failedAt || '') : new Date().toISOString(),
          lastRunSent: result.sent,
          lastRunFailed: result.failed,
          lastError: runSucceeded ? '' : delivery.lastError,
        });
      }
      changed = true;
    }
    if (changed) {
      await setSettingJson('notificationScheduling', { items: nextItems });
    }
  } catch (e) {
    if (e && e.code === '42P01') return;
    console.error('notification_scheduler_error', e);
  }
}

async function processMissedTestFollowupEmails() {
  if (!isMailConfigured()) return;
  try {
    const todayKey = new Date().toISOString().slice(0, 10);
    const stateKey = 'missedTestFollowupState';
    const state = await getSettingJson(stateKey, { dayKey: '', sentUserIds: [] });
    let sent = new Set(Array.isArray(state.sentUserIds) && state.dayKey === todayKey ? state.sentUserIds : []);
    const testsRes = await pool.query(
      `SELECT id::text AS id, title FROM tests WHERE is_published = true AND exam_date = now()::date ORDER BY created_at DESC LIMIT 1`,
    );
    const todayTest = testsRes.rows[0];
    if (!todayTest) return;
    const usersRes = await pool.query(
      `SELECT u.id::text AS user_id, u.email, u.display_name
       FROM users u
       WHERE u.is_banned = false
         AND trim(COALESCE(u.email, '')) <> ''
         AND u.marketing_emails_unsubscribed_at IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM test_attempts ta
           WHERE ta.user_id = u.id AND ta.test_catalog_id = $1::uuid AND ta.completed_at::date = now()::date
         )
       LIMIT 4000`,
      [todayTest.id],
    );
    let changed = false;
    for (const row of usersRes.rows || []) {
      const userId = String(row.user_id || '');
      if (!userId || sent.has(userId)) continue;
      await sendMissedTestFollowupEmail({
        userId,
        to: String(row.email || ''),
        displayName: String(row.display_name || ''),
        testTitle: String(todayTest.title || 'Today Mock Test'),
      }).catch((e) => console.error('missed_test_followup_email_failed', userId, e && (e.message || e)));
      sent.add(userId);
      changed = true;
    }
    if (changed) await setSettingJson(stateKey, { dayKey: todayKey, sentUserIds: Array.from(sent).slice(-20000) });
  } catch (e) {
    if (e && e.code === '42P01') return;
    console.error('missed_test_followup_scheduler_error', e);
  }
}

async function processStreakRiskEmails() {
  if (!isMailConfigured()) return;
  try {
    const stateKey = 'streakRiskEmailState';
    const state = await getSettingJson(stateKey, { sentAtByUser: {} });
    const sentMap = state.sentAtByUser && typeof state.sentAtByUser === 'object' ? state.sentAtByUser : {};
    const rowsRes = await pool.query(
      `SELECT
         u.id::text AS user_id,
         u.email,
         u.display_name,
         COALESCE(MAX(ta.completed_at), u.created_at) AS last_active
       FROM users u
       LEFT JOIN test_attempts ta ON ta.user_id = u.id
       WHERE u.is_banned = false AND trim(COALESCE(u.email, '')) <> ''
         AND u.marketing_emails_unsubscribed_at IS NULL
       GROUP BY u.id, u.email, u.display_name, u.created_at
       HAVING (now() - COALESCE(MAX(ta.completed_at), u.created_at)) BETWEEN interval '2 days' AND interval '3 days'
       LIMIT 3000`,
    );
    let changed = false;
    for (const row of rowsRes.rows || []) {
      const userId = String(row.user_id || '');
      const lastSent = String(sentMap[userId] || '');
      if (lastSent && Date.now() - Date.parse(lastSent) < 36 * 60 * 60 * 1000) continue;
      const days = Math.max(2, Math.floor((Date.now() - Date.parse(String(row.last_active || new Date().toISOString()))) / 86400000));
      await sendStreakRiskAlertEmail({
        userId,
        to: String(row.email || ''),
        displayName: String(row.display_name || ''),
        inactiveDays: days,
      }).catch((e) => console.error('streak_risk_email_failed', userId, e && (e.message || e)));
      sentMap[userId] = new Date().toISOString();
      changed = true;
    }
    if (changed) await setSettingJson(stateKey, { sentAtByUser: sentMap });
  } catch (e) {
    if (e && e.code === '42P01') return;
    console.error('streak_risk_scheduler_error', e);
  }
}

function weekKeyUtc(d = new Date()) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = x.getUTCDay() || 7;
  x.setUTCDate(x.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((x - yearStart) / 86400000) + 1) / 7);
  return `${x.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

async function processWeeklyPerformanceReportEmails() {
  if (!isMailConfigured()) return;
  try {
    const key = weekKeyUtc();
    const stateKey = 'weeklyPerformanceEmailState';
    const state = await getSettingJson(stateKey, { weekKey: '', sentUserIds: [] });
    const sent = new Set(Array.isArray(state.sentUserIds) && state.weekKey === key ? state.sentUserIds : []);
    const metricsRes = await pool.query(
      `WITH recent AS (
         SELECT ta.user_id, ta.correct, ta.total, ta.completed_at, t.subcategory
         FROM test_attempts ta
         LEFT JOIN tests t ON t.id = ta.test_catalog_id
         WHERE ta.completed_at >= now() - interval '7 days'
       ),
       user_summary AS (
         SELECT user_id, COUNT(*)::int AS attempts, ROUND(AVG((correct::numeric / NULLIF(total,0))*100), 0)::int AS avg_percent
         FROM recent
         GROUP BY user_id
       ),
       weak AS (
         SELECT DISTINCT ON (r.user_id)
           r.user_id,
           COALESCE(NULLIF(trim(r.subcategory), ''), 'General Practice') AS weak_topic
         FROM recent r
         GROUP BY r.user_id, weak_topic
         ORDER BY r.user_id, AVG((r.correct::numeric / NULLIF(r.total,0))*100) ASC
       )
       SELECT u.id::text AS user_id, u.email, u.display_name, us.attempts, us.avg_percent, w.weak_topic
       FROM user_summary us
       INNER JOIN users u ON u.id = us.user_id
       LEFT JOIN weak w ON w.user_id = us.user_id
       WHERE u.is_banned = false AND trim(COALESCE(u.email, '')) <> ''
         AND u.marketing_emails_unsubscribed_at IS NULL
       LIMIT 4000`,
    );
    let changed = false;
    for (const row of metricsRes.rows || []) {
      const userId = String(row.user_id || '');
      if (!userId || sent.has(userId)) continue;
      await sendWeeklyPerformanceReportEmail({
        userId,
        to: String(row.email || ''),
        displayName: String(row.display_name || ''),
        attempts: Number(row.attempts || 0),
        avgPercent: Number(row.avg_percent || 0),
        weakTopic: String(row.weak_topic || 'General Practice'),
      }).catch((e) => console.error('weekly_report_email_failed', userId, e && (e.message || e)));
      sent.add(userId);
      changed = true;
    }
    if (changed) await setSettingJson(stateKey, { weekKey: key, sentUserIds: Array.from(sent).slice(-20000) });
  } catch (e) {
    if (e && e.code === '42P01') return;
    console.error('weekly_report_scheduler_error', e);
  }
}

async function processRankMilestoneEmails() {
  if (!isMailConfigured()) return;
  try {
    const stateKey = 'rankMilestoneEmailState';
    const state = await getSettingJson(stateKey, { sentAttemptIds: [] });
    const sent = new Set(Array.isArray(state.sentAttemptIds) ? state.sentAttemptIds.map((x) => String(x)) : []);
    const res = await pool.query(
      `WITH ranked AS (
         SELECT
           ta.id,
           ta.user_id,
           ta.correct,
           ta.total,
           ta.completed_at,
           COALESCE(t.title, ta.test_name) AS test_title,
           COALESCE(ta.test_catalog_id::text, lower(trim(ta.test_name))) AS test_key,
           ROW_NUMBER() OVER (PARTITION BY COALESCE(ta.test_catalog_id::text, lower(trim(ta.test_name))) ORDER BY ta.correct DESC, ta.total DESC, ta.completed_at ASC, ta.id ASC) AS rank
         FROM test_attempts ta
         LEFT JOIN tests t ON t.id = ta.test_catalog_id
       ),
       trend AS (
         SELECT
           r.*,
           LAG(r.rank) OVER (PARTITION BY r.user_id, r.test_key ORDER BY r.completed_at ASC, r.id ASC) AS prev_rank
         FROM ranked r
       )
       SELECT
         tr.id::text AS attempt_id,
         tr.user_id::text AS user_id,
         u.email,
         u.display_name,
         tr.test_title,
         tr.rank,
         COALESCE(tr.prev_rank, tr.rank) AS prev_rank
       FROM trend tr
       INNER JOIN users u ON u.id = tr.user_id
       WHERE u.is_banned = false
         AND trim(COALESCE(u.email, '')) <> ''
         AND u.marketing_emails_unsubscribed_at IS NULL
         AND tr.completed_at >= now() - interval '2 days'
         AND (tr.rank <= 100 OR (COALESCE(tr.prev_rank, tr.rank) - tr.rank) >= 20)
       ORDER BY tr.completed_at DESC
       LIMIT 500`,
    );
    let changed = false;
    for (const row of res.rows || []) {
      const attemptId = String(row.attempt_id || '');
      if (!attemptId || sent.has(attemptId)) continue;
      const improvedBy = Math.max(0, Number(row.prev_rank || row.rank) - Number(row.rank || 0));
      const reason = Number(row.rank || 0) <= 100 ? 'You entered Top 100.' : `You improved by ${improvedBy} ranks.`;
      await sendRankMilestoneEmail({
        userId: String(row.user_id || '').trim(),
        to: String(row.email || ''),
        displayName: String(row.display_name || ''),
        testTitle: String(row.test_title || 'Mock Test'),
        rank: Number(row.rank || 0),
        improvedBy,
        reason,
      }).catch((e) => console.error('rank_milestone_email_failed', attemptId, e && (e.message || e)));
      sent.add(attemptId);
      changed = true;
    }
    if (changed) await setSettingJson(stateKey, { sentAttemptIds: Array.from(sent).slice(-30000) });
  } catch (e) {
    if (e && e.code === '42P01') return;
    console.error('rank_milestone_scheduler_error', e);
  }
}

async function processInterestContentEmails() {
  if (!isMailConfigured()) return;
  try {
    const stateKey = 'interestContentEmailState';
    const state = await getSettingJson(stateKey, { sentPairs: [] });
    const sent = new Set(Array.isArray(state.sentPairs) ? state.sentPairs.map((x) => String(x)) : []);
    const usersRes = await pool.query(
      `WITH test_interest AS (
         SELECT ta.user_id, t.subcategory, COUNT(*) AS c
         FROM test_attempts ta
         INNER JOIN tests t ON t.id = ta.test_catalog_id
         WHERE trim(COALESCE(t.subcategory, '')) <> ''
         GROUP BY ta.user_id, t.subcategory
       ),
       top_interest AS (
         SELECT DISTINCT ON (user_id) user_id, subcategory
         FROM test_interest
         ORDER BY user_id, c DESC
       )
       SELECT u.id::text AS user_id, u.email, u.display_name, ti.subcategory
       FROM users u
       LEFT JOIN top_interest ti ON ti.user_id = u.id
       WHERE u.is_banned = false AND trim(COALESCE(u.email, '')) <> ''
         AND u.marketing_emails_unsubscribed_at IS NULL
       LIMIT 4000`,
    );
    const testsRes = await pool.query(
      `SELECT id::text AS id, title, subcategory
       FROM tests
       WHERE is_published = true AND created_at >= now() - interval '24 hours'
       ORDER BY created_at DESC
       LIMIT 60`,
    );
    let changed = false;
    for (const user of usersRes.rows || []) {
      const interest = String(user.subcategory || '').trim().toLowerCase();
      if (!interest) continue;
      const matched = (testsRes.rows || []).find((t) => String(t.subcategory || '').trim().toLowerCase() === interest);
      if (!matched) continue;
      const pair = `${String(user.user_id)}:${String(matched.id)}`;
      if (sent.has(pair)) continue;
      await sendNewContentByInterestEmail({
        userId: String(user.user_id || '').trim(),
        to: String(user.email || ''),
        displayName: String(user.display_name || ''),
        interestLabel: `Interest: ${String(matched.subcategory || '').trim()}`,
        title: String(matched.title || 'New Mock Test'),
        message: 'New content matching your preferred category is now available.',
      }).catch((e) => console.error('interest_content_email_failed', pair, e && (e.message || e)));
      sent.add(pair);
      changed = true;
    }
    if (changed) await setSettingJson(stateKey, { sentPairs: Array.from(sent).slice(-30000) });
  } catch (e) {
    if (e && e.code === '42P01') return;
    console.error('interest_content_scheduler_error', e);
  }
}

async function processReEngagementEmails() {
  if (!isMailConfigured()) return;
  try {
    const milestones = [7, 14, 30];
    const stateKey = 'reengagementEmailState';
    const state = await getSettingJson(stateKey, { sentByUser: {} });
    const sentByUser = state.sentByUser && typeof state.sentByUser === 'object' ? state.sentByUser : {};
    const usersRes = await pool.query(
      `SELECT u.id::text AS user_id, u.email, u.display_name, COALESCE(MAX(ta.completed_at), u.created_at) AS last_active
       FROM users u
       LEFT JOIN test_attempts ta ON ta.user_id = u.id
       WHERE u.is_banned = false AND trim(COALESCE(u.email, '')) <> ''
         AND u.marketing_emails_unsubscribed_at IS NULL
       GROUP BY u.id, u.email, u.display_name, u.created_at
       LIMIT 6000`,
    );
    let changed = false;
    for (const row of usersRes.rows || []) {
      const userId = String(row.user_id || '');
      const inactiveDays = Math.floor((Date.now() - Date.parse(String(row.last_active || new Date().toISOString()))) / 86400000);
      const targetMilestone = milestones.find((m) => inactiveDays >= m && inactiveDays < m + 1);
      if (!targetMilestone) continue;
      const sentMilestones = new Set(Array.isArray(sentByUser[userId]) ? sentByUser[userId].map((x) => Number(x)) : []);
      if (sentMilestones.has(targetMilestone)) continue;
      await sendReEngagementEmail({
        userId,
        to: String(row.email || ''),
        displayName: String(row.display_name || ''),
        inactiveDays: targetMilestone,
      }).catch((e) => console.error('reengagement_email_failed', userId, e && (e.message || e)));
      sentMilestones.add(targetMilestone);
      sentByUser[userId] = Array.from(sentMilestones).sort((a, b) => a - b);
      changed = true;
    }
    if (changed) await setSettingJson(stateKey, { sentByUser });
  } catch (e) {
    if (e && e.code === '42P01') return;
    console.error('reengagement_scheduler_error', e);
  }
}

async function processBirthdayEmails() {
  if (!isMailConfigured()) return;
  try {
    const stateKey = 'birthdayEmailState';
    const currentYear = String(new Date().getUTCFullYear());
    const state = await getSettingJson(stateKey, { sentByUserYear: {} });
    const sentByUserYear = state.sentByUserYear && typeof state.sentByUserYear === 'object' ? state.sentByUserYear : {};
    const rowsRes = await pool.query(
      `SELECT id::text AS user_id, email, display_name
       FROM users
       WHERE is_banned = false
         AND trim(COALESCE(email, '')) <> ''
         AND marketing_emails_unsubscribed_at IS NULL
         AND date_of_birth IS NOT NULL
         AND EXTRACT(MONTH FROM date_of_birth) = EXTRACT(MONTH FROM now())
         AND EXTRACT(DAY FROM date_of_birth) = EXTRACT(DAY FROM now())
       LIMIT 4000`,
    );
    let changed = false;
    for (const row of rowsRes.rows || []) {
      const userId = String(row.user_id || '');
      if (!userId) continue;
      if (String(sentByUserYear[userId] || '') === currentYear) continue;
      await sendBirthdayEmail({
        userId,
        to: String(row.email || ''),
        displayName: String(row.display_name || ''),
      }).catch((e) => console.error('birthday_email_failed', userId, e && (e.message || e)));
      sentByUserYear[userId] = currentYear;
      changed = true;
    }
    if (changed) await setSettingJson(stateKey, { sentByUserYear });
  } catch (e) {
    if (e && e.code === '42P01') return;
    if (e && e.code === '42703') return;
    console.error('birthday_scheduler_error', e);
  }
}

setInterval(() => {
  processPublishSchedules();
}, 60000);
setInterval(() => {
  processNotificationSchedules();
}, 60000);
setInterval(() => {
  processTestCycleAutoReschedule();
}, 60000);
setInterval(() => {
  processProfileReminderEmails();
}, 60000);
setInterval(() => {
  processUnlockedResultEmails();
}, 60000);
setInterval(() => {
  processMockTestStartReminderEmails();
}, 60000);
setInterval(() => {
  processMissedTestFollowupEmails();
}, 60000);
setInterval(() => {
  processStreakRiskEmails();
}, 60000);
setInterval(() => {
  processWeeklyPerformanceReportEmails();
}, 60000);
setInterval(() => {
  processRankMilestoneEmails();
}, 60000);
setInterval(() => {
  processInterestContentEmails();
}, 60000);
setInterval(() => {
  processReEngagementEmails();
}, 60000);
setInterval(() => {
  processBirthdayEmails();
}, 60000);

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const port = parseInt(process.env.PORT || '3000', 10);

/** Set by app.listen — used for graceful SIGTERM/SIGINT shutdown. */
let httpServer = null;
let shutdownStarted = false;

function gracefulShutdown(signal) {
  if (shutdownStarted) {
    console.error(`Received ${signal} again; forcing exit`);
    process.exit(1);
  }
  shutdownStarted = true;
  console.log(`Received ${signal}, shutting down gracefully...`);

  const timeoutMs = Math.max(5000, Number(process.env.SHUTDOWN_TIMEOUT_MS || 30000));
  const forceExit = setTimeout(() => {
    console.error('Graceful shutdown timed out; exiting with code 1');
    process.exit(1);
  }, timeoutMs);

  const cleanup = async () => {
    const { closeAttemptSubmitQueue } = require('./queues/attemptSubmitQueue');
    await closeAttemptSubmitQueue();
    await pool.end();
  };

  const finishOk = () => {
    clearTimeout(forceExit);
    console.log('Graceful shutdown complete');
    process.exit(0);
  };

  const finishErr = (err) => {
    console.error(err);
    clearTimeout(forceExit);
    process.exit(1);
  };

  if (!httpServer || !httpServer.listening) {
    cleanup().then(finishOk).catch(finishErr);
    return;
  }

  httpServer.close((closeErr) => {
    if (closeErr) console.error('httpServer.close', closeErr);
    cleanup().then(finishOk).catch(finishErr);
  });
}

process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.once('SIGINT', () => gracefulShutdown('SIGINT'));

ensureOptionalColumns().finally(() => {
  try {
    const { warmupAttemptSubmitQueue } = require('./queues/attemptSubmitQueue');
    warmupAttemptSubmitQueue();
  } catch (e) {
    console.error('attempt_submit_queue_warmup', e && e.message);
  }
  httpServer = app.listen(port, () => {
    console.log(`MockTestApp API listening on http://0.0.0.0:${port}`);
    runSchedulerBootTick();
  });
});

