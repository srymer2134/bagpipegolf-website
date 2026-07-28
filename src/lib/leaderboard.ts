// Pure-TS leaderboard aggregator for the web kiosk view.
//
// Mirrors the Dart `LeaderboardBuilder.buildLeaderboard` +
// `buildAggregatedTotalLeaderboard` shapes at a fraction of the
// complexity. MVP scope (Sam 2026-07-27, Ballyneal Brigade):
//
//   * Individual GROSS totals only. No handicap math (needs
//     the WHS course-handicap chain — deferred to a follow-up).
//   * Sums each player's raw hole scores across every round in
//     the tournament. Ranked ascending (low gross wins).
//   * "Thru N" per player = the count of holes (across all
//     rounds) with a non-null score posted.
//   * vs par computed against the resolved pars for each hole
//     that HAS a score (partial rounds render correctly).
//
// Not covered (add later):
//   * Net leaderboard (needs slope/rating + per-round CH snapshots)
//   * Team standings for Best Ball rounds
//   * Round-scoped views (currently always TOTAL)
//   * CTP / LD sections
//
// For MVP the goal is: TV in the clubhouse shows each player's
// current gross total + thru + vs par, sorted low to high. Good
// enough to watch from across the room.

import {
  parsForRound,
  playerHoleScoresFor,
  type TournamentPlayer,
  type TournamentRound,
  type TournamentRow,
} from './tournamentQueries';

export type LeaderboardRow = {
  rank: number;
  playerId: string;
  name: string;
  thru: number;
  gross: number;
  vsPar: number;
};

/// Build the TOTAL-view individual leaderboard. Sorts ascending
/// by gross total (lowest is #1); ties are broken by holesPlayed
/// (more holes rank higher when totals tie) then by name for
/// stable ordering across renders.
///
/// Players with zero holes played anywhere in the tournament are
/// filtered out — a fresh roster row without any scoring doesn't
/// pollute the kiosk view with 24 "—" rows before the first tee.
export function buildTotalLeaderboard(
  tournament: TournamentRow,
): LeaderboardRow[] {
  const perPlayer = new Map<
    string,
    { player: TournamentPlayer; gross: number; parSum: number; thru: number }
  >();
  for (const p of tournament.players) {
    perPlayer.set(p.id, {
      player: p,
      gross: 0,
      parSum: 0,
      thru: 0,
    });
  }

  for (const round of tournament.rounds) {
    const pars = parsForRound(tournament, round);
    if (pars.length === 0) continue;
    for (const phs of playerHoleScoresFor(round)) {
      const acc = perPlayer.get(phs.playerId);
      if (!acc) continue;
      for (let i = 0; i < phs.holeScores.length && i < pars.length; i++) {
        const s = phs.holeScores[i];
        if (s == null) continue;
        acc.gross += s;
        acc.parSum += pars[i];
        acc.thru += 1;
      }
    }
  }

  const rows = Array.from(perPlayer.values())
    .filter((r) => r.thru > 0)
    .map((r) => ({
      rank: 0,
      playerId: r.player.id,
      name: r.player.name,
      thru: r.thru,
      gross: r.gross,
      vsPar: r.gross - r.parSum,
    }));

  rows.sort((a, b) => {
    if (a.gross !== b.gross) return a.gross - b.gross;
    if (a.thru !== b.thru) return b.thru - a.thru;
    return a.name.localeCompare(b.name);
  });

  // Rank with tie-preservation: same gross → same rank; next
  // distinct gross skips over the tied count (standard T-ranking).
  let currentRank = 0;
  let seen = 0;
  let lastGross: number | null = null;
  for (const r of rows) {
    seen += 1;
    if (r.gross !== lastGross) {
      currentRank = seen;
      lastGross = r.gross;
    }
    r.rank = currentRank;
  }
  return rows;
}

/// Format signed vs-par for display (`+3`, `-2`, `E`).
export function formatVsPar(v: number): string {
  if (v === 0) return 'E';
  if (v > 0) return `+${v}`;
  return `${v}`;
}
