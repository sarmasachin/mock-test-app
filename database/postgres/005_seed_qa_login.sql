-- QA login for device testing (run after 001–004).
-- Mobile: 9817585270   Password: 123456
-- Skips insert if that phone or the reserved public id already exists.

BEGIN;

INSERT INTO users (
    email,
    password_hash,
    display_name,
    phone,
    six_digit_public_id,
    signup_state,
    signup_district
)
SELECT
    'qa9817585270@mocktest.local',
    '$2a$12$jX56hgCA8XziZPo27td65ezmbLv6pNoRX3qJtsOTdcdN1EUwzP6/u',
    'QA Tester',
    '9817585270',
    873421,
    '',
    ''
WHERE NOT EXISTS (SELECT 1 FROM users WHERE phone = '9817585270')
  AND NOT EXISTS (SELECT 1 FROM users WHERE six_digit_public_id = 873421);

-- If this phone already existed (older seed), still set password to 123456 for local QA.
UPDATE users
SET password_hash = '$2a$12$jX56hgCA8XziZPo27td65ezmbLv6pNoRX3qJtsOTdcdN1EUwzP6/u'
WHERE phone = '9817585270';

COMMIT;
