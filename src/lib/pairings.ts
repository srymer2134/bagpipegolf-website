// ── Shared pairing composer types + helpers ─────────────────
//
// One-per-round assignment writes on the tournament create + PATCH
// wire (roadmap #6). The wizard's Pairings step and the Manage
// page's Pairings card both lean on this module so the two
// surfaces produce identical writes.
//
// Wire shape mirrors the mobile app's canonical fields:
//   * Groups pairings write `round.teams[]` (a
//     `TournamentRoundTeam`: id, name, player_ids, optional
//     starting_hole) — same shape the app's
//     `_TeamPairingBlock` / `_ShotgunPairingBlock` write.
//   * Teams pairings write BOTH `round.teams[]` (per-round rosters
//     mirroring the season teams so the leaderboard can render
//     team standings for this specific round) AND top-level
//     `tournament.teams[]` (the season-team roster used by
//     match-points scoreboard). Season teams are tournament-wide
//     — the same `Team A / USA / Green` roster carries across
//     every Cup round.
//
// The Railway `TOURNAMENT_POST_ALLOWED` list already accepts
// `rounds` and top-level `teams` (see
// `packages/api/src/routes/tournaments.ts` line 51). No backend
// change needed for this feature.

/** Per-round pairing mode. `none` = ad-hoc self-organized
 *  (default when no Cup template is picked). `groups` = split
 *  the field into foursomes/threesomes/twosomes per the round's
 *  `teeTimeGroupSize`. `teams` = Cup-style season-team assignment
 *  (2/3/4 teams). */
export type PairingMode = 'none' | 'groups' | 'teams';

export const PAIRING_MODES: ReadonlyArray<PairingMode> = [
  'none',
  'groups',
  'teams',
] as const;

/** One group inside a `groups`-mode round. Mirrors the mobile
 *  app's `TournamentRoundTeam` shape (id + name + player_ids +
 *  optional starting_hole for shotgun rounds). */
export interface PairingGroup {
  /** Stable id inside the round. Wizard writes `group_${round}_${i}`;
   *  Manage page reuses whatever came off the wire. */
  id: string;
  /** Display name. Defaults to `Group A` / `Group B` / … */
  name: string;
  /** Wizard-local player ids (`wp_<index>` on the wizard, real
   *  server ids on the Manage page). The wizard's payload
   *  builder rewrites `wp_*` → `p_<tournamentId>_<i>` on submit
   *  so persisted teams always reference real roster rows. */
  playerIds: string[];
  /** Shotgun rounds only — the hole this group tees off from
   *  (1..18). Null when the round is tee-times OR when the
   *  director hasn't picked yet. */
  startingHole?: number | null;
}

/** One team inside a `teams`-mode round. Same physical shape as
 *  [PairingGroup] on the wire — teams also write to
 *  `round.teams[]` — but tracked separately in wizard state so
 *  the Cup workflows (team names / captain designation) can
 *  target them cleanly.
 *
 *  Also mirrored onto top-level `tournament.teams[]` as the
 *  season roster the match-points scoreboard reads. */
export interface PairingTeam {
  /** Stable id. Wizard writes `team_${round}_${i}` for per-round
   *  and `season_team_${i}` for the mirrored top-level entry. */
  id: string;
  /** Display name. Defaults to `Team A / Team B / …` or
   *  `USA / Europe` for the Ryder Cup pre-fill. */
  name: string;
  /** Wizard-local player ids (same rewrite semantics as
   *  [PairingGroup.playerIds]). */
  playerIds: string[];
  /** Optional captain — one player id from [playerIds]. Rendered
   *  as a star in the composer; passes through to the mobile
   *  app's `captain_id` field on the per-round team entry. */
  captainId?: string | null;
}

/** One round's pairing configuration. Empty groups/teams are
 *  meaningful — a round with `mode: 'groups'` and an empty
 *  `groups` array = "director selected groups mode but hasn't
 *  assigned anyone yet". */
export interface WizardRoundPairing {
  /** Round index (0-based) this pairing applies to. */
  roundIndex: number;
  mode: PairingMode;
  /** Populated when [mode] is `groups`. Ignored otherwise. */
  groups?: PairingGroup[];
  /** Populated when [mode] is `teams`. Ignored otherwise. */
  teams?: PairingTeam[];
}

