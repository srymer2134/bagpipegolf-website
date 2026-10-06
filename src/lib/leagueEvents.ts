// A league event is a tournament — this is the bridge the website
// never had.
//
// `leagues.schedule.bindings` has mapped slot → `tournaments.id` since
// roadmap #20, and the website typed it and then never read it. So a
// league director could see that week 4 exists and had no way to reach
// the tournament that *is* week 4, even though this site already has a
// full set of director pages for one (manage, pairings, competitions,
// leaderboard, payouts).
//
// ── The question this answers in the product ───────────────────
// "What happens if a league has a match play event in the middle of
// the season?" It works, and it has since roadmap #26 — but only in
// the app, because nothing on the web could see or set a week's
// format. The rules, from `LEAGUE_MODE_DECISIONS.md`:
//
//   • FORMAT is per week (`schedule.formats[slot]`), POINTS are per
//     season (`leagues.points_model`). A position league can play one
//     week as match play and still rank the season by finishing
//     position. Season standings stay on one unified points model
//     regardless of weekly format.
//   • The BOUND TOURNAMENT drives actual scoring for that week. The
//     format here is the commissioner's declaration — for display, and
//     for the caveat below.
//   • The one case that needs care is a STROKE-AGGREGATE league. A
//     scramble or best-ball week plays to one low team score, which is
//     not comparable to an individual stroke total, so adding it to a
//     season of individual rounds is misleading. The documented
//     guardrail is LABELLING ONLY: the math still runs, and the
//     standings say so. Deliberately not auto-resolved server-side.
//     Match play is NOT in that set — a match-play week still produces
//     an individual gross score per player.

import type { SupabaseClient } from '@supabase/supabase-js';
import { myLeagues, type LeagueSchedule } from './leaguePortal';

export type WeekFormat =
  | 'stroke_play'
  | 'scramble'
  | 'best_ball'
  | 'stableford'
  | 'match_play'
  | 'other';

/** The vocabulary, mirroring Dart's `LeagueWeekFormat` wire values so
 *  a week declared on the web reads the same in the app. */
export const WEEK_FORMATS: Array<{
  wire: WeekFormat;
  label: string;
  help: string;
  /** Plays to one low team score, so its strokes are not comparable
   *  to an individual round. Drives the stroke-aggregate caveat. */
  isTeam: boolean;
}> = [
  {
    wire: 'stroke_play',
    label: 'Stroke play',
    help: 'Everyone plays their own ball and counts every stroke.',
    isTeam: false,
  },
  {
    wire: 'stableford',
    label: 'Stableford',
    help: 'Points per hole against a target, so a blow-up hole costs less.',
    isTeam: false,
  },
  {
    wire: 'match_play',
    label: 'Match play',
    help: 'Hole by hole against an opponent. Fine mid-season — the week is scored as a match, the season still ranks on your league’s points model.',
    isTeam: false,
  },
  {
    wire: 'best_ball',
    label: 'Best ball',
    help: 'Partners play their own ball; the better score counts.',
    isTeam: true,
  },
  {
    wire: 'scramble',
    label: 'Scramble',
    help: 'One team ball from the best shot each time.',
    isTeam: true,
  },
  {
    wire: 'other',
    label: 'Other',
    help: 'Recorded for the schedule; scoring comes from the event itself.',
    isTeam: false,
  },
];

const BY_WIRE = new Map(WEEK_FORMATS.map((f) => [f.wire, f]));

export function formatLabel(wire: string | null | undefined): string | null {
  if (!wire) return null;
  return BY_WIRE.get(wire as WeekFormat)?.label ?? null;
}

export function formatHelp(wire: string | null | undefined): string | null {
  if (!wire) return null;
  return BY_WIRE.get(wire as WeekFormat)?.help ?? null;
}

export function isTeamFormat(wire: string | null | undefined): boolean {
  return !!wire && (BY_WIRE.get(wire as WeekFormat)?.isTeam ?? false);
}

/** Only the formats the generator knows, so a stray value from an
 *  older client cannot be written back as if it were valid. */
export function sanitiseFormats(
  raw: Array<string | null | undefined>,
): Record<string, string> {
  const out: Record<string, string> = {};
  raw.forEach((v, i) => {
    const s = typeof v === 'string' ? v.trim() : '';
    if (s && BY_WIRE.has(s as WeekFormat)) out[String(i)] = s;
  });
  return out;
}

/** Stored map → one value per slot, '' where undeclared. */
export function formatsToList(
  map: Record<string, string> | null | undefined,
  count: number,
): string[] {
  const n = Math.max(0, Math.min(52, count));
  return Array.from({ length: n }, (_, i) => map?.[String(i)] ?? '');
}

/**
 * The stroke-aggregate mixed-format caveat, mirroring the app's guard.
 * Null when it does not apply. Labelling only — nothing is blocked.
 */
