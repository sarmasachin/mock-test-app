-- Seed one default admin user for fresh setup
-- Email: sharma.sachinctr@gmail.com
-- Mobile: (empty; login with email)
-- Password: commingsoon@123

BEGIN;

DO $$
DECLARE
    chosen_id INTEGER;
BEGIN
    -- Migrate earlier typo email to corrected email when safe.
    IF EXISTS (
        SELECT 1 FROM users WHERE email_normalized = lower(trim('sharma.sahchinctr@gmail.com'))
    ) AND NOT EXISTS (
        SELECT 1 FROM users WHERE email_normalized = lower(trim('sharma.sachinctr@gmail.com'))
    ) THEN
        UPDATE users
        SET email = 'sharma.sachinctr@gmail.com',
            updated_at = now()
        WHERE email_normalized = lower(trim('sharma.sahchinctr@gmail.com'));
    END IF;

    IF EXISTS (
        SELECT 1 FROM users WHERE email_normalized = lower(trim('sharma.sachinctr@gmail.com'))
    ) THEN
        UPDATE users
        SET
            is_admin = true,
            is_super_admin = true,
            display_name = 'Super Admin',
            phone = CASE WHEN phone = '' THEN '' ELSE phone END,
            signup_state = 'Himachal Pradesh',
            signup_district = 'Bilaspur',
            password_hash = '$2a$12$5ga0MwcBtZFOv0nS/qO7kO7mswiM9mfPw7QAQ2UhCuWPHdzWPkOge',
            updated_at = now()
        WHERE email_normalized = lower(trim('sharma.sachinctr@gmail.com'));
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
                    'sharma.sachinctr@gmail.com',
                    '$2a$12$5ga0MwcBtZFOv0nS/qO7kO7mswiM9mfPw7QAQ2UhCuWPHdzWPkOge',
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
                        SELECT 1 FROM users WHERE email_normalized = lower(trim('sharma.sachinctr@gmail.com'))
                    ) THEN
                        EXIT;
                    END IF;
            END;
        END LOOP;
    END IF;
END $$;

COMMIT;
