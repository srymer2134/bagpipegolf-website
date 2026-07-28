// Match Board aggregator for Cup / head-to-head rounds.
//
// Mirrors the Dart `LeaderboardBuilder.buildMatchBoard` +
// `_computeMatchHolesUp` + `_matchStatusLabel` in
// `fairwayiq-flutter/lib/core/utils/tourney.dart`.
//
// Cup convention: adjacent teams in `round.teams` are matches.
// teams[0] vs teams[1], teams[2] vs teams[3], etc.
//
// Per-hole comparison:
//   * team best-net = LOWEST net among team members on the hole
//     (USGA 0.85 allowance, rounded via `(ch * 0.85 + 0.5).floor()`)
//   * team1 wins hole when net1 < net2 → holesUp++
//   * team2 wins hole when net2 < net1 → holesUp--
//   * tie → hole halved, no change
//
// Match closeout (mathematical): the match completes early when
// |holesUp| > (totalHoles - holesPlayed). Emits status like
// "USA WON 4&3" (leader with 4-up, 3 to play). Regulation labels:
//   "USA WON 2 UP" — decided on 18th (or later after tiebreak)
//   "HALVED"      — final holes played + still all-square
//   "AS · Thru N" — mid-round all-square
//   "USA DORMIE 2" — leader's up equals holes remaining
//   "USA 3 UP · Thru 14" — normal mid-round
//   "NOT STARTED" — no hole played yet

import {
  playerHoleScoresFor,
  parsForRound,
  type TournamentPlayer,
  type TournamentRound,
  type TournamentRoundTeam,
  type TournamentRow,
} from './tournamentQueries';
import {
  courseHandicap,
  strokesOnHole,
  strokeIndexesFor,
} from './leaderboard';

export type MatchStatus = {
  matchId: string;
  team1: MatchTeamSummary;
  team2: MatchTeamSummary;
  holesUp: number; // positive → team1 ahead, negative → team2 ahead
  holesPlayed: number;
  totalHoles: number;
  complete: boolean;
  statusLabel: string;
};

export type MatchTeamSummary = {
  id: string;
  name: string;
  playerNames: string[];
  netTotal: number; // cumulative team best net through holesPlayed
};

/// Head-to-head formats this aggregator supports. Foursomes /
/// greensomes / pinehurst (shared team gross via team_hole_scores)
/// are deferred to a follow-up.
export function isHeadToHeadFormat(
  format: string | null | undefined,
): boolean {
  return format === 'best_ball'
    || format === 'best_three_of_four'
    || format === 'singles';
}

function allowanceAdjustedHandicap(ch: number, allowance: number): number {
  if (ch === 0) return 0;
  return Math.floor(ch * allowance + 0.5);
}

function allowanceFor(round: TournamentRound): number {
  const r = round as unknown as {
    handicap_allowance_override?: number;
    handicapAllowanceOverride?: number;
  };
  const override = r.handicap_allowance_override ?? r.handicapAllowanceOverride;
  if (typeof override === 'number' && Number.isFinite(override)) return override;
  // Default allowances by format (matches Dart's RoundFormatMeta.handicapAllowance):
  if (round.format === 'best_ball' || round.format === 'best_three_of_four') {
    return 0.85; // USGA Four-Ball
  }
  if (round.format === 'singles') return 1.0; // full HC in singles
  return 1.0;
}

function resolvedIndex(
  round: TournamentRound,
  player: TournamentPlayer,
): number | null {
  const snap = (round as unknown as {
    player_handicap_index_snapshot?: Record<string, number>;
    playerHandicapIndexSnapshot?: Record<string, number>;
  });
  const map = snap.player_handicap_index_snapshot ?? snap.playerHandicapIndexSnapshot;
  if (map && typeof map === 'object') {
    const v = map[player.id];
    if (typeof v === 'number') return v;
  }
  if (typeof player.handicapIndex === 'number') return player.handicapIndex;
  return null;
}

function teeForPlayer(
  tournament: TournamentRow,
  round: TournamentRound,
  player: TournamentPlayer,
): { slope: number; rating: number; par: number } | null {
  const wantedTee = (player as { selectedTee?: string | null }).selectedTee;
  const roundTees = (round.tee_boxes ?? round.teeBoxes ?? []) as {
    teeName?: string;
    slopeRating?: number;
    courseRating?: number;
    parTotal?: number;
  }[];
  const tournTees = (tournament.tee_boxes ?? []) as {
    teeName?: string;
    slopeRating?: number;
    courseRating?: number;
    parTotal?: number;
  }[];
  const candidates = roundTees.length > 0 ? roundTees : tournTees;
  const byName = wantedTee
    ? candidates.find((t) => t.teeName === wantedTee)
    : undefined;
  const chosen = byName ?? candidates[0];
  if (!chosen) return null;
  const slope = Number(chosen.slopeRating);
  const rating = Number(chosen.courseRating);
  const par = Number(chosen.parTotal);
  if (!Number.isFinite(slope) || !Number.isFinite(rating) || !Number.isFinite(par)) {
    return null;
  }
  return { slope, rating, par };
}

function courseHcFor(
  tournament: TournamentRow,
  round: TournamentRound,
  player: TournamentPlayer,
): number | null {
  const idx = resolvedIndex(round, player);
  if (idx == null) return null;
  const tee = teeForPlayer(tournament, round, player);
  if (!tee) return null;
  return courseHandicap(idx, tee.slope, tee.rating, tee.par);
}