export function mixedFormatCaveat(
  pointsModel: string | null | undefined,
  formats: Record<string, string> | null | undefined,
): string | null {
  if (pointsModel !== 'stroke_aggregate') return null;
  const declared = Object.values(formats ?? {}).filter(Boolean);
  const distinct = new Set(declared);
  if (distinct.size < 2) return null;
  if (![...distinct].some((f) => isTeamFormat(f))) return null;
  const teamOnes = [...distinct]
    .filter((f) => isTeamFormat(f))
    .map((f) => formatLabel(f) ?? f);
  return `This season adds strokes across events, and ${teamOnes.join(' and ')} ` +
    `plays to one low team score — those totals are not comparable to an ` +
    `individual round. The standings still add them up; read them with that ` +
    `in mind.`;
}

// ── The bound tournament ────────────────────────────────────

export type BoundTournament = {
  id: string;
  name: string;
  user_id: string;
  completed_at: string | null;
};

/**
 * The tournaments bound to a league's slots.
 *
 * Readable by anyone signed in: `tournaments` carries a public SELECT
 * policy for the leaderboard, so a league member sees the event's name
 * whether or not they own it. WRITING is still `user_id = auth.uid()`,
 * which is why `canManage` exists below rather than assuming a league
 * commissioner may edit every event in their season.
 */
export async function fetchBoundTournaments(
  supabase: SupabaseClient,
  bindings: Record<string, string> | null | undefined,
): Promise<Map<string, BoundTournament>> {
  const ids = [...new Set(Object.values(bindings ?? {}).filter(Boolean))];
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase
    .from('tournaments')
    .select('id, name, user_id, completed_at')
    .in('id', ids);
  if (error) {
    console.error('[fetchBoundTournaments]', error);
    return new Map();
  }
  return new Map(
    ((data ?? []) as BoundTournament[]).map((t) => [t.id, t]),
  );
}

export type LeagueEventRow = {
  slot: number;
  /** `yyyy-MM-dd`, or '' when the date is not set yet. */
  date: string;
  /** The commissioner's name for the event, or "Event N". */
  name: string;
  /** Declared format wire value, or '' when undeclared. */
  format: string;
  tournament: BoundTournament | null;
  /** True when the signed-in user may edit that tournament. */
  canManage: boolean;
  completed: boolean;
  /** "4 in · 1 out", or null when nobody has answered. */
  rsvp: string | null;
};

/** Everything the schedule page needs to render one row per event. */
export function buildEventRows(opts: {
  count: number;
  dates: string[];
  names: Record<string, string> | null | undefined;
  formats: Record<string, string> | null | undefined;
  bindings: Record<string, string> | null | undefined;
  tournaments: Map<string, BoundTournament>;
  viewerId: string | null;
  /** Per-slot RSVP tallies, from `fetchSignupCounts`. */
  signups?: Map<number, { in: number; out: number }>;
}): LeagueEventRow[] {
  const n = Math.max(0, Math.min(52, opts.count));
  return Array.from({ length: n }, (_, i) => {
    const key = String(i);
    const tid = opts.bindings?.[key];
    const t = (tid && opts.tournaments.get(tid)) || null;
    const named = opts.names?.[key]?.trim();
    return {
      slot: i,
      date: opts.dates[i] ?? '',
      name: named && named.length ? named : `Event ${i + 1}`,
      format: opts.formats?.[key] ?? '',
      tournament: t,
      // Writing a tournament is `user_id = auth.uid()`. A league
      // commissioner who did not create the event can read it and not
      // edit it — widening that is a schema decision, not a UI one.
      canManage: !!t && !!opts.viewerId && t.user_id === opts.viewerId,
      completed: !!t?.completed_at,
      rsvp: rsvpSummary(opts.signups?.get(i)),
    };
  });
}

// ── The reverse direction: which league is this tournament? ─────
//
// There is no `tournaments.league_id`. The binding lives only in
// `leagues.schedule.bindings`, which is the right call — a tournament
// is a standalone thing that a season may point at — but it means the
// lookup from a tournament back to its league is a scan, not a join.
//
// The scan is over THIS USER'S leagues, which is both small and the
// only set that matters: the banner exists so a league director opening
// week 4 knows it is week 4. Someone who runs the tournament and is not
// in the league sees no banner, which is honest — as far as their
// account is concerned it is just a tournament.
export type LeagueEventContext = {
  leagueId: string;
  leagueName: string;
  slot: number;
  /** The commissioner's name for the event, or "Event N". */
  eventName: string;
  /** Declared week format, or '' when undeclared. */
  format: string;
  pointsModel: string | null;
  /** True when this viewer runs the league. */
  isLeagueDirector: boolean;
};

/** What `findBinding` needs from each of the viewer's leagues. */
export type LeagueBindingSource = {
  id: string;
  name: string;
  points_model: string | null;
  role: string;
  schedule: {
    bindings?: Record<string, string>;
    names?: Record<string, string>;
    formats?: Record<string, string>;
  } | null;
};

