-- Daily Quiz: one row per user per question per calendar day (not one row per day).

ALTER TABLE daily_quiz_attempts
  DROP CONSTRAINT IF EXISTS daily_quiz_attempts_user_day_unique;

DROP INDEX IF EXISTS daily_quiz_attempts_user_day_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_quiz_attempts_user_day_item
  ON daily_quiz_attempts (user_id, quiz_day, item_id);