/// Build MatchStatus rows for a single round. Adjacent teams pair
/// off — teams[0] vs teams[1], teams[2] vs teams[3], etc. An odd
/// last team without a partner is skipped (matches Dart behavior).
export function buildRoundMatchBoard(
  tournament: TournamentRow,
  round: TournamentRound,
): MatchStatus[] {
  if (!isHeadToHeadFormat(round.format)) return [];
  const teams = round.teams ?? [];
  if (teams.length < 2) return [];

  const pars = parsForRound(tournament, round);
  const sis = strokeIndexesFor(tournament, round);
  const totalHoles = pars.length > 0 ? pars.length : tournament.total_holes;
  const allowance = allowanceFor(round);

  const playerById = new Map<string, TournamentPlayer>();
  for (const p of tournament.players) playerById.set(p.id, p);
  const scoreByPlayer = new Map<string, (number | null)[]>();
  for (const phs of playerHoleScoresFor(round)) {
    scoreByPlayer.set(phs.playerId, phs.holeScores);
  }

  // Resolve each team's members + adjusted HCs once.
  type TeamCtx = {
    team: TournamentRoundTeam;
    members: {
      player: TournamentPlayer;
      adjustedHc: number | null;
    }[];
    displayNames: string[];
  };
  const ctxOf = (team: TournamentRoundTeam): TeamCtx => {
    const pids = (team as { player_ids?: string[]; playerIds?: string[] })
      .player_ids ?? (team as { playerIds?: string[] }).playerIds ?? [];
    const members: TeamCtx['members'] = [];
    for (const pid of pids) {
      const p = playerById.get(pid);
      if (!p) continue;
      const ch = courseHcFor(tournament, round, p);
      members.push({
        player: p,
        adjustedHc: ch == null ? null : allowanceAdjustedHandicap(ch, allowance),
      });
    }
    return {
      team,
      members,
      displayNames: members.map((m) => m.player.name),
    };
  };

  const bestNetOnHole = (ctx: TeamCtx, holeIdx: number): number | null => {
    const si = holeIdx < sis.length ? sis[holeIdx] : holeIdx + 1;
    let best: number | null = null;
    for (const m of ctx.members) {
      const list = scoreByPlayer.get(m.player.id);
      if (!list || holeIdx >= list.length) continue;
      const g = list[holeIdx];
      if (g == null) continue;
      const strokes = m.adjustedHc == null ? 0 : strokesOnHole(m.adjustedHc, si);
      const net = g - strokes;
      if (best == null || net < best) best = net;
    }
    return best;
  };

  const out: MatchStatus[] = [];
  for (let i = 0; i + 1 < teams.length; i += 2) {
    const c1 = ctxOf(teams[i]);
    const c2 = ctxOf(teams[i + 1]);

    let holesUp = 0;
    let holesPlayed = 0;
    let t1Net = 0;
    let t2Net = 0;
    let complete = false;
    for (let h = 0; h < totalHoles; h++) {
      const n1 = bestNetOnHole(c1, h);
      const n2 = bestNetOnHole(c2, h);
      if (n1 == null || n2 == null) continue;
      holesPlayed++;
      t1Net += n1;
      t2Net += n2;
      if (n1 < n2) holesUp++;
      else if (n2 < n1) holesUp--;
      const remaining = totalHoles - (h + 1);
      if (Math.abs(holesUp) > remaining) {
        complete = true;
        break;
      }
    }
    if (!complete && holesPlayed >= totalHoles) complete = true;

    out.push({
      matchId: `${c1.team.id}_vs_${c2.team.id}`,
      team1: {
        id: c1.team.id,
        name: c1.team.name,
        playerNames: c1.displayNames,
        netTotal: t1Net,
      },
      team2: {
        id: c2.team.id,
        name: c2.team.name,
        playerNames: c2.displayNames,
        netTotal: t2Net,
      },
      holesUp,
      holesPlayed,
      totalHoles,
      complete,
      statusLabel: matchStatusLabel({
        holesUp,
        holesPlayed,
        totalHoles,
        complete,
        t1Name: c1.team.name,
        t2Name: c2.team.name,
      }),
    });
  }
  return out;
}

/// Multi-round: concatenate per-round match boards. Each round
/// gets its own match section on the UI. No "aggregate" match
/// board — match play doesn't combine cleanly across formats.
export function buildAllRoundsMatchBoard(
  tournament: TournamentRow,
): { round: TournamentRound; matches: MatchStatus[] }[] {
  const out: { round: TournamentRound; matches: MatchStatus[] }[] = [];
  for (const round of tournament.rounds) {
    if (!isHeadToHeadFormat(round.format)) continue;
    const matches = buildRoundMatchBoard(tournament, round);
    if (matches.length > 0) out.push({ round, matches });
  }
  return out;
}

function matchStatusLabel(args: {
  holesUp: number;
  holesPlayed: number;
  totalHoles: number;
  complete: boolean;
  t1Name: string;
  t2Name: string;
}): string {
  const { holesUp, holesPlayed, totalHoles, complete, t1Name, t2Name } = args;
  if (holesPlayed === 0) return 'NOT STARTED';
  const remaining = totalHoles - holesPlayed;
  if (complete) {
    if (holesUp === 0) return 'HALVED';
    const winner = holesUp > 0 ? t1Name : t2Name;
    if (Math.abs(holesUp) > remaining) {
      return `${winner} WON ${Math.abs(holesUp)}&${remaining}`;
    }
    return `${winner} WON ${Math.abs(holesUp)} UP`;
  }
  if (holesUp === 0) return `AS · Thru ${holesPlayed}`;
  const leader = holesUp > 0 ? t1Name : t2Name;
  if (Math.abs(holesUp) === remaining) {
    return `${leader} DORMIE ${Math.abs(holesUp)}`;
  }
  return `${leader} ${Math.abs(holesUp)} UP · Thru ${holesPlayed}`;
}
