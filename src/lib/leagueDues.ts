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
// WHO WRITES THEM. Both clients. The app's League → ☰ → "Set season
// dues…" sheet, and the Manage page's generated settings form, whose
// "Season dues" section (`#settings-dues`) posts to
// `/api/leagues/[id]/config` (Sam approved the web half 2026-10-22).
// That route checks the two columns with `validateDuesPatch` below
// before the write, because the generated rules do not carry
// `leagues_dues_cents_chk` and a bad value would otherwise surface as
// a raw Postgres error.
//
// Mirrors the Dart helpers in
// `lib/features/leagues/widgets/league_dues_dialog.dart` so the two
// surfaces render the same league the same way.

/** Ceiling on a typed dues amount: $100,000. A sanity bound, not a
 *  business rule — it stops a fat-fingered extra zero (or six), and it
 *  keeps the value well inside Postgres `integer`. Used for both the
 *  league amount (`leagues.dues_cents`) and a member's own override
 *  (`league_members.dues_cents`). */
export const MAX_DUES_CENTS = 10_000_000;

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

/**
 * Server-side check of the two dues columns in a settings patch — the
 * same rules the app applies, plus the database's.
 *
 *   dues_cents     integer cents, 0…MAX_DUES_CENTS. 0 = no season dues
 *                  (what a blank box means, in the app and here).
 *                  `leagues_dues_cents_chk` is `>= 0`; the app's
 *                  `duesCentsFromInput` rounds dollars to whole cents
 *                  and clamps at 0, so a fraction of a cent or a
 *                  negative never reaches the database from either
 *                  client.
 *   dues_due_date  null (no date — distinct from "due now", per the
 *                  column comment) or a real `yyyy-MM-dd` calendar day.
 *
 * Returns the first problem (its column and a sentence), or null when
 * the patch is fine. Keys other than these two are not looked at.
 */
export function validateDuesPatch(
  patch: Record<string, unknown>,
): { field: 'dues_cents' | 'dues_due_date'; message: string } | null {
  const cents = (message: string) => ({ field: 'dues_cents' as const, message });
  if ('dues_cents' in patch) {
    const c = patch.dues_cents;
    if (typeof c !== 'number' || !Number.isFinite(c)) {
      return cents('Season dues must be an amount in dollars.');
    }
    if (!Number.isInteger(c)) return cents('Season dues must be a whole number of cents.');
    if (c < 0) return cents('Season dues cannot be negative.');
    if (c > MAX_DUES_CENTS) return cents('That season dues amount is too large.');
  }
  if ('dues_due_date' in patch) {
    const d = patch.dues_due_date;
    if (d !== null && !isCalendarDate(d)) {
      return { field: 'dues_due_date', message: 'The dues date is not a real date.' };
    }
  }
  return null;
}

/** `"2026-04-15"` and nothing else: four-digit year, and a day that
 *  exists (no Feb 30). */
function isCalendarDate(v: unknown): boolean {
  if (typeof v !== 'string') return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  const [y, mo, da] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 1900 || mo < 1 || mo > 12 || da < 1) return false;
  const t = new Date(Date.UTC(y, mo - 1, da));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === da;
}
