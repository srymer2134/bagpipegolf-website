import type { SupabaseClient } from '@supabase/supabase-js';
import type { StandingsSnapshot, TeamRow, PlayerRow } from './leaguePublic';

// ── The portal's read layer ─────────────────────────────────────
//
// `/app/leagues/**` is the member's view. It reads through RLS as the
// signed-in user, NOT through `get_public_league`.
//
// That is deliberate, and the reason is `page_visibility`: the anon
// function returns null for a `private` league, which is correct for
// bagpipegolf.com/l/<id> and wrong here. A commissioner must be able to
// open their own league in the portal whether or not they have put it on
// the public web. Visibility governs the public page; membership governs
// the portal.
//
// It is not a second implementation of the numbers. The standings are
// the same `league_standings_snapshot` projection the public page
// renders, shaped into the same `StandingsSnapshot` / `TeamRow` /
// `PlayerRow` types from `leaguePublic.ts`. Only the *access path*
// differs.
//
// Every table read here is SELECT-open to `authenticated` (verified
// against pg_policies 2026-09-30): leagues, league_members,
// league_weeks, league_signups, league_teams, league_team_members,
// league_standings_snapshot.

/**
 * The portal's notion of a role: are you the director here, or not.
 *
 * This is DERIVED, never the raw column. `league_members.role` holds
 * `'player'` in practice (all 7 rows on dev, 2026-09-30) — not
 * `'member'` — so casting the column into this type would put a value
 * in it that no comparison matches. Every check here is
 * `=== 'commissioner'`, which happens to behave correctly against
 * `'player'`, but the first person to write `=== 'member'` would get
 * false for every member in the database.
 */
export type LeagueRole = 'commissioner' | 'member';

/** Raw `league_members.role` values that mean "runs this league". */
const DIRECTOR_ROLES = new Set(['commissioner', 'director', 'owner']);

export type MyLeague = {
  id: string;
  name: string;
  description: string | null;
  points_model: string | null;
  week_format: string | null;
  completed_at: string | null;
  page_visibility: string | null;
  role: LeagueRole;
  member_count: number;
};

export type PortalWeek = {
  slot_index: number;
  week_of: string;
  status: string;
  course_id: string | null;
  tee: string | null;
  holes: number | null;
  first_tee_at: string | null;
  locked_at: string | null;
  position_round: boolean;
};

export type PortalDetail = {
  league: MyLeague;
  weeks: PortalWeek[];
  /** This viewer's RSVP per slot. */
  signups: Record<number, string>;
  snapshot: { standings: StandingsSnapshot; computed_at: string } | null;
  /** Display names keyed by user id, for the roster and standings. */
  memberNames: Record<string, string>;
  myUserId: string;
};

/** Leagues this user belongs to or runs, newest first. */
export async function myLeagues(
  supabase: SupabaseClient,
  userId: string,
): Promise<MyLeague[]> {
  const { data: mine, error: mErr } = await supabase
    .from('league_members')
    .select('league_id, role, status')
    .eq('user_id', userId);
  if (mErr) throw mErr;

  // Raw column values, kept raw. Mapped to a LeagueRole at the end.
  const memberOf = new Map<string, string | null>();
  for (const r of (mine ?? []) as Array<{ league_id: string; role: string | null; status: string | null }>) {
    if (r.status && r.status !== 'active') continue;
    memberOf.set(r.league_id, r.role);
  }

  // Owner rows are the other way in: a commissioner may run a league
  // without a league_members row of their own.
  const { data: owned, error: oErr } = await supabase
    .from('leagues')
    .select('id')
    .eq('user_id', userId);
  if (oErr) throw oErr;
  for (const r of (owned ?? []) as Array<{ id: string }>) {
    if (!memberOf.has(r.id)) memberOf.set(r.id, 'commissioner');
  }
  const ownedIds = new Set(((owned ?? []) as Array<{ id: string }>).map((r) => r.id));

  const ids = [...memberOf.keys()];
  if (ids.length === 0) return [];

  const { data: rows, error: lErr } = await supabase
    .from('leagues')
    .select('id, name, description, points_model, week_format, completed_at, page_visibility, user_id, created_at')
    .in('id', ids)
    .order('created_at', { ascending: false });
  if (lErr) throw lErr;

  const { data: counts } = await supabase
    .from('league_members')
    .select('league_id, status')
    .in('league_id', ids);
  const tally = new Map<string, number>();
  for (const c of (counts ?? []) as Array<{ league_id: string; status: string | null }>) {
    if (c.status && c.status !== 'active') continue;
    tally.set(c.league_id, (tally.get(c.league_id) ?? 0) + 1);
  }

  return ((rows ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id),
    name: String(r.name ?? 'League'),
    description: (r.description as string | null) ?? null,
    points_model: (r.points_model as string | null) ?? null,
    week_format: (r.week_format as string | null) ?? null,
    completed_at: (r.completed_at as string | null) ?? null,
    page_visibility: (r.page_visibility as string | null) ?? 'public',
    // Director if you own the row, or your membership says so (a
    // co-director). Everyone else is a member — including rows whose
    // raw role is 'player'.
    role: (r.user_id === userId ||
           ownedIds.has(String(r.id)) ||
           DIRECTOR_ROLES.has((memberOf.get(String(r.id)) ?? '').toLowerCase()))
      ? 'commissioner'
      : 'member',
    member_count: tally.get(String(r.id)) ?? 0,
  }));
}

