// Skins pool aggregator — per-flight gross / per-flight net /
// tournament-wide "Super Skins."
//
// Mirrors the Dart `BettingEngine._calcSkinsSegment` + tournament
// pool builders' semantics: per hole, the player with the strictly
// lowest score (gross OR net) wins the skin; multi-way ties carry
// forward — each subsequent tied hole adds another skin to the
// pot, and the next clear winner takes the accumulated pot.
//
// Cross-round: skins are computed independently PER ROUND then
// summed per player (Skins is a per-round competition; the cross-
// round total is the pool-wide standing). This matches how the app
// surfaces skins across a multi-round tournament: each round has
// its own carryover reset.
//
// Flight scoping:
//   * grossSkins + netSkins → scoped to each `TournamentFlight`
//     independently. Un-flighted tournaments run as one implicit
//     flight (all attending players).
//   * superSkins           → cross-flight, all attending players
//     in one pool. Net-only (mixing gross across flights with
//     different HCs would misrank).
//
// Output: leaderboard-style rows per pool (playerName, skinsWon,
// holesWon). Sorted by skins desc + name asc. Ties allowed.

import {
  playerHoleScoresFor,
  parsForRound,
  type TournamentFlight,
  type TournamentPlayer,
  type TournamentRound,
  type TournamentRow,
} from './tournamentQueries';
import {
  courseHandicap,
  strokesOnHole,
  strokeIndexesFor,
} from './leaderboard';

export type SkinsRow = {
  rank: number;
  playerId: string;
  name: string;
  skinsWon: number;
  /// Encoded as `roundIndex * 100 + (holeIndex + 1)` to preserve
  /// order across rounds for the UI's "hole chips" strip.
  holesWon: number[];
};

export type SkinsSection = {
  key: 'gross' | 'net' | 'super';
  title: string;
  flightId: string | null; // null for super_skins
  flightName: string | null;
  rows: SkinsRow[];
};

/// Parse the tournament's `skins_competitions` set. Returns which
/// pools are enabled — order-independent flags.
export function enabledSkinsPools(t: TournamentRow): {
  gross: boolean;
  net: boolean;
  superSkins: boolean;
} {
  const raw = t.skins_competitions ?? [];
  const set = new Set(raw);
  return {
    gross: set.has('gross_skins'),
    net: set.has('net_skins'),
    superSkins: set.has('super_skins'),
  };
}

/// True when any pool is enabled — drives the Skins toolbar chip.
export function hasAnySkinsPool(t: TournamentRow): boolean {
  const flags = enabledSkinsPools(t);
  return flags.gross || flags.net || flags.superSkins;
}

function playerIdsOfFlight(f: TournamentFlight): string[] {
  return (f.playerIds ?? f.player_ids ?? []) as string[];
}

/// Return "implicit flight" list when the tournament has none —
/// one virtual flight named "All players" with every roster id.
function flightsOrAllField(t: TournamentRow): TournamentFlight[] {
  const flights = t.flights ?? [];
  if (flights.length > 0) return flights;
  return [
    {
      id: '__all__',
      name: 'All players',
      playerIds: t.players.map((p) => p.id),
    },
  ];
}

function allowanceAdjustedHandicap(ch: number, allowance: number): number {
  if (ch === 0) return 0;
  return Math.floor(ch * allowance + 0.5);
}

