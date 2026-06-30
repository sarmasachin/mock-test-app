-- RBAC Phase 1: per-admin permission grants (super admin has implicit full access in application code).

BEGIN;

CREATE TABLE IF NOT EXISTS admin_user_permissions (
    user_id          UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    permission_key   VARCHAR(64) NOT NULL,
    granted_by       UUID REFERENCES users (id) ON DELETE SET NULL,
    granted_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, permission_key),
    CONSTRAINT admin_user_permissions_key_nonempty CHECK (char_length(trim(permission_key)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_admin_user_permissions_user
    ON admin_user_permissions (user_id);

CREATE INDEX IF NOT EXISTS idx_admin_user_permissions_key
    ON admin_user_permissions (permission_key);

COMMIT;
