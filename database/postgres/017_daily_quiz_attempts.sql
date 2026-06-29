-- MockTestApp — Daily Quiz attempts (separate from test_attempts / mock tests)
-- Depends on: 001_init.sql

BEGIN;

CREATE TABLE IF NOT EXISTS daily_quiz_attempts (
    id                      BIGSERIAL PRIMARY KEY,
    user_id                 UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    quiz_day                DATE NOT NULL,
    item_id                 VARCHAR(80) NOT NULL,
    selected_option_index   SMALLINT CHECK (
        selected_option_index IS NULL
        OR (selected_option_index >= 0 AND selected_option_index <= 3)
    ),
    correct_index           SMALLINT NOT NULL CHECK (correct_index >= 0 AND correct_index <= 3),
    is_correct              BOOLEAN NOT NULL DEFAULT false,
    time_taken_seconds      INTEGER NOT NULL DEFAULT 0 CHECK (
        time_taken_seconds >= 0 AND time_taken_seconds <= 86400
    ),
    question_prompt         TEXT NOT NULL DEFAULT '',
    options_json            JSONB NOT NULL DEFAULT '[]'::jsonb,
    explanation             TEXT NOT NULL DEFAULT '',
    client_submission_id    VARCHAR(120),
    submitted_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT daily_quiz_attempts_user_day_unique UNIQUE (user_id, quiz_day)
);

CREATE INDEX IF NOT EXISTS idx_daily_quiz_attempts_user_submitted
    ON daily_quiz_attempts (user_id, submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_daily_quiz_attempts_quiz_day
    ON daily_quiz_attempts (quiz_day, is_correct, time_taken_seconds);

CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_quiz_attempts_client_submission
    ON daily_quiz_attempts (user_id, client_submission_id)
    WHERE client_submission_id IS NOT NULL AND trim(client_submission_id) <> '';

COMMIT;
