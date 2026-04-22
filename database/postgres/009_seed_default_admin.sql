-- Seed one default admin user for fresh setup
-- Email: admin@mocktest.com
-- Mobile: (empty; login with email)
-- Password: Admin@1234

BEGIN;

DO $$
DECLARE
    chosen_id INTEGER;
BEGIN
    IF EXISTS (
        SELECT 1 FROM users WHERE email_normalized = lower(trim('admin@mocktest.com'))
    ) THEN
        UPDATE users
        SET
            is_admin = true,
            is_super_admin = true,
            display_name = 'Super Admin',
            phone = CASE WHEN phone = '' THEN '' ELSE phone END,
            signup_state = 'Himachal Pradesh',
            signup_district = 'Bilaspur',
            password_hash = '$2a$12$.Zd2JdjQnjgPiC44UgQIQ.ZV4EFlZiMUIdXEbmLDQy3FR39M0SsRq',
            updated_at = now()
        WHERE email_normalized = lower(trim('admin@mocktest.com'));
    ELSE
        LOOP
            chosen_id := 100000 + floor(random() * 900000)::int;
            BEGIN
                INSERT INTO users (
                    email,
                    password_hash,
                    display_name,
                    phone,
                    six_digit_public_id,
                    signup_state,
                    signup_district,
                    is_admin,
                    is_super_admin
                ) VALUES (
                    'admin@mocktest.com',
                    '$2a$12$.Zd2JdjQnjgPiC44UgQIQ.ZV4EFlZiMUIdXEbmLDQy3FR39M0SsRq',
                    'Super Admin',
                    '',
                    chosen_id,
                    'Himachal Pradesh',
                    'Bilaspur',
                    true,
                    true
                );
                EXIT;
            EXCEPTION
                WHEN unique_violation THEN
                    IF EXISTS (
                        SELECT 1 FROM users WHERE email_normalized = lower(trim('admin@mocktest.com'))
                    ) THEN
                        EXIT;
                    END IF;
            END;
        END LOOP;
    END IF;
END $$;

COMMIT;
