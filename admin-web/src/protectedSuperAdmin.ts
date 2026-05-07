/** Must match server: `PROTECTED_SUPER_ADMIN_EMAILS` in `server/src/routes/admin.js`. */

const PROTECTED_SUPER_ADMIN_EMAILS = ['sharma.sachinctr@gmail.com', 'emergency864@gmail.com'] as const;

export function isProtectedSuperAdminEmail(email: string | null | undefined): boolean {
  const k = String(email || '')
    .trim()
    .toLowerCase();
  return PROTECTED_SUPER_ADMIN_EMAILS.some((e) => e.trim().toLowerCase() === k);
}
