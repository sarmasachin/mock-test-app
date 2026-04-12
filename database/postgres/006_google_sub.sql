-- Link Google accounts (sub from ID token) to users

BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub VARCHAR(255);

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_google_sub_nonempty
    ON users (google_sub)
    WHERE google_sub IS NOT NULL AND trim(google_sub) <> '';

COMMIT;