/** One league, as the signed-in member sees it. Null when not a member. */
export async function leagueDetail(
  supabase: SupabaseClient,
  id: string,
  userId: string,
): Promise<PortalDetail | null> {
  const all = await myLeagues(supabase, userId);
  const league = all.find((l) => l.id === id);
  if (!league) return null;

  const [weeksRes, signupsRes, snapRes, membersRes] = await Promise.all([
    supabase
      .from('league_weeks')
      .select('slot_index, week_of, status, course_id, tee, holes, first_tee_at, locked_at, position_round')
      .eq('league_id', id)
      .order('slot_index', { ascending: true }),
    supabase
      .from('league_signups')
      .select('slot_index, status')
      .eq('league_id', id)
      .eq('user_id', userId),
    supabase
      .from('league_standings_snapshot')
      .select('standings, computed_at')
      .eq('league_id', id)
      .maybeSingle(),
    supabase
      .from('league_members')
      .select('user_id, display_name, status')
      .eq('league_id', id),
  ]);

  const signups: Record<number, string> = {};
  for (const r of (signupsRes.data ?? []) as Array<{ slot_index: number; status: string | null }>) {
    if (r.status) signups[r.slot_index] = r.status;
  }

  const memberNames: Record<string, string> = {};
  for (const r of (membersRes.data ?? []) as Array<{ user_id: string; display_name: string | null }>) {
    if (r.user_id) memberNames[r.user_id] = r.display_name ?? 'Player';
  }

  const snapRow = snapRes.data as { standings: StandingsSnapshot; computed_at: string } | null;

  return {
    league,
    weeks: (weeksRes.data ?? []) as PortalWeek[],
    signups,
    snapshot: snapRow ?? null,
    memberNames,
    myUserId: userId,
  };
}

/** The next week not yet played; null once the season is done. */
export function nextWeek(weeks: PortalWeek[]): PortalWeek | null {
  const today = new Date().toISOString().slice(0, 10);
  return weeks.find((w) => w.week_of >= today && w.status !== 'cancelled') ?? null;
}

/** The most recent week already played. */
export function lastWeek(weeks: PortalWeek[]): PortalWeek | null {
  const today = new Date().toISOString().slice(0, 10);
  const past = weeks.filter((w) => w.week_of < today && w.status !== 'cancelled');
  return past.length ? past[past.length - 1] : null;
}

/**
 * This viewer's row in the published standings, by display name.
 *
 * The snapshot carries names rather than user ids — it is built for a
 * page that must not leak ids — so matching is by name. Returns null
 * when the viewer is not in it, which is the honest answer for a sub
 * or a brand-new member.
 */
export function myPlayerRow(
  snapshot: StandingsSnapshot | null | undefined,
  myName: string | null | undefined,
): { row: PlayerRow; place: number } | null {
  if (!snapshot || !myName) return null;
  const players = snapshot.players ?? [];
  const sorted = [...players].sort((a, b) => b.total - a.total);
  const i = sorted.findIndex((p) => p.display_name === myName);
  return i === -1 ? null : { row: sorted[i], place: i + 1 };
}

export function teamRows(snapshot: StandingsSnapshot | null | undefined): TeamRow[] {
  return snapshot?.season?.rows ?? [];
}

/**
 * Whether this league's standings can appear on the web at all.
 *
 * Only the match-play engine publishes `league_standings_snapshot`
 * (`LeagueSnapshot.publish` takes `LeagueMatchStandings` and nothing
 * else), so a `position` or `stroke_aggregate` league has nothing to
 * render. Saying so plainly beats an empty table that looks broken.
 * The fix is LEAGUE_WEB_PRESENCE_PLAN.md §45 — server-side standings
 * for every points model.
 */
export function standingsAvailability(
  l: MyLeague,
  snapshot: unknown,
): 'ok' | 'not-published-yet' | 'model-not-supported' {
  if (snapshot) return 'ok';
  return l.points_model === 'match_play' ? 'not-published-yet' : 'model-not-supported';
}

export function visibilityLabel(v: string | null | undefined): string {
  switch (v) {
    case 'private':
      return 'Private — nobody can open the public page';
    case 'members':
      return 'Members — signed-in members of this league';
    default:
      return 'Public — anyone with the link';
  }
}

export function rsvpLabel(status: string | undefined): string {
  switch (status) {
    case 'in':
      return 'In';
    case 'out':
      return 'Out';
    default:
      return '—';
  }
}
