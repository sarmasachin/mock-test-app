-- Daily Quiz batch submit: multiple question rows share one client_submission_id.
-- The old UNIQUE (user_id, client_submission_id) index blocked the 2nd+ INSERT in POST /attempts/batch.

BEGIN;

DROP INDEX IF EXISTS idx_daily_quiz_attempts_client_submission;

CREATE INDEX IF NOT EXISTS idx_daily_quiz_attempts_client_submission_lookup
  ON daily_quiz_attempts (user_id, client_submission_id)
  WHERE client_submission_id IS NOT NULL AND trim(client_submission_id) <> '';

COMMIT;
