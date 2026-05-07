'use strict';

/**
 * Must match admin-web `protectedSuperAdmin.ts`.
 * These users always keep super-admin in DB (see startup repair in `index.js`) and cannot be
 * demoted / banned / admin-deleted / self-deleted via API.
 */
const PROTECTED_SUPER_ADMIN_EMAIL_LIST = ['sharma.sachinctr@gmail.com', 'emergency864@gmail.com'];

const PROTECTED_SUPER_ADMIN_EMAILS = new Set(
  PROTECTED_SUPER_ADMIN_EMAIL_LIST.map((e) => String(e || '').trim().toLowerCase()),
);

function isProtectedSuperAdminDbEmail(rawEmail) {
  return PROTECTED_SUPER_ADMIN_EMAILS.has(String(rawEmail || '').trim().toLowerCase());
}

module.exports = {
  PROTECTED_SUPER_ADMIN_EMAIL_LIST,
  PROTECTED_SUPER_ADMIN_EMAILS,
  isProtectedSuperAdminDbEmail,
};
