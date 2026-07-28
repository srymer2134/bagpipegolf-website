// Team standings aggregator for Best Ball round formats.
//
// Mirrors the Dart `_buildBestBallTeamLeaderboard` +
// `_buildBestBallFourManTeamLeaderboard` engines in
// `fairwayiq-flutter/lib/core/utils/tourney.dart`. Two supported
// formats, both keyed off `round.format`:
//
//   * best_ball          — 2-man team. Team hole score = LOWEST net
//                           of the two players' nets. par_hole = pars[h].
//   * best_ball_four_man — 4-man team. Team hole score = SUM of the
//                           TWO LOWEST nets among the four players'
//                           nets. par_hole = pars[h] * 2. Skips holes
//                           where fewer than 2 players posted.
//
// Both use USGA 0.85 handicap allowance rounded via
// `(courseHandicap * 0.85 + 0.5).floor()` — matches Dart's
// `BestBallTeamScore.debugAdjustedHandicap` contract.
//
// Round-level override wins over the format default when
// `handicap_allowance_override` is present on the round.

import {
  playerHoleScoresFor,
  parsForRound,
  type TournamentPlayer,
  type TournamentRound,
  type TournamentRow,
} from './tournamentQueries';
import {
  courseHandicap,
  strokesOnHole,
  strokeIndexesFor,
} from './leaderboard';

export type TeamStandingRow = {
  rank: number;
  teamId: string;
  teamName: string;
  playerNames: string[];
  playerIds: string[];
  holesPlayed: number;
  gross: number;
  grossVsPar: number;
  net: number;
  netVsPar: number;
};

/// Team formats this aggregator supports. Everything else (stroke_play,
/// foursomes, singles, etc.) falls back to the individual leaderboard.
export function isBestBallFormat(format: string | null | undefined): boolean {
  return format === 'best_ball' || format === 'best_ball_four_man';
}

/// USGA "round to nearest whole" allowance. Locked by the Dart
/// engine's `_allowanceAdjustedHandicap` contract. Passes through
/// 0 unchanged; negative (plus-handicap) inputs land per the
/// same floor-of-x-plus-half rule.
function allowanceAdjustedHandicap(
  courseHc: number,
  allowance: number,
): number {
  if (courseHc === 0) return 0;
  return Math.floor(courseHc * allowance + 0.5);
}

/// Resolve the round's handicap allowance. Priority:
///   1. round.handicap_allowance_override / handicapAllowanceOverride
///      (per-round wizard input)
///   2. format default: best_ball / best_ball_four_man → 0.85
///   3. 1.0 (no allowance) fallback
function allowanceFor(round: TournamentRound): number {
  const r = round as unknown as {
    handicap_allowance_override?: number;
    handicapAllowanceOverride?: number;
  };
  const overrideRaw = r.handicap_allowance_override ?? r.handicapAllowanceOverride;
  if (typeof overrideRaw === 'number' && Number.isFinite(overrideRaw)) {
    return overrideRaw;
  }
  return isBestBallFormat(round.format) ? 0.85 : 1.0;
}

/// Resolved per-round handicap index for a player. Mirrors the
/// individual-leaderboard resolver so team standings agree on
/// which HC to use (per-round snapshot > roster default > null).
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

/// Resolve a player's tee box (chooses `selectedTee`, falls back to
/// round's first tee, then tournament's first tee).
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

