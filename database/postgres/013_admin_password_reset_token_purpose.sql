-- Allow dedicated admin forgot-password OTP tokens.
-- Existing deployments created user_one_time_tokens with a narrower CHECK list.
ALTER TABLE user_one_time_tokens
DROP CONSTRAINT IF EXISTS user_one_time_tokens_purpose_check;

ALTER TABLE user_one_time_tokens
ADD CONSTRAINT user_one_time_tokens_purpose_check
CHECK (
  purpose IN (
    'email_verify',
    'password_reset',
    'phone_verify',
    'admin_password_reset'
  )
);

