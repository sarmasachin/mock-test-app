-- MockTestApp — PostgreSQL initial schema (multi-user, production-oriented)
-- Run as: psql -U postgres -d mocktestapp -f 001_init.sql
-- Or: createdb mocktestapp && psql ... -f 001_init.sql

BEGIN;

CREATE TABLE IF NOT EXISTS users (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email                   VARCHAR(320) NOT NULL,
    email_normalized        VARCHAR(320) GENERATED ALWAYS AS (lower(trim(email))) STORED,
    password_hash           VARCHAR(255) NOT NULL,
    display_name            VARCHAR(120) NOT NULL DEFAULT '',
    phone                   VARCHAR(20) NOT NULL DEFAULT '',
    six_digit_public_id     INTEGER NOT NULL,
    email_verified_at       TIMESTAMPTZ,
    phone_verified_at       TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT users_email_normalized_unique UNIQUE (email_normalized),
    CONSTRAINT users_six_digit_public_id_unique UNIQUE (six_digit_public_id),
    CONSTRAINT users_six_digit_public_id_range CHECK (
        six_digit_public_id >= 100000 AND six_digit_public_id <= 999999
    ),
    CONSTRAINT users_phone_digits CHECK (phone = '' OR phone ~ '^[0-9]{10}$')
);

CREATE INDEX IF NOT EXISTS idx_users_created_at ON users (created_at DESC);

CREATE TABLE IF NOT EXISTS test_attempts (
    id                  BIGSERIAL PRIMARY KEY,
    user_id             UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    test_name           VARCHAR(512) NOT NULL,
    correct             INTEGER NOT NULL,
    total               INTEGER NOT NULL,
    completed_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT test_attempts_correct_nonneg CHECK (correct >= 0),
    CONSTRAINT test_attempts_total_positive CHECK (total > 0),
    CONSTRAINT test_attempts_correct_lte_total CHECK (correct <= total)
);

CREATE INDEX IF NOT EXISTS idx_test_attempts_user_completed
    ON test_attempts (user_id, completed_at DESC);

CREATE INDEX IF NOT EXISTS idx_test_attempts_user_test
    ON test_attempts (user_id, test_name);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

COMMIT;
