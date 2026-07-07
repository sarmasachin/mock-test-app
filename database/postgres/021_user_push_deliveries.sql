-- Per-user push dedupe: at most one successful delivery per (user_id, dedupe_key).
-- Used by scheduled test-publish pushes and campaign sends.

CREATE TABLE IF NOT EXISTS user_push_deliveries (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dedupe_key VARCHAR(200) NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS idx_user_push_deliveries_dedupe_key
  ON user_push_deliveries (dedupe_key);
