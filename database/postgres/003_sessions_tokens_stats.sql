-- MockTestApp — auth tokens, per-question answers, prefs, achievements, stats, devices
-- Depends on: 001_init.sql, 002_feeds_tests_quizzes.sql

BEGIN;

-- ---------------------------------------------------------------------------
-- Per-question responses (requires test_attempts.test_catalog_id set)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS attempt_question_responses (
    id                  BIGSERIAL PRIMARY KEY,
    attempt_id          BIGINT NOT NULL REFERENCES test_attempts (id) ON DELETE CASCADE,
    question_id         BIGINT NOT NULL REFERENCES questions (id) ON DELETE CASCADE,
    selected_index      SMALLINT NOT NULL CHECK (selected_index BETWEEN 0 AND 3),
    answered_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT attempt_question_responses_unique UNIQUE (attempt_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_attempt_question_responses_attempt
    ON attempt_question_responses (attempt_id);

CREATE OR REPLACE FUNCTION validate_attempt_question_response()
RETURNS TRIGGER AS $$
DECLARE
    acat UUID;
    qtest UUID;
BEGIN
    SELECT test_catalog_id INTO acat FROM test_attempts WHERE id = NEW.attempt_id;
    SELECT test_id INTO qtest FROM questions WHERE id = NEW.question_id;
    IF acat IS NULL THEN
        RAISE EXCEPTION 'Set test_attempts.test_catalog_id before saving per-question rows (attempt_id=%)',
            NEW.attempt_id;
    END IF;
    IF qtest IS DISTINCT FROM acat THEN
        RAISE EXCEPTION 'question_id % does not belong to test for attempt_id %',
            NEW.question_id, NEW.attempt_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_attempt_question_responses_validate ON attempt_question_responses;
CREATE TRIGGER trg_attempt_question_responses_validate
    BEFORE INSERT OR UPDATE ON attempt_question_responses
    FOR EACH ROW
    EXECUTE FUNCTION validate_attempt_question_response();

-- ---------------------------------------------------------------------------
-- Refresh sessions (store hash only, never raw refresh token)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_refresh_sessions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    refresh_token_hash  VARCHAR(128) NOT NULL,
    device_label        VARCHAR(200) NOT NULL DEFAULT '',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at          TIMESTAMPTZ NOT NULL,
    revoked_at          TIMESTAMPTZ,
    CONSTRAINT user_refresh_sessions_expires_after_created CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS idx_user_refresh_sessions_user ON user_refresh_sessions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_refresh_sessions_lookup
    ON user_refresh_sessions (user_id, refresh_token_hash)
    WHERE revoked_at IS NULL;

-- ---------------------------------------------------------------------------
-- One-time tokens (email verify, password reset, phone verify)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_one_time_tokens (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    purpose             TEXT NOT NULL CHECK (purpose IN (
                            'email_verify', 'password_reset', 'phone_verify'
                        )),
    token_hash          VARCHAR(128) NOT NULL,
    expires_at          TIMESTAMPTZ NOT NULL,
    used_at             TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_one_time_tokens_lookup
    ON user_one_time_tokens (purpose, token_hash)
    WHERE used_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_one_time_tokens_user_purpose
    ON user_one_time_tokens (user_id, purpose, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_one_time_tokens_cleanup
    ON user_one_time_tokens (expires_at)
    WHERE used_at IS NULL;

-- ---------------------------------------------------------------------------
-- Mirrors DataStore prefs (sync when user logs in on a new device)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_app_preferences (
    user_id                     UUID PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    streak_days                 INTEGER NOT NULL DEFAULT 0 CHECK (streak_days >= 0),
    last_digest_day             VARCHAR(32) NOT NULL DEFAULT '',
    last_opened_test_name       VARCHAR(512) NOT NULL DEFAULT '',
    last_opened_test_millis     BIGINT NOT NULL DEFAULT 0,
    last_feed_job_url           TEXT NOT NULL DEFAULT '',
    last_feed_exam_url          TEXT NOT NULL DEFAULT '',
    last_feed_news_url          TEXT NOT NULL DEFAULT '',
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT user_app_preferences_streak_reasonable CHECK (streak_days <= 100000)
);

DROP TRIGGER IF EXISTS trg_user_app_preferences_updated_at ON user_app_preferences;
CREATE TRIGGER trg_user_app_preferences_updated_at
    BEFORE UPDATE ON user_app_preferences
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Achievement badges (app slugs: streak3, streak7, fullmarks, …)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_achievements (
    user_id         UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    slug            VARCHAR(64) NOT NULL,
    unlocked_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_user_achievements_user ON user_achievements (user_id, unlocked_at DESC);

-- ---------------------------------------------------------------------------
-- Aggregate stats for leaderboards / profile (maintain via API or triggers)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_stats (
    user_id                     UUID PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    total_completed_attempts    INTEGER NOT NULL DEFAULT 0 CHECK (total_completed_attempts >= 0),
    best_score_percent          INTEGER NOT NULL DEFAULT 0 CHECK (
                                    best_score_percent BETWEEN 0 AND 100
                                ),
    lifetime_points             BIGINT NOT NULL DEFAULT 0,
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_user_stats_updated_at ON user_stats;
CREATE TRIGGER trg_user_stats_updated_at
    BEFORE UPDATE ON user_stats
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_user_stats_leaderboard
    ON user_stats (lifetime_points DESC, best_score_percent DESC);

-- ---------------------------------------------------------------------------
-- Push (FCM) device registration
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_devices (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    fcm_token       VARCHAR(512) NOT NULL,
    platform        VARCHAR(20) NOT NULL DEFAULT 'android',
    last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT user_devices_platform_ok CHECK (
        lower(platform) IN ('android', 'ios', 'web', 'unknown')
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_devices_token ON user_devices (fcm_token);
CREATE INDEX IF NOT EXISTS idx_user_devices_user ON user_devices (user_id, last_seen_at DESC);

-- ---------------------------------------------------------------------------
-- Auto-create prefs + stats for every new user
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_user_default_rows()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO user_app_preferences (user_id) VALUES (NEW.id)
        ON CONFLICT (user_id) DO NOTHING;
    INSERT INTO user_stats (user_id) VALUES (NEW.id)
        ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_default_rows ON users;
CREATE TRIGGER trg_users_default_rows
    AFTER INSERT ON users
    FOR EACH ROW
    EXECUTE FUNCTION create_user_default_rows();

-- Backfill existing users (if 003 applied on DB that already had users)
INSERT INTO user_app_preferences (user_id)
SELECT u.id FROM users u
WHERE NOT EXISTS (SELECT 1 FROM user_app_preferences p WHERE p.user_id = u.id);

INSERT INTO user_stats (user_id)
SELECT u.id FROM users u
WHERE NOT EXISTS (SELECT 1 FROM user_stats s WHERE s.user_id = u.id);

-- Keep user_stats in sync when a row is inserted into test_attempts
CREATE OR REPLACE FUNCTION bump_user_stats_after_attempt()
RETURNS TRIGGER AS $$
DECLARE
    pct INTEGER;
BEGIN
    pct := round(NEW.correct * 100.0 / NEW.total)::INTEGER;
    INSERT INTO user_stats (
        user_id,
        total_completed_attempts,
        best_score_percent,
        lifetime_points,
        updated_at
    ) VALUES (
        NEW.user_id,
        1,
        pct,
        NEW.correct::BIGINT,
        now()
    )
    ON CONFLICT (user_id) DO UPDATE SET
        total_completed_attempts = user_stats.total_completed_attempts + 1,
        best_score_percent = greatest(user_stats.best_score_percent, pct),
        lifetime_points = user_stats.lifetime_points + NEW.correct::BIGINT,
        updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_test_attempts_bump_stats ON test_attempts;
CREATE TRIGGER trg_test_attempts_bump_stats
    AFTER INSERT ON test_attempts
    FOR EACH ROW
    EXECUTE FUNCTION bump_user_stats_after_attempt();

COMMIT;
