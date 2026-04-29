'use strict';

function mapUserRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    isAdmin: Boolean(row.is_admin),
    isSuperAdmin: Boolean(row.is_super_admin),
    phone: row.phone,
    birthdayDate: row.date_of_birth ? String(row.date_of_birth).slice(0, 10) : null,
    sixDigitPublicId: row.six_digit_public_id,
    signupState: row.signup_state || '',
    signupDistrict: row.signup_district || '',
    emailVerifiedAt: row.email_verified_at,
    phoneVerifiedAt: row.phone_verified_at,
    createdAt: row.created_at,
    isBanned: Boolean(row.is_banned),
    banReason: row.ban_reason || '',
    bannedAt: row.banned_at || null,
  };
}

module.exports = { mapUserRow };

