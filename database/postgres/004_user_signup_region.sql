-- Optional signup fields (state / district) + unique non-empty phone for login-by-mobile

BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS signup_state VARCHAR(120) NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS signup_district VARCHAR(120) NOT NULL DEFAULT '';

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_phone_when_set
    ON users (phone)
    WHERE phone <> '';

COMMIT;
