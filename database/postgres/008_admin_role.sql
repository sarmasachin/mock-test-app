-- Add admin role support

BEGIN;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_users_is_admin ON users (is_admin) WHERE is_admin = true;
CREATE INDEX IF NOT EXISTS idx_users_is_super_admin ON users (is_super_admin) WHERE is_super_admin = true;

COMMIT;