/** Default group name palette (A..Z, then Group N). Kept short —
 *  a tournament with > 26 groups is out of Phase 1 scope. */
export function defaultGroupName(index: number): string {
  if (index < 26) {
    return `Group ${String.fromCharCode(65 + index)}`;
  }
  return `Group ${index + 1}`;
}

/** Default team names. Ryder Cup pre-fill uses `USA / Europe`
 *  (Cup template driver); other Cup templates fall back to
 *  `Team A / Team B / …`. */
export function defaultTeamName(index: number): string {
  if (index < 26) {
    return `Team ${String.fromCharCode(65 + index)}`;
  }
  return `Team ${index + 1}`;
}

/** Ryder Cup Classic uses the classic Presidents-Cup naming. */
export const RYDER_CUP_TEAM_NAMES: ReadonlyArray<string> = ['USA', 'Europe'];

/** Scarecrow Cup uses Green/Gold per the marketing copy. */
export const SCARECROW_CUP_TEAM_NAMES: ReadonlyArray<string> = [
  'Team Green',
  'Team Gold',
];

/** Compute the default team-name pre-fill for a Cup template.
 *  Templates that don't imply teams return `null`. */
export function defaultTeamNamesForTemplate(
  templateId: string | null | undefined,
  teamCount: number,
): string[] | null {
  if (!templateId || templateId === 'blank') return null;
  if (templateId === 'ryderCupClassic') {
    return [...RYDER_CUP_TEAM_NAMES].slice(0, Math.max(2, teamCount));
  }
  if (templateId === 'scarecrowCup') {
    return [...SCARECROW_CUP_TEAM_NAMES].slice(0, Math.max(2, teamCount));
  }
  // Bandon / Ballyneal are aggregate scoring — no pre-set team
  // names. The wizard still lets the director pick teams mode
  // manually; those fall back to `Team A / Team B`.
  return null;
}

/** Which pairing mode does a Cup template imply? Returns
 *  `null` when the template is Blank or the mode is
 *  director-choice (e.g. Bandon aggregate). */
export function defaultPairingModeForTemplate(
  templateId: string | null | undefined,
): PairingMode | null {
  if (!templateId || templateId === 'blank') return null;
  if (templateId === 'ryderCupClassic') return 'teams';
  if (templateId === 'scarecrowCup') return 'teams';
  // Ballyneal Brigade / Bandon Dunes Cup — team-format rounds
  // are pre-filled, but the director picks pairing mode per
  // round (some rounds are 4-Man Best Ball, some are 2-Man,
  // some are Singles). Leave mode selection to the director.
  return null;
}

/** Auto-assign players to groups by handicap — spread evenly
 *  so each group has a mix of high + low. Mirrors the wizard's
 *  auto-pair strategy (sort ascending, snake-draft into buckets
 *  so bucket 0 gets [lowest, 2*count-th, …], bucket 1 gets
 *  [second, 2*count-1-th, …]).
 *
 *  `groupCount` is the number of buckets to spread across
 *  (typically ceil(players / teeTimeGroupSize)). */
export function autoAssignGroupsByHandicap(
  players: Array<{ id: string; handicap: number }>,
  groupCount: number,
): string[][] {
  const n = players.length;
  const count = Math.max(1, Math.floor(groupCount));
  if (n === 0) return Array.from({ length: count }, () => []);
  const sorted = [...players].sort((a, b) => a.handicap - b.handicap);
  const buckets: string[][] = Array.from({ length: count }, () => []);
  // Snake draft — bucket 0 picks first in odd passes, last in
  // even. Keeps buckets balanced by handicap across passes.
  let idx = 0;
  let forward = true;
  for (const p of sorted) {
    buckets[idx].push(p.id);
    if (forward) {
      if (idx === count - 1) {
        forward = false;
      } else {
        idx += 1;
      }
    } else {
      if (idx === 0) {
        forward = true;
      } else {
        idx -= 1;
      }
    }
  }
  return buckets;
}

/** Auto-assign players to teams by handicap — same snake-draft
 *  strategy as groups, just re-exported so callers can be
 *  explicit about intent. */