/// Build the team standings for a single Best Ball round. Returns
/// empty when the round isn't a Best Ball format, has no teams, or
/// has no scored holes.
export function buildRoundTeamStandings(
  tournament: TournamentRow,
  round: TournamentRound,
): TeamStandingRow[] {
  if (!isBestBallFormat(round.format)) return [];
  const teams = round.teams ?? [];
  if (teams.length === 0) return [];

  const pars = parsForRound(tournament, round);
  if (pars.length === 0) return [];
  const sis = strokeIndexesFor(tournament, round);
  const allowance = allowanceFor(round);

  // Index players + scores for fast lookup.
  const playerById = new Map<string, TournamentPlayer>();
  for (const p of tournament.players) playerById.set(p.id, p);
  const scoreByPlayer = new Map<string, (number | null)[]>();
  for (const phs of playerHoleScoresFor(round)) {
    scoreByPlayer.set(phs.playerId, phs.holeScores);
  }

  const takeTwoLowest = round.format === 'best_ball_four_man';

  const rows: TeamStandingRow[] = [];
  for (const team of teams) {
    const teamPlayerIds = ((team as { player_ids?: string[]; playerIds?: string[] })
      .player_ids ?? (team as { playerIds?: string[] }).playerIds ?? []);
    if (teamPlayerIds.length === 0) continue;

    // Resolve players + course HCs once per team.
    type Member = {
      player: TournamentPlayer;
      adjustedHc: number | null;
    };
    const members: Member[] = [];
    for (const pid of teamPlayerIds) {
      const p = playerById.get(pid);
      if (!p) continue;
      const ch = courseHcFor(tournament, round, p);
      members.push({
        player: p,
        adjustedHc: ch == null ? null : allowanceAdjustedHandicap(ch, allowance),
      });
    }
    if (members.length === 0) continue;

    let holesPlayed = 0;
    let grossSum = 0;
    let netSum = 0;
    let parSum = 0;

    for (let h = 0; h < pars.length; h++) {
      const si = h < sis.length ? sis[h] : h + 1;
      const holeGrosses: number[] = [];
      const holeNets: number[] = [];
      for (const m of members) {
        const list = scoreByPlayer.get(m.player.id);
        if (!list || h >= list.length) continue;
        const gross = list[h];
        if (gross == null) continue;
        const strokes =
          m.adjustedHc == null ? 0 : strokesOnHole(m.adjustedHc, si);
        holeGrosses.push(gross);
        holeNets.push(gross - strokes);
      }

      if (takeTwoLowest) {
        // 4-man: need at least 2 posts on the hole to score it.
        if (holeNets.length < 2) continue;
        holeGrosses.sort((a, b) => a - b);
        holeNets.sort((a, b) => a - b);
        grossSum += holeGrosses[0] + holeGrosses[1];
        netSum += holeNets[0] + holeNets[1];
        parSum += pars[h] * 2;
      } else {
        // 2-man: need at least 1 post on the hole.
        if (holeNets.length === 0) continue;
        // Lowest single net (and its matching gross).
        let bestIdx = 0;
        for (let i = 1; i < holeNets.length; i++) {
          if (holeNets[i] < holeNets[bestIdx]) bestIdx = i;
        }
        grossSum += holeGrosses[bestIdx];
        netSum += holeNets[bestIdx];
        parSum += pars[h];
      }
      holesPlayed++;
    }

    if (holesPlayed === 0) continue;
    rows.push({
      rank: 0,
      teamId: team.id,
      teamName: team.name,
      playerNames: members.map((m) => m.player.name),
      playerIds: members.map((m) => m.player.id),
      holesPlayed,
      gross: grossSum,
      grossVsPar: grossSum - parSum,
      net: netSum,
      netVsPar: netSum - parSum,
    });
  }

  return sortAndRank(rows);
}

/// Multi-round total: sums each team's per-round contributions.
/// Only Best Ball rounds contribute. Teams must be present on the
/// round to score (Brigade uses different sub-team partitions per
/// round, so we key by teamId within each round and merge on the
/// tournament's macro-team fallback isn't used — teams are opaque).
export function buildTotalTeamStandings(
  tournament: TournamentRow,
): TeamStandingRow[] {
  // A "total" across rounds only makes sense when the same team ids
  // recur across Best Ball rounds. When they don't (Brigade shuffles
  // pairings between rounds), the round selector is the right view
  // anyway. We still emit a total by teamId; teams appearing in only
  // one round show their single-round contribution.
  const merged = new Map<string, TeamStandingRow>();
  for (const round of tournament.rounds) {
    if (!isBestBallFormat(round.format)) continue;
    const roundRows = buildRoundTeamStandings(tournament, round);
    for (const r of roundRows) {
      const prev = merged.get(r.teamId);
      if (!prev) {
        merged.set(r.teamId, { ...r });
      } else {
        prev.holesPlayed += r.holesPlayed;
        prev.gross += r.gross;
        prev.grossVsPar += r.grossVsPar;
        prev.net += r.net;
        prev.netVsPar += r.netVsPar;
        // Preserve the first-seen player list; teams are usually
        // stable within a Brigade even when the wizard reshuffles.
      }
    }
  }
  return sortAndRank(Array.from(merged.values()));
}

function sortAndRank(rows: TeamStandingRow[]): TeamStandingRow[] {
  const sorted = [...rows].sort((a, b) => {
    if (a.net !== b.net) return a.net - b.net;
    if (a.holesPlayed !== b.holesPlayed) return b.holesPlayed - a.holesPlayed;
    return a.teamName.localeCompare(b.teamName);
  });
  let lastNet = Number.NaN;
  let currentRank = 0;
  let seen = 0;
  for (const r of sorted) {
    seen++;
    if (r.net !== lastNet) {
      currentRank = seen;
      lastNet = r.net;
    }
    r.rank = currentRank;
  }
  return sorted;
}
