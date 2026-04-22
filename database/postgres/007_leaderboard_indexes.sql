-- Leaderboard query optimization
-- Apply after 006_*.sql

BEGIN;

CREATE INDEX IF NOT EXISTS idx_test_attempts_leaderboard_time
    ON test_attempts (completed_at DESC);

CREATE INDEX IF NOT EXISTS idx_test_attempts_leaderboard_catalog_time
    ON test_attempts (test_catalog_id, completed_at DESC);

CREATE INDEX IF NOT EXISTS idx_users_signup_state
    ON users (signup_state)
    WHERE signup_state <> '';

CREATE INDEX IF NOT EXISTS idx_users_signup_district
    ON users (signup_district)
    WHERE signup_district <> '';

COMMIT;
