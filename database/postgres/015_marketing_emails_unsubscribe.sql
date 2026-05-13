-- Optional marketing / product email opt-out (OTP and security codes are NOT gated by this).
-- Safe on existing DBs (IF NOT EXISTS).

BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS marketing_emails_unsubscribed_at TIMESTAMPTZ NULL;

COMMIT;