export function autoAssignTeamsByHandicap(
  players: Array<{ id: string; handicap: number }>,
  teamCount: number,
): string[][] {
  return autoAssignGroupsByHandicap(players, teamCount);
}

/** Ceil-divide players into groups of `size`, minimum 1 group. */
export function groupCountFor(playerCount: number, size: number): number {
  if (playerCount <= 0) return 1;
  const s = Math.max(1, Math.floor(size));
  return Math.max(1, Math.ceil(playerCount / s));
}

/** Turn a wizard pairing into the mobile-app-canonical shape for
 *  writing onto `round.teams[]`. Returns [] when the mode is
 *  `none` — the mobile app treats an empty teams array as
 *  ad-hoc / self-organized, which is what we want. */
export function pairingToRoundTeamsWire(
  pairing: WizardRoundPairing | undefined,
  playerIdMap: Map<string, string>,
): Array<Record<string, unknown>> {
  if (!pairing || pairing.mode === 'none') return [];
  const rewriteIds = (ids: string[]): string[] =>
    ids
      .map((id) => playerIdMap.get(id) ?? id)
      .filter((id, i, arr) => arr.indexOf(id) === i);
  if (pairing.mode === 'groups') {
    return (pairing.groups ?? []).map((g, i) => {
      const out: Record<string, unknown> = {
        id: g.id && g.id.length > 0 ? g.id : `group_${pairing.roundIndex}_${i}`,
        name: g.name && g.name.trim().length > 0 ? g.name.trim() : defaultGroupName(i),
        player_ids: rewriteIds(g.playerIds ?? []),
      };
      if (typeof g.startingHole === 'number' && Number.isFinite(g.startingHole)) {
        out.starting_hole = Math.max(1, Math.min(18, Math.round(g.startingHole)));
      }
      return out;
    });
  }
  // teams mode
  return (pairing.teams ?? []).map((t, i) => {
    const rewrittenIds = rewriteIds(t.playerIds ?? []);
    const captain =
      t.captainId && playerIdMap.get(t.captainId)
        ? playerIdMap.get(t.captainId)!
        : t.captainId ?? null;
    const out: Record<string, unknown> = {
      id: t.id && t.id.length > 0 ? t.id : `team_${pairing.roundIndex}_${i}`,
      name: t.name && t.name.trim().length > 0 ? t.name.trim() : defaultTeamName(i),
      player_ids: rewrittenIds,
    };
    if (captain && rewrittenIds.includes(captain)) {
      out.captain_id = captain;
    }
    return out;
  });
}

/** Derive the top-level `tournament.teams[]` season roster from
 *  the pairings across all rounds. Any round in `teams` mode
 *  contributes its team roster; the first such round wins on
 *  team identity (name + membership). Rounds in later slots
 *  that share the same team-name string get merged in — but
 *  the wizard's Cup template pre-fill puts identical teams on
 *  every round, so this is usually a straight copy of round 0's
 *  teams. */
export function pairingsToSeasonTeamsWire(
  pairings: WizardRoundPairing[],
  playerIdMap: Map<string, string>,
): Array<Record<string, unknown>> {
  const byName = new Map<string, { id: string; name: string; playerIds: Set<string> }>();
  const rewrite = (id: string): string => playerIdMap.get(id) ?? id;
  for (const p of pairings) {
    if (p.mode !== 'teams') continue;
    for (let i = 0; i < (p.teams ?? []).length; i++) {
      const t = p.teams![i];
      const key = (t.name && t.name.trim().length > 0
        ? t.name.trim()
        : defaultTeamName(i)
      ).toLowerCase();
      const existing = byName.get(key);
      if (existing) {
        for (const pid of t.playerIds ?? []) {
          existing.playerIds.add(rewrite(pid));
        }
      } else {
        byName.set(key, {
          id: `season_team_${byName.size}`,
          name: t.name && t.name.trim().length > 0 ? t.name.trim() : defaultTeamName(i),
          playerIds: new Set((t.playerIds ?? []).map(rewrite)),
        });
      }
    }
  }
  return [...byName.values()].map((t) => ({
    id: t.id,
    name: t.name,
    player_ids: [...t.playerIds],
  }));
}
