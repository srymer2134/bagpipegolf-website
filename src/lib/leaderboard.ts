// Pure-TS leaderboard aggregator for the web kiosk view.
//
// Mirrors the Dart `LeaderboardBuilder.buildLeaderboard` +
// `buildAggregatedTotalLeaderboard` shapes at a fraction of the
// complexity. Sam 2026-07-27 (Ballyneal Brigade):
//
//   * Individual GROSS + NET totals across every round in the
//     tournament. NET uses each player's WHS course handicap
//     from their resolved tee box, honoring per-round
//     `playerHandicapIndexSnapshot` overrides (Brigade uses
//     these for Sat + Sun HC adjustments).
//   * "Thru N" per player = count of holes with a non-null
//     score, aggregated across rounds when in TOTAL view.
//   * Single-round view (`buildRoundLeaderboard`) for the
//     round-selector chip strip on the leaderboard page.
//   * Standard T-ranking on gross ties. Sorted by whichever
//     column the caller picks (gross ascending or net ascending).
//
// Not covered (add later — Match Board is Cup-only, so Brigade
// doesn't need it; port when a Cup tourney needs web parity):
//   * Match Board / head-to-head match play results
//   * Team standings for Best Ball rounds (separate view)
//   * Skins / flights / super-skins pools
//   * Stroke-indexes from tee box — falls back to `[1..18]`
//     when the JSONB doesn't carry them. Mirrors the app's
//     `BettingEngine.DEFAULT_STROKE_INDEX` fallback so both
//     surfaces produce the same net rankings.

import {
  parsForRound,
  playerHoleScoresFor,
  type TournamentPlayer,
  type TournamentRound,
  type TournamentRow,
  type TournamentTeeBox,
} from './tournamentQueries';

export type LeaderboardRow = {
  rank: number;
  playerId: string;
  name: string;
  thru: number;
  gross: number;
  grossVsPar: number;
  net: number | null;
  netVsPar: number | null;
  courseHandicapAvg: number | null;
};

export type CtpEntry = {
  roundName: string;
  hole: number;
  winnerId: string;
  winnerName: string;
};

/// WHS course handicap: `round(index × slope/113 + (rating − par))`.
/// Deterministic rounding to nearest integer (banker's rounding
/// per Dart's Math.round semantics — matches
/// `Handicap.courseHandicap` on the Dart side).
export function courseHandicap(
  handicapIndex: number,
  slope: number,
  rating: number,
  par: number,
): number {
  const raw = handicapIndex * slope / 113 + (rating - par);
  // Dart uses .round() which is round-half-away-from-zero.
  // Match that behavior explicitly (JS's Math.round is
  // round-half-toward-positive-infinity for positives — same
  // result for the values we see in practice, but be explicit).
  return raw >= 0 ? Math.floor(raw + 0.5) : -Math.floor(-raw + 0.5);
}

/// Strokes received on one hole given a course handicap +
/// the hole's stroke index. Handles the multi-loop case
/// (CH 20 → 1 stroke on every hole + 2 strokes on SIs 1..2).
/// Zero/negative CH returns 0 (plus handicappers give strokes
/// back; this MVP doesn't model that — same as the Dart engine's
/// pre-plus-handicap path).
export function strokesOnHole(ch: number, si: number): number {
  if (ch <= 0) return 0;
  const base = Math.floor(ch / 18);
  const remainder = ch % 18;
  return base + (si <= remainder ? 1 : 0);
}

const DEFAULT_STROKE_INDEXES: readonly number[] = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18,
];

/// Stroke indexes for a round's resolved tee box. Falls back to
/// `[1..18]` when the tee box doesn't carry them (matches the
/// Dart `BettingEngine.DEFAULT_STROKE_INDEX` behavior).
export function strokeIndexesFor(
  tournament: TournamentRow,
  round: TournamentRound,
): readonly number[] {
  const roundTees = round.tee_boxes ?? round.teeBoxes ?? [];
  for (const tee of roundTees) {
    const sis = (tee as unknown as { strokeIndexes?: number[]; stroke_indexes?: number[] });
    const arr = sis.strokeIndexes ?? sis.stroke_indexes;
    if (Array.isArray(arr) && arr.length > 0) return arr;
  }
  for (const tee of tournament.tee_boxes ?? []) {
    const sis = (tee as unknown as { strokeIndexes?: number[]; stroke_indexes?: number[] });
    const arr = sis.strokeIndexes ?? sis.stroke_indexes;
    if (Array.isArray(arr) && arr.length > 0) return arr;
  }
  return DEFAULT_STROKE_INDEXES;
}

