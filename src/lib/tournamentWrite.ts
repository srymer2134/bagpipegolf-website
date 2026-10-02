// ============================================================
// Guarded tournament writes — the website's Layer 1
// ============================================================
// W3 of the parity plan. Read this before adding ANY surface that
// PATCHes `rounds`.
//
// THE PROBLEM. Railway's `TOURNAMENT_PATCH_ALLOWED` includes
// `rounds`, so the website can edit pairings with no backend work —
// and the PATCH handler does `sanitizePatch` + authz and then writes
// the array **wholesale**. There is no per-record merge and no
// shrink detection on the server. Send a `rounds` array built from a
// stale read and the stored scores are gone.
//
// This is not hypothetical. It is the documented cause of the
// 2026-06-21 Scarecrow Cup R1 wipe (`tourney_1781969219906`), and
// `docs/DATA_DROP_PREVENTION.md` in the Flutter repo lays out a
// three-layer fix. Verified 2026-10-01, in source, not from docs:
//
//   * Layer 1 (client refuses to send a shrink) — Flutter only.
//   * Layer 2 (full-snapshot wrapper) — Flutter only.
//   * Layer 3 (server-side per-record merge) — NEVER SHIPPED.
//     `packages/api/src/routes/tournaments.ts` has no merge logic.
//
// That document predicted this exact situation in its own words:
// "Layer 1 alone — stops the wipe at the source on Flutter, but any
// non-Flutter client (admin scripts, future web) can still wipe."
// The website is the future web, and nothing protects it.
//
// THE RULE HERE. Two things, together:
//
//   1. Never construct a `rounds` array from anything but a FRESH
//      server read taken in the same request. `withFreshRounds`
//      enforces the shape by making the mutator receive the fresh
//      round and return a modified copy of it.
//   2. Never send one without `assertNoScoreLoss`. It counts scored
//      cells per round and refuses the write if any round would lose
//      one.
//
// Neither is sufficient alone: a fresh read still lets a buggy
// mutator drop a field, and the guard can only catch what it counts.
// Together they close the Cup class from this client.
//
// 🚨 If you are adding a web surface that writes scores rather than
// pairings, stop — that is W4, it needs plan L5/F3 settled, and it
// needs Patrick per §6 of the plan.

import type { TournamentRound, TournamentRow } from './tournamentQueries';

/// Per-hole score rows, under either wire spelling. The app writes
/// snake_case; some older payloads carry camelCase, and
/// `tournamentQueries` reads both — so the guard must too, or it
/// would count zero cells and cheerfully wave a wipe through.
function scoreRows(round: Record<string, unknown>): unknown[] {
  const out: unknown[] = [];
  for (const key of [
    'player_hole_scores',
    'playerHoleScores',
    'team_hole_scores',
    'teamHoleScores',
  ]) {
    const v = round[key];
    if (Array.isArray(v)) out.push(...v);
  }
  return out;
}

/// How many non-null per-hole scores a round carries, across both
/// player and team rows and both wire spellings.
///
/// Counting CELLS rather than rows is deliberate: a payload can keep
/// every player row and still blank the holes inside them, which is
/// precisely what the Cup R1 wipe looked like on the wire.
export function scoredCellCount(round: Record<string, unknown>): number {
  let n = 0;
  for (const row of scoreRows(round)) {
    if (!row || typeof row !== 'object') continue;
    const holes = (row as Record<string, unknown>).holeScores
      ?? (row as Record<string, unknown>).hole_scores;
    if (!Array.isArray(holes)) continue;
    for (const h of holes) {
      if (h !== null && h !== undefined) n += 1;
    }
  }
  return n;
}

export class ScoreLossError extends Error {
  constructor(
    message: string,
    readonly roundId: string,
    readonly before: number,
    readonly after: number,
  ) {
    super(message);
    this.name = 'ScoreLossError';
  }
}

/// Refuse a `rounds` payload that would reduce the scored-cell count
/// of any round, or omit a round that exists today.
///
/// Omission is refused **even for a round with no scores**. That is
/// deliberately stricter than "protect scores": a pairing edit has no
/// business removing a round, and "it was empty" is exactly the
/// reassurance a stale read offers right before it drops a round
/// someone started scoring on another device a moment ago. A genuine
/// delete-a-round feature should be its own explicit path rather than
/// a side effect of a payload that forgot to include one.
///
/// Throws rather than returning a flag on purpose: a caller that
/// forgets to check a boolean ships the wipe, and this is the only
/// thing standing between a pairing edit and the Cup R1 incident.
export function assertNoScoreLoss(
  before: readonly Record<string, unknown>[],
  after: readonly Record<string, unknown>[],
): void {
  const beforeById = new Map<string, Record<string, unknown>>();
  for (const r of before) {
    const id = r.id;
    if (typeof id === 'string') beforeById.set(id, r);
  }
  const afterIds = new Set(
    after.map((r) => r.id).filter((id): id is string => typeof id === 'string'),
  );

  // A round that vanishes takes every score in it — and we refuse it
  // whether or not it currently holds any (see the doc comment).
  for (const id of beforeById.keys()) {
    if (!afterIds.has(id)) {
      const lost = scoredCellCount(beforeById.get(id)!);
      throw new ScoreLossError(
        `Refusing the write: round "${id}" is missing from the payload `
          + `(it holds ${lost} recorded score(s)). This is the Cup R1 `
          + `wipe shape — rebuild the payload from a fresh read.`,
        id,
        lost,
        0,
      );
    }
  }

  for (const r of after) {
    const id = r.id;
    if (typeof id !== 'string') continue;
    const prev = beforeById.get(id);
    if (!prev) continue; // a genuinely new round
    const was = scoredCellCount(prev);
    const now = scoredCellCount(r);
    if (now < was) {
      throw new ScoreLossError(
        `Refusing the write: round "${id}" would drop from ${was} to `
          + `${now} recorded score(s). Pairing edits must never change `
          + `scores — rebuild the payload from a fresh read.`,
        id,
        was,
        now,
      );
    }
  }
}

