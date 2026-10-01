// ============================================================
// The write guard — pinned against the incident it exists for
// ============================================================
// W3. These tests are shaped around the 2026-06-21 Scarecrow Cup R1
// wipe (`tourney_1781969219906`), documented in the Flutter repo's
// docs/DATA_DROP_PREVENTION.md.
//
// Why this file matters more than the pairings UI it protects:
// Railway's PATCH accepts `rounds` and writes it wholesale — no
// per-record merge, no shrink detection (Layer 3 was specified and
// never built). The website is the "future web" that document warned
// could still wipe. This is the only thing stopping it.

import { describe, expect, it } from 'vitest';

import {
  ScoreLossError,
  assertNoScoreLoss,
  normalizePairings,
  scoredCellCount,
  withFreshRounds,
} from './tournamentWrite';
import type { TournamentRow } from './tournamentQueries';

const round = (
  id: string,
  holes: (number | null)[],
  extra: Record<string, unknown> = {},
) => ({
  id,
  name: id,
  format: 'stroke_play',
  player_hole_scores: [{ playerId: 'p1', holeScores: holes }],
  ...extra,
});

const tournament = (rounds: Record<string, unknown>[]): TournamentRow =>
  ({
    id: 't1',
    user_id: 'u1',
    name: 'T',
    course_name: null,
    total_holes: 18,
    par_total: 72,
    created_at: null,
    updated_at: null,
    completed_at: null,
    players: [{ id: 'p1', name: 'Sam' }],
    tee_boxes: [],
    rounds,
  }) as unknown as TournamentRow;

describe('scoredCellCount', () => {
  it('counts non-null holes, not rows', () => {
    // The wipe kept every player row and blanked the holes inside.
    // Counting rows would have reported no loss at all.
    expect(scoredCellCount(round('r1', [4, 5, null, 3]))).toBe(3);
    expect(scoredCellCount(round('r1', [null, null]))).toBe(0);
  });

  it('counts team rows too', () => {
    const r = {
      id: 'r1',
      team_hole_scores: [{ teamId: 'tA', holeScores: [4, 4, null] }],
    };
    expect(scoredCellCount(r)).toBe(2);
  });

  it('reads BOTH wire spellings', () => {
    // tournamentQueries accepts camelCase as well as snake_case, so a
    // guard that only knew one would count zero cells on the other
    // and wave a wipe straight through.
    expect(scoredCellCount({
      id: 'r1',
      playerHoleScores: [{ holeScores: [4, 4, 4] }],
    })).toBe(3);
    expect(scoredCellCount({
      id: 'r1',
      teamHoleScores: [{ hole_scores: [4, 4] }],
    })).toBe(2);
  });

  it('survives junk without throwing', () => {
    expect(scoredCellCount({ id: 'r1' })).toBe(0);
    expect(scoredCellCount({ id: 'r1', player_hole_scores: 'nope' })).toBe(0);
    expect(scoredCellCount({ id: 'r1', player_hole_scores: [null, 7] })).toBe(0);
    expect(scoredCellCount({
      id: 'r1',
      player_hole_scores: [{ holeScores: 'nope' }],
    })).toBe(0);
  });
});