/** The slot a tournament is bound to, or null. Pure, so it is tested. */
export function findBinding(
  leagues: LeagueBindingSource[],
  tournamentId: string,
): LeagueEventContext | null {
  for (const l of leagues) {
    const bindings = l.schedule?.bindings ?? {};
    for (const [slotKey, boundId] of Object.entries(bindings)) {
      if (boundId !== tournamentId) continue;
      const slot = Number(slotKey);
      if (!Number.isInteger(slot) || slot < 0) continue;
      const named = l.schedule?.names?.[slotKey]?.trim();
      return {
        leagueId: l.id,
        leagueName: l.name,
        slot,
        eventName: named && named.length ? named : `Event ${slot + 1}`,
        format: l.schedule?.formats?.[slotKey] ?? '',
        pointsModel: l.points_model,
        isLeagueDirector: l.role === 'commissioner',
      };
    }
  }
  return null;
}

/** The viewer's own tournaments, for the bind picker. Owner-scoped
 *  because binding one you cannot edit would produce a season whose
 *  events nobody in the league can manage. */
export async function fetchMyTournaments(
  supabase: SupabaseClient,
  userId: string,
  limit = 60,
): Promise<Array<{ id: string; name: string; completed_at: string | null }>> {
  const { data, error } = await supabase
    .from('tournaments')
    .select('id, name, completed_at, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('[fetchMyTournaments]', error);
    return [];
  }
  return ((data ?? []) as Array<Record<string, unknown>>).map((t) => ({
    id: String(t.id),
    name: String(t.name ?? 'Tournament'),
    completed_at: (t.completed_at as string | null) ?? null,
  }));
}

/**
 * The league event this tournament IS, for the viewer, or null.
 *
 * Two queries and a scan, because there is no `tournaments.league_id`
 * to join on — see the note above `LeagueEventContext`. The scan is
 * over the leagues this user belongs to or runs, which is the only set
 * the banner can honestly speak about.
 */
export async function leagueEventFor(
  supabase: SupabaseClient,
  userId: string | null | undefined,
  tournamentId: string | null | undefined,
): Promise<LeagueEventContext | null> {
  if (!userId || !tournamentId) return null;
  try {
    const mine = await myLeagues(supabase, userId);
    if (mine.length === 0) return null;
    const { data, error } = await supabase
      .from('leagues')
      .select('id, schedule')
      .in('id', mine.map((l) => l.id));
    if (error) {
      console.error('[leagueEventFor]', error);
      return null;
    }
    const schedules = new Map(
      ((data ?? []) as Array<{ id: string; schedule: LeagueSchedule | null }>)
        .map((r) => [String(r.id), r.schedule ?? null]),
    );
    return findBinding(
      mine.map((l) => ({
        id: l.id,
        name: l.name,
        points_model: l.points_model,
        role: l.role,
        schedule: schedules.get(l.id) ?? null,
      })),
      tournamentId,
    );
  } catch (err) {
    // A banner is never worth failing a page for.
    console.error('[leagueEventFor] failed', err);
    return null;
  }
}

/**
 * How many members said yes and no, per slot.
 *
 * Shown on each event card because an RSVP and a tournament roster are
 * two different lists, and a director needs to see when they disagree.
 *
 * NOTE, deliberately not automated here: the app, on binding a
 * tournament to a slot, tries to add every `'in'` RSVP to that
 * tournament's field (`LeagueSignupsNotifier.backfillBoundSlot`). That
 * path goes through Railway `POST /api/tournaments/:id/add-player`,
 * which stamps `userId: req.userId` — the CALLER — and whose RPC is
 * idempotent on the caller's id. A director backfilling four members
 * therefore adds one player row carrying the director's identity and
 * silently skips the rest. Mirroring that from the web would mirror the
 * bug, so this surface reports the numbers and lets the director add
 * the field through the tournament roster editor, which writes each
 * player's own `userId`.
 */
export async function fetchSignupCounts(
  supabase: SupabaseClient,
  leagueId: string,
): Promise<Map<number, { in: number; out: number }>> {
  const out = new Map<number, { in: number; out: number }>();
  const { data, error } = await supabase
    .from('league_signups')
    .select('slot_index, status')
    .eq('league_id', leagueId);
  if (error) {
    console.error('[fetchSignupCounts]', error);
    return out;
  }
  for (const r of (data ?? []) as Array<{ slot_index: number; status: string | null }>) {
    const slot = Number(r.slot_index);
    if (!Number.isInteger(slot)) continue;
    const tally = out.get(slot) ?? { in: 0, out: 0 };
    if (r.status === 'in') tally.in += 1;
    else if (r.status === 'out') tally.out += 1;
    out.set(slot, tally);
  }
  return out;
}

/** "4 in · 1 out", or null when nobody has answered. */
export function rsvpSummary(
  tally: { in: number; out: number } | undefined,
): string | null {
  if (!tally || (tally.in === 0 && tally.out === 0)) return null;
  const parts: string[] = [];
  if (tally.in) parts.push(`${tally.in} in`);
  if (tally.out) parts.push(`${tally.out} out`);
  return parts.join(' · ');
}