/// Apply [mutate] to one round of a FRESH tournament read and return
/// the full `rounds` array to PATCH, guard already run.
///
/// The signature is the point. The mutator gets the fresh round and
/// returns a modified copy, so there is no code path in which a
/// caller assembles a rounds array out of its own state — which is
/// how every incident in `DATA_DROP_PREVENTION.md` started. Every
/// other round is passed through by reference, untouched.
///
/// Unknown keys survive: the mutator is expected to spread the round
/// it was given. A round type we do not model yet (new per-round
/// settings, spine ids) must not be erased by a client that predates
/// it.
export function withFreshRounds(
  fresh: TournamentRow,
  roundId: string,
  mutate: (round: TournamentRound) => TournamentRound,
): Record<string, unknown>[] {
  const before = (fresh.rounds ?? []) as unknown as Record<string, unknown>[];
  let found = false;
  const after = before.map((r) => {
    if (r.id !== roundId) return r;
    found = true;
    return mutate(r as unknown as TournamentRound) as unknown as
      Record<string, unknown>;
  });
  if (!found) {
    throw new Error(
      `Round "${roundId}" is not on this tournament. It may have been `
        + 'deleted since the page loaded — reload and try again.',
    );
  }
  assertNoScoreLoss(before, after);
  return after;
}

// ── Normalising a pairing payload from the browser ──────────────

/// One group/team as the browser sends it. Deliberately narrow: the
/// client cannot express a score here, so it cannot clobber one even
/// before the guard runs.
export type PairingInput = {
  id?: unknown;
  name?: unknown;
  playerIds?: unknown;
  startingHole?: unknown;
  teeTime?: unknown;
  scorekeeperUserId?: unknown;
  captainId?: unknown;
  teeGroupId?: unknown;
};

const trimmed = (v: unknown): string | null =>
  typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;

/// Rebuild the `teams` array for one round from untrusted input,
/// explicitly field by field, in the app's wire spelling.
///
/// Every value is reconstructed rather than spread, so a client
/// cannot smuggle an unexpected key onto a round. Two invariants are
/// enforced here because neither is cosmetic:
///
///   * **Unique group ids.** Ids address scores and tee groups
///     elsewhere, so two groups sharing one id is a merge, not a
///     label clash. Colliding ids get suffixed.
///   * **A player appears at most once.** The same player in two
///     groups on one round means two scorecards for one person; the
///     first occurrence wins, within and across groups.
export function normalizePairings(
  roundId: string,
  raw: readonly PairingInput[],
  opts: { holeCount?: number } = {},
): Record<string, unknown>[] {
  const holeCount = opts.holeCount && opts.holeCount > 0 ? opts.holeCount : 18;
  const seenIds = new Set<string>();
  const claimed = new Set<string>();
  const out: Record<string, unknown>[] = [];

  raw.forEach((team, i) => {
    if (!team || typeof team !== 'object') return;

    let tid = trimmed(team.id) ?? `group_${roundId}_${i}`;
    while (seenIds.has(tid)) tid = `${tid}_${i}`;
    seenIds.add(tid);

    const playerIds: string[] = [];
    if (Array.isArray(team.playerIds)) {
      for (const p of team.playerIds as unknown[]) {
        const pid = trimmed(p);
        if (pid === null || claimed.has(pid)) continue;
        claimed.add(pid);
        playerIds.push(pid);
      }
    }

    const row: Record<string, unknown> = {
      id: tid,
      name: trimmed(team.name) ?? `Group ${i + 1}`,
      player_ids: playerIds,
    };

    const hole = Number(team.startingHole);
    if (Number.isFinite(hole) && hole >= 1 && hole <= holeCount) {
      row.starting_hole = Math.round(hole);
    }
    const teeTime = trimmed(team.teeTime);
    if (teeTime) row.tee_time = teeTime;
    const keeper = trimmed(team.scorekeeperUserId);
    if (keeper) row.scorekeeper_user_id = keeper;
    // A captain who is not on the team is not a captain.
    const captain = trimmed(team.captainId);
    if (captain && playerIds.includes(captain)) row.captain_id = captain;
    const teeGroup = trimmed(team.teeGroupId);
    if (teeGroup) row.tee_group_id = teeGroup;

    out.push(row);
  });

  return out;
}