describe('assertNoScoreLoss', () => {
  it('allows a payload that changes nothing about scores', () => {
    const before = [round('r1', [4, 5, 4])];
    const after = [round('r1', [4, 5, 4], { teams: [{ id: 'g1' }] })];
    expect(() => assertNoScoreLoss(before, after)).not.toThrow();
  });

  it('allows scores to GROW', () => {
    expect(() => assertNoScoreLoss(
      [round('r1', [4, null])],
      [round('r1', [4, 5])],
    )).not.toThrow();
  });

  it('THE INCIDENT: refuses a round whose holes were blanked', () => {
    expect(() => assertNoScoreLoss(
      [round('r1', [4, 5, 4, 3, 5])],
      [round('r1', [null, null, null, null, null])],
    )).toThrow(ScoreLossError);
  });

  it('refuses a partial shrink, not just a total one', () => {
    try {
      assertNoScoreLoss([round('r1', [4, 5, 4])], [round('r1', [4, null, 4])]);
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ScoreLossError);
      const err = e as ScoreLossError;
      expect(err.roundId).toBe('r1');
      expect(err.before).toBe(3);
      expect(err.after).toBe(2);
      expect(err.message).toMatch(/fresh read/);
    }
  });

  it('refuses a round that vanishes from the payload', () => {
    // The stale-read shape: the client only knew about r1.
    try {
      assertNoScoreLoss(
        [round('r1', [4, 5]), round('r2', [4, 4, 4])],
        [round('r1', [4, 5])],
      );
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ScoreLossError);
      expect((e as ScoreLossError).roundId).toBe('r2');
      expect((e as ScoreLossError).before).toBe(3);
    }
  });

  it('refuses a vanishing round even when it held NO scores', () => {
    // Deliberately strict. A pairing edit has no business removing a
    // round, empty or not, and "it was empty" is exactly the
    // reassurance a stale read would offer right before it dropped a
    // round someone had just started scoring on another device.
    // A real delete-a-round surface should be its own explicit path,
    // not a side effect of a payload that forgot to include one.
    expect(() => assertNoScoreLoss(
      [round('r1', [4]), round('r2', [null, null])],
      [round('r1', [4])],
    )).toThrow(ScoreLossError);
  });

  it('allows a genuinely new round', () => {
    expect(() => assertNoScoreLoss(
      [round('r1', [4])],
      [round('r1', [4]), round('r2', [])],
    )).not.toThrow();
  });

  it('checks EVERY round, not just the first', () => {
    expect(() => assertNoScoreLoss(
      [round('r1', [4]), round('r2', [4]), round('r3', [4, 4])],
      [round('r1', [4]), round('r2', [4]), round('r3', [4, null])],
    )).toThrow(ScoreLossError);
  });
});

describe('withFreshRounds', () => {
  it('mutates only the named round and passes the rest through', () => {
    const fresh = tournament([
      round('r1', [4, 5], { teams: [{ id: 'old' }] }),
      round('r2', [3, 3], { teams: [{ id: 'keep' }] }),
    ]);
    const out = withFreshRounds(fresh, 'r1', (r) => ({
      ...r,
      teams: [{ id: 'new', name: 'Group 1', player_ids: ['p1'] }],
    }));
    expect(out).toHaveLength(2);
    expect((out[0].teams as { id: string }[])[0].id).toBe('new');
    // r2 must be the SAME object — proof nothing was rebuilt.
    expect(out[1]).toBe(fresh.rounds[1]);
  });

  it('preserves fields the website does not model', () => {
    // A client that predates a new per-round field must not erase it.
    const fresh = tournament([
      round('r1', [4], {
        spine_event_id: 'evt_1',
        handicap_allowance_override: 0.85,
        some_future_setting: { nested: true },
      }),
    ]);
    const out = withFreshRounds(fresh, 'r1', (r) => ({ ...r, teams: [] }));
    expect(out[0].spine_event_id).toBe('evt_1');
    expect(out[0].handicap_allowance_override).toBe(0.85);
    expect(out[0].some_future_setting).toEqual({ nested: true });
  });

  it('runs the guard — a mutator that drops scores is refused', () => {
    // The whole reason the guard is inside this function rather than
    // left to the caller to remember.
    const fresh = tournament([round('r1', [4, 5, 4])]);
    expect(() => withFreshRounds(fresh, 'r1', (r) => ({
      ...r,
      player_hole_scores: [],
    } as never))).toThrow(ScoreLossError);
  });

  it('refuses an unknown round id with an actionable message', () => {
    const fresh = tournament([round('r1', [4])]);
    expect(() => withFreshRounds(fresh, 'nope', (r) => r))
      .toThrow(/not on this tournament/);
  });

  it('handles a tournament with no rounds at all', () => {
    const fresh = tournament([]);
    expect(() => withFreshRounds(fresh, 'r1', (r) => r)).toThrow();
  });
});

