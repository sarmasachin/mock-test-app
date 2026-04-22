-- Admin control plane: global app settings, user bans, and audit logs

BEGIN;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS is_banned BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS ban_reason VARCHAR(200) NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS banned_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_is_banned
    ON users (is_banned)
    WHERE is_banned = true;

CREATE TABLE IF NOT EXISTS app_settings (
    setting_key      TEXT PRIMARY KEY,
    setting_value    TEXT NOT NULL,
    updated_by       UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO app_settings (setting_key, setting_value)
VALUES
    ('maintenanceMode', 'false'),
    ('maintenanceMessage', ''),
    ('registrationOpen', 'true')
ON CONFLICT (setting_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id               BIGSERIAL PRIMARY KEY,
    actor_user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
    action_type      TEXT NOT NULL,
    target_type      TEXT NOT NULL,
    target_id        TEXT,
    details_json     JSONB NOT NULL DEFAULT '{}'::jsonb,
    request_ip       TEXT NOT NULL DEFAULT '',
    user_agent       TEXT NOT NULL DEFAULT '',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created
    ON admin_audit_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_actor
    ON admin_audit_logs (actor_user_id, created_at DESC);

COMMIT;
