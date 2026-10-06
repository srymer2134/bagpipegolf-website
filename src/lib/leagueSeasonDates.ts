// Season dates at league creation — and why "days apart" is gone from
// the setup screen.
//
// THE OLD SHAPE. A league schedule stored three things: a start date,
// `intervalDays`, and a count. Every event date was COMPUTED as
// `start + k × interval`. That is fine for a Tuesday-night league and
// wrong for everything else: a monthly series cannot land on the third
// Saturday, and no director could move one event without moving all of
// them. Sam, 2026-10-05: "this is not a realistic or functional
// design."
//
// WHERE A DATE ACTUALLY LIVES. `public.league_weeks.week_of` — a real
// `date` column, one row per slot, `unique (league_id, week_of)`, and
// frozen by a trigger only once the week is bridged to a spine event.
// The table's own comment has said so since 20261013: *"A slot IS a
// date… Authority for slot → date; LeagueSchedule.startDate/
// intervalDays/eventCount are seed-only."*
//
// The bug was that only MATCH-PLAY leagues ever got week rows
// (`LeagueWeeksCard` returns nothing when `!league.isMatchPlay`), so a
// standard league had no row to hold a date and nothing to edit. The
// fix is not a new place to put dates — it is to use the one that
// already exists, for every league.
//
// So: the setup screen asks how many events and lets the director pick
// the dates they know. Those become `league_weeks` rows. Interval is
// demoted to an optional "space these out" helper, and the jsonb seed
// is still written so every existing reader keeps working.

export type SeasonDateProblem = { index: number; message: string };

/** `yyyy-MM-dd` as a plain calendar date, timezone-free. Returns null
 *  on anything else — `new Date('2026-04-15')` is UTC midnight, which
 *  is the 14th in every US timezone, so this never goes near Date. */
export function parseIsoDate(v: unknown): { y: number; m: number; d: number } | null {
  if (typeof v !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return { y, m: mo, d };
}

/** Days between two `yyyy-MM-dd` dates, or null if either is unusable.
 *  Uses Date.UTC on the parsed parts, so no local timezone is involved. */
export function daysBetween(a: string, b: string): number | null {
  const pa = parseIsoDate(a);
  const pb = parseIsoDate(b);
  if (!pa || !pb) return null;
  const ms = Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d);
  return Math.round(ms / 86_400_000);
}

/** Add days to a `yyyy-MM-dd`, returning the same format. */
export function addDays(iso: string, days: number): string {
  const p = parseIsoDate(iso);
  if (!p) return iso;
  const dt = new Date(Date.UTC(p.y, p.m - 1, p.d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** Evenly spaced dates from a first date — the optional helper that
 *  replaced the mandatory "days apart" field. */
export function spaceDates(first: string, count: number, everyDays: number): string[] {
  if (!parseIsoDate(first) || count < 1) return [];
  const step = Math.max(1, Math.round(everyDays));
  return Array.from({ length: Math.min(count, 52) }, (_, k) => addDays(first, step * k));
}

/** The dates a director actually filled in, with their slot index.
 *  Blanks are allowed and simply produce no week row — "dates if known
 *  at time of creation" means some may not be. */
export function datedSlots(dates: Array<string | null | undefined>):
  Array<{ slot: number; date: string }> {
  const out: Array<{ slot: number; date: string }> = [];
  dates.forEach((d, i) => {
    const s = typeof d === 'string' ? d.trim() : '';
    if (s && parseIsoDate(s)) out.push({ slot: i, date: s });
  });
  return out;
}

/** What would stop these dates from being stored. Duplicates are the
 *  one that matters: `league_weeks` has `unique (league_id, week_of)`,
 *  so two events on one day is a 23505 rather than a saved season. */
export function validateSeasonDates(
  dates: Array<string | null | undefined>,
): SeasonDateProblem[] {
  const out: SeasonDateProblem[] = [];
  const seen = new Map<string, number>();
  dates.forEach((raw, i) => {
    const s = typeof raw === 'string' ? raw.trim() : '';
    if (!s) return; // blank is allowed
    if (!parseIsoDate(s)) {
      out.push({ index: i, message: `Event ${i + 1} has an unreadable date.` });
      return;
    }
    const first = seen.get(s);
    if (first !== undefined) {
      out.push({
        index: i,
        message: `Events ${first + 1} and ${i + 1} are both on ${s}. ` +
          'Two events cannot share a date.',
      });
      return;
    }
    seen.set(s, i);
  });
  return out;
}

/** The `league_weeks` rows to insert for a new league. Only dated
 *  slots get a row — `week_of` is NOT NULL, so an undecided event has
 *  nowhere to be yet and is simply added later. */
export function weekRowsFor(
  leagueId: string,
  dates: Array<string | null | undefined>,
  extras: { courseId?: string | null; tee?: string | null; holes?: number | null } = {},
): Array<Record<string, unknown>> {
  return datedSlots(dates).map(({ slot, date }) => ({
    league_id: leagueId,
    slot_index: slot,
    week_of: date,
    ...(extras.courseId ? { course_id: extras.courseId } : {}),
    ...(extras.tee ? { tee: extras.tee } : {}),
    ...(extras.holes ? { holes: extras.holes } : {}),
  }));
}

/** The seed still written to `leagues.schedule`, so every existing
 *  reader keeps working while `league_weeks` becomes the authority.
 *  The interval is INFERRED from the first two dates rather than asked
 *  for; it is only ever a hint now. */
export function seedFromDates(
  dates: Array<string | null | undefined>,
  fallbackCount: number,
): { startDate: string; intervalDays: number; eventCount: number } | null {
  const dated = datedSlots(dates);
  const count = Math.max(fallbackCount, dates.length, dated.length);
  if (dated.length === 0) return null;
  const startDate = dated[0].date;
  let intervalDays = 7;
  if (dated.length >= 2) {
    const gap = daysBetween(dated[0].date, dated[1].date);
    const slots = dated[1].slot - dated[0].slot;
    if (gap !== null && gap > 0 && slots > 0) {
      intervalDays = Math.max(1, Math.min(365, Math.round(gap / slots)));
    }
  }
  return {
    startDate,
    intervalDays,
    eventCount: Math.max(1, Math.min(52, count)),
  };
}