describe('normalizePairings', () => {
  it('writes the app\'s wire spelling', () => {
    const out = normalizePairings('r1', [{
      id: 'g1',
      name: 'Group 1',
      playerIds: ['p1', 'p2'],
      startingHole: 10,
      teeTime: '08:40',
      scorekeeperUserId: 'u1',
    }]);
    expect(out).toEqual([{
      id: 'g1',
      name: 'Group 1',
      player_ids: ['p1', 'p2'],
      starting_hole: 10,
      tee_time: '08:40',
      scorekeeper_user_id: 'u1',
    }]);
  });

  it('refuses to let one player sit in two groups', () => {
    // Two groups holding the same player means two scorecards for one
    // person. First occurrence wins.
    const out = normalizePairings('r1', [
      { id: 'a', playerIds: ['p1', 'p2'] },
      { id: 'b', playerIds: ['p2', 'p3'] },
    ]);
    expect(out[0].player_ids).toEqual(['p1', 'p2']);
    expect(out[1].player_ids).toEqual(['p3']);
  });

  it('dedupes within a single group too', () => {
    const out = normalizePairings('r1', [{ id: 'a', playerIds: ['p1', 'p1'] }]);
    expect(out[0].player_ids).toEqual(['p1']);
  });

  it('suffixes colliding group ids instead of merging them', () => {
    // Ids address scores and tee groups elsewhere — a clash is a
    // merge, not a label problem.
    const out = normalizePairings('r1', [
      { id: 'same', playerIds: ['p1'] },
      { id: 'same', playerIds: ['p2'] },
    ]);
    expect(out[0].id).toBe('same');
    expect(out[1].id).not.toBe('same');
    expect(new Set(out.map((g) => g.id)).size).toBe(2);
  });

  it('mints an id and a name when the client omits them', () => {
    const out = normalizePairings('r7', [{ playerIds: ['p1'] }]);
    expect(out[0].id).toBe('group_r7_0');
    expect(out[0].name).toBe('Group 1');
  });

  it('omits optional fields rather than writing null', () => {
    // Writing `starting_hole: null` would overwrite a value the app
    // set; omitting the key leaves the app's own default alone.
    const out = normalizePairings('r1', [{ id: 'a', playerIds: [] }]);
    expect(Object.keys(out[0]).sort()).toEqual(['id', 'name', 'player_ids']);
  });

  it('rejects a starting hole outside the round', () => {
    const nine = { holeCount: 9 };
    expect(normalizePairings('r1', [{ startingHole: 10 }], nine)[0].starting_hole)
      .toBeUndefined();
    expect(normalizePairings('r1', [{ startingHole: 9 }], nine)[0].starting_hole)
      .toBe(9);
    expect(normalizePairings('r1', [{ startingHole: 0 }])[0].starting_hole)
      .toBeUndefined();
    expect(normalizePairings('r1', [{ startingHole: 19 }])[0].starting_hole)
      .toBeUndefined();
  });

  it('drops a captain who is not on the team', () => {
    expect(normalizePairings('r1', [
      { id: 'a', playerIds: ['p1'], captainId: 'p9' },
    ])[0].captain_id).toBeUndefined();
    expect(normalizePairings('r1', [
      { id: 'a', playerIds: ['p1'], captainId: 'p1' },
    ])[0].captain_id).toBe('p1');
  });

  it('ignores junk entries and junk player ids without throwing', () => {
    const out = normalizePairings('r1', [
      null as never,
      'nope' as never,
      { id: 'a', playerIds: ['p1', '', '   ', 42 as never, null as never] },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].player_ids).toEqual(['p1']);
  });

  it('cannot express a score, by construction', () => {
    // The client could not clobber scores even if the guard were
    // removed — nothing it sends reaches a score field.
    const out = normalizePairings('r1', [{
      id: 'a',
      playerIds: ['p1'],
      // deliberately hostile input
      player_hole_scores: [{ playerId: 'p1', holeScores: [null, null] }],
    } as never]);
    expect(out[0].player_hole_scores).toBeUndefined();
    expect(JSON.stringify(out)).not.toMatch(/hole/i);
  });
});
