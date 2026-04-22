-- Daily Digest content store (Question of the Day + Fact of the Day)

BEGIN;

CREATE TABLE IF NOT EXISTS daily_digest_items (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_prompt     TEXT NOT NULL,
    option_a            TEXT NOT NULL,
    option_b            TEXT NOT NULL,
    option_c            TEXT NOT NULL,
    option_d            TEXT NOT NULL,
    correct_index       SMALLINT NOT NULL CHECK (correct_index BETWEEN 0 AND 3),
    fact_text           TEXT NOT NULL,
    is_published        BOOLEAN NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_daily_digest_items_published
    ON daily_digest_items (is_published, created_at DESC);

DROP TRIGGER IF EXISTS trg_daily_digest_items_updated_at ON daily_digest_items;
CREATE TRIGGER trg_daily_digest_items_updated_at
    BEFORE UPDATE ON daily_digest_items
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

COMMIT;
