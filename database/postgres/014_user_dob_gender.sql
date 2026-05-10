-- Profile fields: date of birth + gender
--
-- Mirrors the columns the server already provisions at startup
-- (see server/src/index.js):
--   ALTER TABLE users ADD COLUMN IF NOT EXISTS date_of_birth DATE;
--   ALTER TABLE users ADD COLUMN IF NOT EXISTS gender VARCHAR(20) NOT NULL DEFAULT '';
--
-- This migration documents the same schema in the database/ source-of-truth
-- so fresh installs do not depend on the runtime ALTER TABLEs in index.js.
-- Safe to run on existing databases (idempotent via IF NOT EXISTS).

BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS date_of_birth DATE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS gender VARCHAR(20) NOT NULL DEFAULT '';

COMMIT;
