BEGIN;

ALTER TABLE tests
    ADD COLUMN IF NOT EXISTS exam_date DATE,
    ADD COLUMN IF NOT EXISTS total_marks INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS slot_label VARCHAR(80) NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS capacity_total INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS enrolled_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS attempts_allowed INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS language_mode VARCHAR(40) NOT NULL DEFAULT 'Bilingual',
    ADD COLUMN IF NOT EXISTS exam_mode VARCHAR(40) NOT NULL DEFAULT 'Practice',
    ADD COLUMN IF NOT EXISTS negative_marking_text VARCHAR(40) NOT NULL DEFAULT 'No',
    ADD COLUMN IF NOT EXISTS test_type_label VARCHAR(40) NOT NULL DEFAULT 'Full Mock',
    ADD COLUMN IF NOT EXISTS valid_until DATE,
    ADD COLUMN IF NOT EXISTS dynamic_date_enabled BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS date_cycle_days INTEGER NOT NULL DEFAULT 0;

ALTER TABLE tests
    DROP CONSTRAINT IF EXISTS tests_total_marks_non_negative,
    DROP CONSTRAINT IF EXISTS tests_capacity_total_non_negative,
    DROP CONSTRAINT IF EXISTS tests_enrolled_count_non_negative,
    DROP CONSTRAINT IF EXISTS tests_attempts_allowed_positive,
    DROP CONSTRAINT IF EXISTS tests_date_cycle_days_non_negative;

ALTER TABLE tests
    ADD CONSTRAINT tests_total_marks_non_negative CHECK (total_marks >= 0),
    ADD CONSTRAINT tests_capacity_total_non_negative CHECK (capacity_total >= 0),
    ADD CONSTRAINT tests_enrolled_count_non_negative CHECK (enrolled_count >= 0),
    ADD CONSTRAINT tests_attempts_allowed_positive CHECK (attempts_allowed > 0),
    ADD CONSTRAINT tests_date_cycle_days_non_negative CHECK (date_cycle_days >= 0);

COMMIT;
