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

// ── Ballyneal Brigade — net-only leaderboard ──────────────
// Brigade is a NET-only competition. "Through Sat" carry-in
// captures:
//   * Fri PM 4-man Best Ball — R1 net (gross − HC)
//   * Sat AM 2-man Best Ball + Sat PM optional — take the LOWER
//     of AM/PM net per player
//   Through Sat = R1 net + lower(Sat AM net, Sat PM net)
//
// R3 (Sun Championship) applies a fresh TD-assigned Sunday HDCP:
//   R3 net = R3 gross − R3 HDCP snapshot
//   Total NET = Through Sat + R3 net
//
// Sat AM/PM were both played off-app; carry-in values are locked
// from Sam's master spreadsheet 2026-08-01. No gross column —
// Brigade is a net-only event.
export const BALLYNEAL_BRIGADE_ID = 'tourney_1785515806605';

/// Locked "Through Sat" (R1 net + Sat lower net) per player.
/// Source: Sam's Brigade master spreadsheet 2026-08-01.
// Values chosen so `Thru Sat − HDCP` matches Sam's spreadsheet
// "Total NET" column exactly. 4 rows (Steve Stein, Chris Laney,
// Ryan Gumbel, Ryan Wickles) are 1 stroke lower than the "Total
// after 2 rounds" column would suggest — that's the reconciled
// value per Sam's spreadsheet Total NET (2026-08-02).
const BRIGADE_THROUGH_SAT_NET: Readonly<Record<string, number>> = {
  'p_35fbb832-5be2-422d-a595-cc841d2d52dc': 140, // Tim Halverson
  'p_dba8ac82-56c2-4dfc-8957-492de394317d': 142, // Steve Stein
  'p_199396d8-85b3-49de-aa06-73e796499295': 142, // Chris Laney
  'p_b1796829-b576-48ba-89b5-d03bd8a9c0e8': 142, // Ryan Gumbel
  'p_a7dce2f7-95b1-4dfc-ab42-d6a39c226a55': 143, // Jeff Young
  'p_63264ade-67f6-4697-b632-2488c13aa310': 143, // Mike Papi
  'p_a41002a3-7c97-4843-9d08-aec5fb1fed80': 145, // Joe Buchholz
  'p_d8f22b8e-b998-4c3f-9c30-010ab95b9ca8': 146, // Mark Graycar
  'p_71aa299d-d6d0-4172-954b-40bcdb771311': 146, // Scott McGath
  'p_e7bfa41d-d6ef-4a4b-a11c-a2f9aff547a0': 148, // Neil Metz
  // Greg Nosches suspended from leaderboards per Sam 2026-08-02
  'p_db2a3f77-2a40-4d26-869b-c7a34ce44944': 148, // Nate Marozzi
  'p_8e65e4a3-46d5-4c22-b38f-a9f5a9252e38': 150, // John Mosby
  'p_1aa41f4e-1bff-4ece-bb7e-395db3052130': 150, // Bret Lampiasi
  'p_f5195759-5024-426f-988a-46a3587e98cf': 150, // Jacob Denson
  'p_9fea2500-da1a-43e4-bd77-9b804cb8b9d1': 151, // Aaron Parkington
  'p_8d84d3e7-17c4-419c-a57c-3126eafe1516': 151, // Ryan Wickles
  'p_1f4072be-66d2-4957-a843-6ef21201d727': 153, // Kurt Brakhage
  'p_me': 153, // Sam Rymer
  'p_f3f60a91-45aa-4a02-b600-4fb81220c5ac': 155, // Rick Marshall
  'p_57b75a7b-04e2-4070-8631-bf098e402498': 160, // David Bost
  'p_27ce904e-2cd7-4367-9b4e-931b8f43ac2d': 163, // Richard Gabaldon
  'p_a8fdf52e-a481-4dac-be94-6325565f5317': 168, // Bob Young
};

export type BrigadeRow = {
  rank: number;
  playerId: string;
  name: string;
  throughSat: number; // R1 net + Sat lower net (locked)
  r3Gross: number | null; // null = R3 not started
  r3Hdcp: number | null;
  r3Net: number | null; // r3Gross − r3Hdcp; or −r3Hdcp pre-R3
  totalNet: number; // throughSat + (r3Net ?? 0)
};

export function isBallynealBrigade(t: TournamentRow): boolean {
  return t.id === BALLYNEAL_BRIGADE_ID;
}

function _grossForRound(round: TournamentRound, playerId: string): number {
  let total = 0;
  for (const phs of playerHoleScoresFor(round)) {
    if (phs.playerId !== playerId) continue;
    for (const s of phs.holeScores) {
      if (s != null) total += s;
    }
  }
  return total;
}

function _thruForRound(round: TournamentRound, playerId: string): number {
  let n = 0;
  for (const phs of playerHoleScoresFor(round)) {
    if (phs.playerId !== playerId) continue;
    for (const s of phs.holeScores) if (s != null) n += 1;
  }
  return n;
}

function _r3HdcpFor(round: TournamentRound | undefined, playerId: string): number | null {
  if (!round) return null;
  const raw = (round as unknown as {
    player_handicap_index_snapshot?: Record<string, number | string>;
    playerHandicapIndexSnapshot?: Record<string, number | string>;
  });
  const map = raw.player_handicap_index_snapshot ?? raw.playerHandicapIndexSnapshot;
  if (!map || typeof map !== 'object') return null;
  const v = map[playerId];
  if (v == null) return null;
  const n = typeof v === 'string' ? Number(v) : v;
  return Number.isFinite(n) ? Math.round(n) : null;
}

/// Brigade net-only leaderboard. Sort: Total NET asc, ties broken
/// by Through-Sat asc, then name.
export function buildBrigadeTotals(t: TournamentRow): BrigadeRow[] {
  const r3 = t.rounds[2];
  const rows: BrigadeRow[] = [];
  for (const p of t.players) {
    const throughSat = BRIGADE_THROUGH_SAT_NET[p.id];
    if (throughSat == null) continue; // suspended (Stefanek etc.)
    const r3Thru = r3 ? _thruForRound(r3, p.id) : 0;
    const r3Gross = r3Thru > 0 ? _grossForRound(r3, p.id) : null;
    const r3Hdcp = _r3HdcpFor(r3, p.id);
    // Pre-R3: R3 net = −HDCP (what they'll take back)
    // Post-R3: R3 net = gross − HDCP
    const r3Net = r3Hdcp == null
      ? null
      : (r3Gross == null ? -r3Hdcp : r3Gross - r3Hdcp);
    const totalNet = throughSat + (r3Net ?? 0);
    rows.push({
      rank: 0,
      playerId: p.id,
      name: p.name,
      throughSat,
      r3Gross,
      r3Hdcp,
      r3Net,
      totalNet,
    });
  }
  rows.sort((a, b) => {
    if (a.totalNet !== b.totalNet) return a.totalNet - b.totalNet;
    if (a.throughSat !== b.throughSat) return a.throughSat - b.throughSat;
    return a.name.localeCompare(b.name);
  });
  let currentRank = 0;
  let seen = 0;
  let lastValue: number | null = null;
  for (const r of rows) {
    seen += 1;
    if (r.totalNet !== lastValue) {
      currentRank = seen;
      lastValue = r.totalNet;
    }
    r.rank = currentRank;
  }
  return rows;
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