/// The tee box used for handicap math on a given round.
/// Priority: round's own tee box first, tournament-level fallback.
/// The player's `selectedTee` isn't matched yet — MVP uses the
/// first tee box on the round (typically the back tee). Add per-
/// player tee resolution in a follow-up if Brigade sees mixed tees.
function resolvedTeeBox(
  tournament: TournamentRow,
  round: TournamentRound,
): TournamentTeeBox | null {
  const roundTees = round.tee_boxes ?? round.teeBoxes ?? [];
  if (roundTees.length > 0) return roundTees[0];
  const tournamentTees = tournament.tee_boxes ?? [];
  if (tournamentTees.length > 0) return tournamentTees[0];
  return null;
}

/// Resolve a player's WHS handicap INDEX for a given round.
/// Priority (highest first):
///   1. `round.playerHandicapIndexSnapshot[playerId]` — the
///      per-round decimal override typed in by the TD post-round
///      for the Brigade Sat/Sun HC adjustments.
///   2. `player.handicapIndex` — the roster's default.
/// Returns null when neither is available (rare — roster always
/// has a default of 0 at minimum on the app side).
function resolvedHandicapIndex(
  round: TournamentRound,
  player: TournamentPlayer,
): number | null {
  const snapshot = (round as unknown as {
    player_handicap_index_snapshot?: Record<string, number>;
    playerHandicapIndexSnapshot?: Record<string, number>;
  });
  const map = snapshot.player_handicap_index_snapshot ??
      snapshot.playerHandicapIndexSnapshot;
  if (map && typeof map === 'object') {
    const v = map[player.id];
    if (typeof v === 'number') return v;
  }
  if (typeof player.handicapIndex === 'number') return player.handicapIndex;
  return null;
}

/// Per-round course handicap resolved via
/// `resolvedHandicapIndex` × `resolvedTeeBox`. Null when either
/// piece is missing.
function courseHandicapFor(
  tournament: TournamentRow,
  round: TournamentRound,
  player: TournamentPlayer,
): number | null {
  const index = resolvedHandicapIndex(round, player);
  if (index == null) return null;
  const tee = resolvedTeeBox(tournament, round);
  if (!tee) return null;
  const slope = Number(tee.slopeRating);
  const rating = Number(tee.courseRating);
  const par = Number(tee.parTotal);
  if (!Number.isFinite(slope) || !Number.isFinite(rating) || !Number.isFinite(par)) {
    return null;
  }
  return courseHandicap(index, slope, rating, par);
}

type PerPlayerAcc = {
  player: TournamentPlayer;
  gross: number;
  net: number | null; // null until we've computed at least one hole's net
  parSum: number;
  thru: number;
  chSum: number; // for averaging CH across rounds (display only)
  chCount: number;
};

function _fresh(player: TournamentPlayer): PerPlayerAcc {
  return {
    player,
    gross: 0,
    net: null,
    parSum: 0,
    thru: 0,
    chSum: 0,
    chCount: 0,
  };
}

/// Accumulates round contributions into `acc`. Rounds where
/// the resolver can't produce a CH (missing rating/slope/par)
/// contribute GROSS but not NET — net stays null for that
/// player if they never got a computable CH.
function _accumulateRound(
  tournament: TournamentRow,
  round: TournamentRound,
  perPlayer: Map<string, PerPlayerAcc>,
): void {
  const pars = parsForRound(tournament, round);
  if (pars.length === 0) return;
  const sis = strokeIndexesFor(tournament, round);
  for (const phs of playerHoleScoresFor(round)) {
    const acc = perPlayer.get(phs.playerId);
    if (!acc) continue;
    const ch = courseHandicapFor(tournament, round, acc.player);
    let roundContributedAnyScore = false;
    for (let i = 0; i < phs.holeScores.length && i < pars.length; i++) {
      const s = phs.holeScores[i];
      if (s == null) continue;
      acc.gross += s;
      acc.parSum += pars[i];
      acc.thru += 1;
      roundContributedAnyScore = true;
      if (ch != null) {
        const si = i < sis.length ? sis[i] : (i + 1);
        const strokes = strokesOnHole(ch, si);
        const net = s - strokes;
        acc.net = (acc.net ?? 0) + net;
      }
    }
    if (roundContributedAnyScore && ch != null) {
      acc.chSum += ch;
      acc.chCount += 1;
    }
  }
}

