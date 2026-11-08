// ============================================================
// Skins boards — pinned to the app's rules
// ============================================================
// The rules under test come from the app:
//   * SuperSkins is GROSS-only, pooled across every flight
//     (`leaderboard_boards.dart`: "SuperSkins is gross-only by design";
//     `LeaderboardBuilder.hasAwardedSkins`: "gross-only per v1 spec").
//   * Which pools exist is read pools-first (`Tournament.fromJson`:
//     `wirePools ?? derive(...)`), not from `skins_competitions` alone.
//   * `remove_side_games` wins (`_addSkinsAndDeuces` returns early).
//   * A player who did not attend a round does not compete for its
//     skins (`ctx.isAttending` in `_runSkinsAcrossRounds`).
//   * A flighted board lists every flight, even one with no skins yet
//     (`buildSkinsByFlight`).
//
// Not ported, on purpose: the app computes these boards from the bet
// games attached to each round (`bets.scores`); the website reads the
// round cards (`player_hole_scores`). See the PR body.

import { describe, expect, it } from 'vitest';

import { buildAllSkinsSections, enabledSkinsPools } from './skinsPool';
import type { TournamentRow } from './tournamentQueries';

const PARS = [4, 4, 4];
const tee = { teeName: 'White', pars: PARS, parTotal: 12, slopeRating: 113, courseRating: 12 };

function tournament(o: {
  scores: Record<string, (number | null)[]>;
  players?: Array<{ id: string; name: string; handicapIndex?: number }>;
  extra?: Record<string, unknown>;
  round?: Record<string, unknown>;
}): TournamentRow {
  return {
    id: 't', user_id: 'u', name: 'T', course_name: null, total_holes: 3,
    par_total: 12, created_at: null, updated_at: null, completed_at: null,
    players: o.players ?? [
      { id: 'a', name: 'Ann', handicapIndex: 0 },
      { id: 'b', name: 'Bob', handicapIndex: 18 },
    ],
    tee_boxes: [tee],
    rounds: [{
      id: 'r1', name: 'R1', format: 'stroke_play',
      player_hole_scores: Object.entries(o.scores)
        .map(([playerId, holeScores]) => ({ playerId, holeScores })),
      ...o.round,
    }],
    ...o.extra,
  } as unknown as TournamentRow;
}

describe('SuperSkins is gross, across the field', () => {
  // Hole 1: Ann 4, Bob 5. Gross: Ann wins. Net (Bob gets a stroke): tie.
  const t = tournament({
    scores: { a: [4, 4, 4], b: [5, 5, 5] },
    extra: { skins_competitions: ['super_skins'] },
  });

  it('REGRESSION: awards on gross, not net', () => {
    const sec = buildAllSkinsSections(t);
    expect(sec).toHaveLength(1);
    expect(sec[0].key).toBe('super');
    expect(sec[0].rows).toEqual([
      { rank: 1, playerId: 'a', name: 'Ann', skinsWon: 3, holesWon: [1, 2, 3] },
    ]);
  });

  it('net skins on the same cards would carry every hole (no winner)', () => {
    const net = tournament({
      scores: { a: [4, 4, 4], b: [5, 5, 5] },
      extra: { skins_competitions: ['net_skins'] },
    });
    expect(buildAllSkinsSections(net)).toEqual([]);
  });
});

describe('which pools exist', () => {
  it('pools win over a stale skins_competitions, as in fromJson', () => {
    const t = tournament({ scores: {}, extra: {
      skins_competitions: ['net_skins'],
      pools: [{ id: 'legacy_gross_skins', kind: 'gross_skins' }],
    } });
    expect(enabledSkinsPools(t)).toEqual({ gross: true, net: false, superSkins: false });
  });

  it('remove_side_games switches every board off', () => {
    const t = tournament({ scores: {}, extra: {
      skins_competitions: ['gross_skins'], remove_side_games: true,
    } });
    expect(enabledSkinsPools(t)).toEqual({ gross: false, net: false, superSkins: false });
  });
});

describe('attendance', () => {
  it('a non-attending player does not compete for the round', () => {
    // Cid would win every hole, but did not attend R1.
    const t = tournament({
      players: [{ id: 'a', name: 'Ann' }, { id: 'b', name: 'Bob' }, { id: 'c', name: 'Cid' }],
      scores: { a: [4, 5, 4], b: [5, 4, 5], c: [2, 2, 2] },
      round: { attending_player_ids: ['a', 'b'] },
      extra: { skins_competitions: ['gross_skins'] },
    });
    const rows = buildAllSkinsSections(t)[0].rows;
    expect(rows.map((r) => [r.playerId, r.skinsWon])).toEqual([['a', 2], ['b', 1]]);
  });
});

describe('flighted boards list every flight once any flight has a skin', () => {
  it('a flight with nothing yet is kept, empty', () => {
    const t = tournament({
      players: [{ id: 'a', name: 'Ann' }, { id: 'b', name: 'Bob' },
        { id: 'c', name: 'Cid' }, { id: 'd', name: 'Dee' }],
      scores: { a: [3, 4, 4], b: [4, 4, 4], c: [4, 4, 4], d: [4, 4, 4] },
      extra: {
        skins_competitions: ['gross_skins'],
        flights: [
          { id: 'f1', name: 'A Flight', player_ids: ['a', 'b'] },
          { id: 'f2', name: 'B Flight', player_ids: ['c', 'd'] },
        ],
      },
    });
    const sec = buildAllSkinsSections(t);
    expect(sec.map((s) => [s.title, s.rows.length])).toEqual([
      ['Gross Skins · A Flight', 1],
      ['Gross Skins · B Flight', 0],
    ]);
  });
});
