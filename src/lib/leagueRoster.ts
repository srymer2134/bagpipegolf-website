// League roster handicaps come from ONE place: `profiles.handicap`.
//
// `league_members.handicap` is an add-time copy that drifts — on
// 2026-10-05 four of the seven dev rows disagreed with the profile, and
// the app (which already read the profile) and this site (which read
// the copy) showed different numbers for the same member. Sam's ruling:
// "the leagues and website should reference profiles.handicap, no second
// placeholder." The column is being dropped (fairwayiq-flutter
// PATRICK_BACKLOG §68); until then it is simply not read here.

export type RosterRow = {
  user_id: string | null;
  display_name: string | null;
  role: string | null;
  status: string | null;
};

export type ProfileHandicapRow = {
  id: string;
  handicap: number | string | null;
};

export type RosterWithHandicap = RosterRow & { handicap: number | null };

/** Unique, non-empty user ids from a roster — what to fetch profiles for. */
export function rosterUserIds(roster: RosterRow[]): string[] {
  const out = new Set<string>();
  for (const r of roster) if (r.user_id) out.add(r.user_id);
  return [...out];
}

/**
 * Attach each member's CURRENT profile handicap. A member whose profile
 * has no handicap, or who is missing from `profiles`, gets `null` — the
 * page renders "—". Nothing here reads a roster-side handicap.
 */
export function mergeRosterHandicaps(
  roster: RosterRow[],
  profiles: ProfileHandicapRow[],
): RosterWithHandicap[] {
  const byId = new Map<string, number | null>();
  for (const p of profiles) {
    const n = p.handicap == null ? null : Number(p.handicap);
    byId.set(p.id, n == null || Number.isNaN(n) ? null : n);
  }
  return roster.map((r) => ({
    ...r,
    handicap: r.user_id ? (byId.get(r.user_id) ?? null) : null,
  }));
}
