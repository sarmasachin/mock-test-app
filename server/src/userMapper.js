'use strict';

function mapUserRow(row) {
  if (!row) return null;
  const normalizeBirthdayDate = (value) => {
    if (!value) return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      // `date_of_birth` is stored as a DATE (no timezone). The `pg` driver returns a JS Date;
      // using UTC (`toISOString`) can shift the calendar day for IST-style deployments.
      // Always emit a calendar date in the server's local timezone.
      const y = value.getFullYear();
      const m = String(value.getMonth() + 1).padStart(2, '0');
      const d = String(value.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    const s = String(value).trim();
    const m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
    return m ? m[1] : null;
  };
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    isAdmin: Boolean(row.is_admin),
    isSuperAdmin: Boolean(row.is_super_admin),
    phone: row.phone,
    birthdayDate: normalizeBirthdayDate(row.date_of_birth),
    sixDigitPublicId: row.six_digit_public_id,
    signupState: row.signup_state || '',
    signupDistrict: row.signup_district || '',
    gender: row.gender || '',
    emailVerifiedAt: row.email_verified_at,
    phoneVerifiedAt: row.phone_verified_at,
    createdAt: row.created_at,
    isBanned: Boolean(row.is_banned),
    banReason: row.ban_reason || '',
    bannedAt: row.banned_at || null,
  };
}

module.exports = { mapUserRow };

