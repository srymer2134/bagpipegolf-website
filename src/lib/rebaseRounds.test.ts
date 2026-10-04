// `manage.astro` sent a page-load snapshot of `tournaments.rounds`
// straight through the transparent /update proxy. Railway writes the
// array as given — no per-record merge — so a stale tab's round-name
// edit overwrote whatever had been scored since the page loaded. That
// is the 2026-06-21 Cup R1 shape, and it was still live on the oldest
// round editor on 2026-10-04 (Patrick's audit, F12 / PA-A4) even though
// the guard for it shipped on 10-02 for the newer routes.

import { describe, expect, it } from 'vitest';

import {
  ScoreLossError,
  assertNoScoreLoss,
  rebaseRoundsOntoFresh,
  scoredCellCount,
} from './tournamentWrite';

/// A round as the server holds it, with scores on the wire spelling the
/// app actually writes.
function scoredRound(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    name: `Round ${id}`,
    index: 0,
    player_hole_scores: {
      p_alice: [4, 5, 3, null, null],
      p_bob: [5, 4, 4, 6, null],
    },
    ...extra,
  };
}

describe('rebaseRoundsOntoFresh keeps the server scores', () => {
  it('REGRESSION: a stale snapshot cannot blank a scored round', () => {
    // What the browser held: the page loaded before anyone teed off.
    const stale = [{ id: 'r1', name: 'Saturday', index: 0, player_hole_scores: {} }];
    // What the server holds now: a phone has been entering scores.
    const fresh = [scoredRound('r1')];

    const merged = rebaseRoundsOntoFresh(fresh, stale);

    // The rename lands...
    expect(merged[0].name).toBe('Saturday');
    // ...and every score survives.
    expect(scoredCellCount(merged[0])).toBe(scoredCellCount(fresh[0]));
    expect(merged[0].player_hole_scores).toEqual(fresh[0].player_hole_scores);
    expect(() => assertNoScoreLoss(fresh, merged)).not.toThrow();
  });

  it('discards client scores rather than trusting them', () => {
    // Even a client that sends PLAUSIBLE scores is ignored. This is the
    // structural part: there is no path where a snapshot's values win.
    const fresh = [scoredRound('r1')];
    const client = [
      { id: 'r1', player_hole_scores: { p_alice: [9, 9, 9, 9, 9], p_bob: [9, 9, 9, 9, 9] } },
    ];
    expect(rebaseRoundsOntoFresh(fresh, client)[0].player_hole_scores)
      .toEqual(fresh[0].player_hole_scores);
  });

  it('restores camelCase scores too, and does not invent the other spelling', () => {
    const fresh = [{ id: 'r1', teamHoleScores: { t1: [4, 4] } }];
    const merged = rebaseRoundsOntoFresh(fresh, [{ id: 'r1', name: 'x', teamHoleScores: {} }]);
    expect(merged[0].teamHoleScores).toEqual({ t1: [4, 4] });
    expect('team_hole_scores' in merged[0]).toBe(false);
  });

  it('drops a score key the client invented for a round that has none', () => {
    const fresh = [{ id: 'r1', name: 'Q' }];
    const merged = rebaseRoundsOntoFresh(fresh, [
      { id: 'r1', name: 'Q2', player_hole_scores: { p_alice: [3] } },
    ]);
    expect('player_hole_scores' in merged[0]).toBe(false);
    expect(merged[0].name).toBe('Q2');
  });
});

describe('rebaseRoundsOntoFresh preserves what the client never knew', () => {
  it('keeps server-only keys through an edit', () => {
    // A website build that predates a new per-round field must not
    // erase it. This is the `silentRefresh` full-replace class.
    const fresh = [scoredRound('r1', { spine_round_id: 'sr_9', a_field_shipped_later: true })];
    const merged = rebaseRoundsOntoFresh(fresh, [{ id: 'r1', name: 'Renamed' }]);
    expect(merged[0].spine_round_id).toBe('sr_9');
    expect(merged[0].a_field_shipped_later).toBe(true);
    expect(merged[0].name).toBe('Renamed');
  });

  it('accepts a genuinely new round', () => {
    const fresh = [scoredRound('r1')];
    const merged = rebaseRoundsOntoFresh(fresh, [
      { id: 'r1', index: 0 },
      { id: 'r2', name: 'Sunday', index: 1 },
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[1]).toEqual({ id: 'r2', name: 'Sunday', index: 1 });
    expect(() => assertNoScoreLoss(fresh, merged)).not.toThrow();
  });

  it('follows the client ordering, because reordering is the feature', () => {
    const fresh = [scoredRound('r1', { index: 0 }), scoredRound('r2', { index: 1 })];
    const merged = rebaseRoundsOntoFresh(fresh, [
      { id: 'r2', index: 0 },
      { id: 'r1', index: 1 },
    ]);
    expect(merged.map((r) => r.id)).toEqual(['r2', 'r1']);
    // Scores travelled with their own round, not with the position.
    expect(merged[0].player_hole_scores).toEqual(fresh[1].player_hole_scores);
  });

  it('ignores a duplicated id rather than cloning a round', () => {
    const fresh = [scoredRound('r1')];
    const merged = rebaseRoundsOntoFresh(fresh, [{ id: 'r1' }, { id: 'r1', name: 'dupe' }]);
    expect(merged).toHaveLength(1);
    expect(merged[0].name).toBe('Round r1');
  });
});

describe('the guard still fires on what the rebase cannot fix', () => {
  it('an omitted round is refused', () => {
    // The rebase cannot invent a round the client left out, so the
    // guard is what stops the drop. Both layers are required.
    const fresh = [scoredRound('r1'), scoredRound('r2')];
    const merged = rebaseRoundsOntoFresh(fresh, [{ id: 'r1' }]);
    expect(merged).toHaveLength(1);
    expect(() => assertNoScoreLoss(fresh, merged)).toThrow(ScoreLossError);
  });

  it('an omitted EMPTY round is still refused', () => {
    const fresh = [{ id: 'r1', name: 'a' }, { id: 'r2', name: 'b' }];
    expect(() => assertNoScoreLoss(fresh, rebaseRoundsOntoFresh(fresh, [{ id: 'r1' }])))
      .toThrow(ScoreLossError);
  });

  it('a round sent with no id cannot steal an existing round scores', () => {
    // An id-less entry is treated as new, so it gets no scores and the
    // real round goes missing — which the guard then refuses.
    const fresh = [scoredRound('r1')];
    const merged = rebaseRoundsOntoFresh(fresh, [{ name: 'no id here' }]);
    expect(scoredCellCount(merged[0])).toBe(0);
    expect(() => assertNoScoreLoss(fresh, merged)).toThrow(ScoreLossError);
  });
});