/// Skins allowance is 1.0 (full HC) unless the round explicitly
/// overrides — same policy as the Dart engine's default for
/// individual-scoring skins. Best Ball / match-play formats use
/// 0.85 but those don't apply to individual-skins reads.
function allowanceFor(round: TournamentRound): number {
  const r = round as unknown as {
    handicap_allowance_override?: number;
    handicapAllowanceOverride?: number;
  };
  const o = r.handicap_allowance_override ?? r.handicapAllowanceOverride;
  if (typeof o === 'number' && Number.isFinite(o)) return o;
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
  const byName = wantedTee ? candidates.find((t) => t.teeName === wantedTee) : undefined;
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

/// Core skins engine. Given a set of player ids competing in a
/// pool, walks every round + hole and awards skins:
///   * Score used per hole is gross OR net depending on `useGross`.
///   * Strict-lowest wins. Ties carry forward to next hole.
///   * Winner takes the accumulated skins (1 base + carry count).
///   * A player who hasn't posted on a hole simply isn't counted;
///     if fewer than 2 competitors posted the hole, no skin awarded
///     that hole (carry keeps its state).
function computeSkinsForPool(
  tournament: TournamentRow,
  competingPlayerIds: string[],
  useGross: boolean,
): SkinsRow[] {
  if (competingPlayerIds.length === 0) return [];
  const playerById = new Map<string, TournamentPlayer>();
  for (const p of tournament.players) playerById.set(p.id, p);

  // Initialize accumulators.
  const totals = new Map<string, { name: string; skins: number; holes: number[] }>();
  for (const pid of competingPlayerIds) {
    const p = playerById.get(pid);
    if (!p) continue;
    totals.set(pid, { name: p.name, skins: 0, holes: [] });
  }

  for (let roundIdx = 0; roundIdx < tournament.rounds.length; roundIdx++) {
    const round = tournament.rounds[roundIdx];
    const pars = parsForRound(tournament, round);
    if (pars.length === 0) continue;
    const sis = strokeIndexesFor(tournament, round);
    const allowance = allowanceFor(round);

    // Score map keyed by playerId for O(1) hole lookups.
    const scoreByPlayer = new Map<string, (number | null)[]>();
    for (const phs of playerHoleScoresFor(round)) {
      if (totals.has(phs.playerId)) {
        scoreByPlayer.set(phs.playerId, phs.holeScores);
      }
    }
    if (scoreByPlayer.size === 0) continue;

    // Precompute each competing player's adjusted CH for this round.
    const adjHcByPlayer = new Map<string, number>();
    if (!useGross) {
      for (const pid of scoreByPlayer.keys()) {
        const p = playerById.get(pid);
        if (!p) continue;
        const ch = courseHcFor(tournament, round, p);
        adjHcByPlayer.set(pid, ch == null ? 0 : allowanceAdjustedHandicap(ch, allowance));
      }
    }

    let carryover = 0;
    for (let h = 0; h < pars.length; h++) {
      const si = h < sis.length ? sis[h] : h + 1;
      let bestScore: number | null = null;
      let winnerIds: string[] = [];
      let postedCount = 0;
      for (const [pid, arr] of scoreByPlayer) {
        if (h >= arr.length) continue;
        const gross = arr[h];
        if (gross == null) continue;
        postedCount++;
        const score = useGross
          ? gross
          : gross - strokesOnHole(adjHcByPlayer.get(pid) ?? 0, si);
        if (bestScore == null || score < bestScore) {
          bestScore = score;
          winnerIds = [pid];
        } else if (score === bestScore) {
          winnerIds.push(pid);
        }
      }
      // Fewer than 2 posted → no skin on this hole (no comparison).
      if (postedCount < 2) continue;
      if (winnerIds.length === 1) {
        const winner = totals.get(winnerIds[0]);
        if (winner) {
          winner.skins += 1 + carryover;
          winner.holes.push(roundIdx * 100 + (h + 1));
        }
        carryover = 0;
      } else {
        // Tied → carryover advances.
        carryover += 1;
      }
    }
  }

  const rows: SkinsRow[] = [];
  for (const [pid, t] of totals) {
    if (t.skins === 0) continue;
    rows.push({
      rank: 0,
      playerId: pid,
      name: t.name,
      skinsWon: t.skins,
      holesWon: t.holes,
    });
  }
  return sortAndRank(rows);
}

function sortAndRank(rows: SkinsRow[]): SkinsRow[] {
  const sorted = [...rows].sort((a, b) => {
    if (a.skinsWon !== b.skinsWon) return b.skinsWon - a.skinsWon;
    return a.name.localeCompare(b.name);
  });
  let last = -1;
  let currentRank = 0;
  let seen = 0;
  for (const r of sorted) {
    seen++;
    if (r.skinsWon !== last) {
      currentRank = seen;
      last = r.skinsWon;
    }
    r.rank = currentRank;
  }
  return sorted;
}

/// Build every enabled skins section (gross-per-flight, net-per-flight,
/// super-skins). Empty sections (no winners) are omitted.
export function buildAllSkinsSections(t: TournamentRow): SkinsSection[] {
  const flags = enabledSkinsPools(t);
  const out: SkinsSection[] = [];

  if (flags.gross) {
    for (const flight of flightsOrAllField(t)) {
      const pids = playerIdsOfFlight(flight);
      if (pids.length === 0) continue;
      const rows = computeSkinsForPool(t, pids, true);
      if (rows.length === 0) continue;
      out.push({
        key: 'gross',
        title:
          (t.flights ?? []).length > 0
            ? `Gross Skins · ${flight.name}`
            : 'Gross Skins',
        flightId: flight.id,
        flightName: flight.name,
        rows,
      });
    }
  }

  if (flags.net) {
    for (const flight of flightsOrAllField(t)) {
      const pids = playerIdsOfFlight(flight);
      if (pids.length === 0) continue;
      const rows = computeSkinsForPool(t, pids, false);
      if (rows.length === 0) continue;
      out.push({
        key: 'net',
        title:
          (t.flights ?? []).length > 0
            ? `Net Skins · ${flight.name}`
            : 'Net Skins',
        flightId: flight.id,
        flightName: flight.name,
        rows,
      });
    }
  }

  if (flags.superSkins) {
    // All players across all flights, net-based (cross-flight
    // comparison needs HC normalisation).
    const allIds = t.players.map((p) => p.id);
    const rows = computeSkinsForPool(t, allIds, false);
    if (rows.length > 0) {
      out.push({
        key: 'super',
        title: 'Super Skins',
        flightId: null,
        flightName: null,
        rows,
      });
    }
  }

  return out;
}
