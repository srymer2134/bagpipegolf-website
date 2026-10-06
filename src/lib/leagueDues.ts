// Season dues — formatting only. The numbers live on `leagues`
// (`dues_cents` integer NOT NULL default 0, `dues_due_date` date
// nullable; `20261025_league_season_dues.sql`).
//
// This is the OBLIGATION — what a member owes for the season. Nothing
// here says who has paid; that is a payments-table question
// (fairwayiq-flutter `docs/plans/STRIPE_CONNECT_IMPLEMENTATION_PLAN.md`,
// where `season_dues` is one of the two kinds a card may be charged
// for).
//
// The app sets dues; this site shows them. That split is the manage
// page's own stated rule ("This page reads; the app writes"), not an
// oversight — a second editor would mean two validation paths into one
// league's configuration.
//
// Mirrors the Dart helpers in
// `lib/features/leagues/widgets/league_dues_dialog.dart` so the two
// surfaces render the same league the same way.

/** `4500` → `"$45"`, `4550` → `"$45.50"`. Null when there are no dues,
 *  so a caller can drop the whole row instead of rendering `$0`. */
export function formatDuesCents(cents: unknown): string | null {
  const n = typeof cents === 'number' ? cents : Number(cents);
  if (!Number.isFinite(n) || n <= 0) return null;
  const whole = Math.round(n);
  return whole % 100 === 0
    ? `$${whole / 100}`
    : `$${(whole / 100).toFixed(2)}`;
}

/** `"2026-04-15"` → `"Apr 15"`. Null on empty or unparseable input, so
 *  a bad value renders as no date rather than as raw text. */
export function formatDuesDueDate(iso: unknown): string | null {
  if (typeof iso !== 'string' || iso.trim() === '') return null;
  // Parse the date parts directly. `new Date('2026-04-15')` is UTC
  // midnight, which renders as the 14th anywhere west of Greenwich —
  // and every one of our leagues is.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!m) return null;
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  return `${months[month - 1]} ${day}`;
}

/** The one line the manage page shows: `"$45 · due Apr 15"`, `"$45"`,
 *  or null when the league charges no season dues. */
export function formatDuesLine(cents: unknown, iso: unknown): string | null {
  const amount = formatDuesCents(cents);
  if (amount === null) return null;
  const due = formatDuesDueDate(iso);
  return due === null ? amount : `${amount} · due ${due}`;
}
