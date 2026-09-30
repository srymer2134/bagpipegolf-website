// Bagpipe Golf admin allowlist.
//
// Mirrors `kFairwayiqAdminEmails` in the Flutter repo
// (`lib/core/services/uat_tourney_group_service.dart`). Kept as a
// literal rather than fetched, because the surfaces it gates are
// internal pages that must fail CLOSED if anything about the session
// is unexpected.
//
// If you change this list, change it in both repos.
export const ADMIN_EMAILS: readonly string[] = [
  'sonofahero2@gmail.com',
  'swrymer@gmail.com',
  'cjkeefe@comcast.net',
  'yerapat@gmail.com',
  'nwrymer10@gmail.com',
];

/**
 * Case-insensitive allowlist check. Trims first, so a stray space on
 * `auth.email` doesn't lock an admin out — same normalization the
 * Flutter side does.
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const norm = email.trim().toLowerCase();
  if (!norm) return false;
  return ADMIN_EMAILS.some((e) => e.toLowerCase() === norm);
}
