-- Track when each question row was created (subcategory pool "new vs old" selection).
BEGIN;

ALTER TABLE questions
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_questions_created_at ON questions (created_at DESC);

COMMIT;