function _finalise(perPlayer: Map<string, PerPlayerAcc>): LeaderboardRow[] {
  return Array.from(perPlayer.values())
    .filter((r) => r.thru > 0)
    .map<LeaderboardRow>((r) => ({
      rank: 0,
      playerId: r.player.id,
      name: r.player.name,
      thru: r.thru,
      gross: r.gross,
      grossVsPar: r.gross - r.parSum,
      net: r.net,
      netVsPar: r.net == null ? null : r.net - r.parSum,
      courseHandicapAvg: r.chCount === 0
        ? null
        : Math.round(r.chSum / r.chCount),
    }));
}

/// Sort by [sortMode] with tie-break (thru desc, then name).
/// Ranks with standard T-ranking on ties in the sort column.
function _sortAndRank(
  rows: LeaderboardRow[],
  sortMode: 'gross' | 'net',
): LeaderboardRow[] {
  const sorted = [...rows].sort((a, b) => {
    const av = sortMode === 'gross' ? a.gross : (a.net ?? Number.MAX_SAFE_INTEGER);
    const bv = sortMode === 'gross' ? b.gross : (b.net ?? Number.MAX_SAFE_INTEGER);
    if (av !== bv) return av - bv;
    if (a.thru !== b.thru) return b.thru - a.thru;
    return a.name.localeCompare(b.name);
  });
  let currentRank = 0;
  let seen = 0;
  let lastValue: number | null = null;
  for (const r of sorted) {
    seen += 1;
    const value = sortMode === 'gross' ? r.gross : (r.net ?? 0);
    if (value !== lastValue) {
      currentRank = seen;
      lastValue = value;
    }
    r.rank = currentRank;
  }
  return sorted;
}

/// TOTAL-view leaderboard: sums each player's scores across every
/// round in the tournament.
export function buildTotalLeaderboard(
  tournament: TournamentRow,
  sortMode: 'gross' | 'net' = 'gross',
): LeaderboardRow[] {
  const perPlayer = new Map<string, PerPlayerAcc>();
  for (const p of tournament.players) {
    perPlayer.set(p.id, _fresh(p));
  }
  for (const round of tournament.rounds) {
    _accumulateRound(tournament, round, perPlayer);
  }
  return _sortAndRank(_finalise(perPlayer), sortMode);
}

/// Single-round leaderboard for the round-selector chip strip.
/// Returns empty when the round doesn't exist or has no scores.
export function buildRoundLeaderboard(
  tournament: TournamentRow,
  roundId: string,
  sortMode: 'gross' | 'net' = 'gross',
): LeaderboardRow[] {
  const round = tournament.rounds.find((r) => r.id === roundId);
  if (!round) return [];
  const perPlayer = new Map<string, PerPlayerAcc>();
  for (const p of tournament.players) {
    perPlayer.set(p.id, _fresh(p));
  }
  _accumulateRound(tournament, round, perPlayer);
  return _sortAndRank(_finalise(perPlayer), sortMode);
}

/// Format signed vs-par for display (`+3`, `-2`, `E`).
export function formatVsPar(v: number): string {
  if (v === 0) return 'E';
  if (v > 0) return `+${v}`;
  return `${v}`;
}

/// Extract every CTP winner across every round. Each entry
/// carries the round's display name + the winning player's name
/// (resolved from `tournament.players`). Returns [] when no
/// round has any CTP winner recorded — page hides the section.
export function extractCtpEntries(
  tournament: TournamentRow,
): CtpEntry[] {
  const playerNameById = new Map<string, string>();
  for (const p of tournament.players) {
    playerNameById.set(p.id, p.name);
  }
  const entries: CtpEntry[] = [];
  for (const round of tournament.rounds) {
    const raw = (round as unknown as {
      closest_to_pin_by_hole?: Record<string, string>;
      closestToPinByHole?: Record<string, string>;
    });
    const map = raw.closest_to_pin_by_hole ?? raw.closestToPinByHole;
    if (!map || typeof map !== 'object') continue;
    for (const [holeKey, winnerId] of Object.entries(map)) {
      const hole = Number(holeKey);
      if (!Number.isFinite(hole) || !winnerId) continue;
      entries.push({
        roundName: round.name,
        hole,
        winnerId: winnerId as string,
        winnerName:
            playerNameById.get(winnerId as string) ?? (winnerId as string),
      });
    }
  }
  // Sort by hole number then round order for stable display.
  entries.sort((a, b) => a.hole - b.hole);
  return entries;
}
