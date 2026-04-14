-- Expand user public-id range to allow more registrations.
-- Keeps existing 6-digit IDs valid and allows up to 8 digits.

BEGIN;

ALTER TABLE users
    DROP CONSTRAINT IF EXISTS users_six_digit_public_id_range;

ALTER TABLE users
    ADD CONSTRAINT users_six_digit_public_id_range CHECK (
        six_digit_public_id >= 100000 AND six_digit_public_id <= 99999999
    );

COMMIT;
