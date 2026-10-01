// ============================================================
// The WHS opt-out must honour a per-round handicap override
// ============================================================
// THIS TEST EXISTS BECAUSE I SHIPPED THE BUG IT CATCHES.
//
// W0 wired Ballyneal's "play your handicap, rounded up" opt-out into
// the website, and fed it the player's PROFILE index — on the belief
// that Dart's `courseHandicapForPlayer` ignores
// `playerHandicapIndexSnapshot` on those courses.
//
// It does not. That function never consults the snapshot for ANY
// course; applying the override is the caller's job, by design, and
// both of Dart's resolution paths substitute it first:
//
//   // round_context.dart:710, and _buildPlayerCHCache at :480
//   final overridden = tp.copyWith(handicapIndex: indexSnap);
//   return courseHandicapForPlayer(player: overridden, ...);
//
// So the app rounds up the OVERRIDDEN index and the website was
// rounding up the base one. On the Ballyneal Brigade — the tournament
// that actually uses Saturday-to-Sunday adjustments, on the course
// that actually opts out — those are different numbers, and the
// website's leaderboard would have disagreed with the app's again.
//
// The parity fixtures could not catch it: they pin the pure functions,
// and this was a bug in which index gets PASSED to one. That is the
// gap this file closes — it drives the real leaderboard end to end.

import { describe, expect, it } from 'vitest';

import { buildRoundLeaderboard } from './leaderboard';
import type { TournamentRow } from './tournamentQueries';

/// Ballyneal is `useDirectHandicap`, so CH = ceil(index) and the
/// slope/rating below must never be used. They are deliberately set to
/// values that would produce a very different answer under WHS, so a
/// regression shows up as an obviously wrong number rather than an
/// off-by-one: WHS on 75.1/129/71 turns a 10.4 index into 16.
function ballynealTournament(opts: {
  baseIndex: number;
  overrideIndex?: number;
  courseName?: string;
}): TournamentRow {
  const snapshot = opts.overrideIndex == null
    ? {}
    : { player_handicap_index_snapshot: { p1: opts.overrideIndex } };
  return {
    id: 't1',
    user_id: 'u1',
    name: 'Brigade',
    course_name: opts.courseName ?? 'Ballyneal Golf & Hunt Club',
    total_holes: 18,
    par_total: 71,
    created_at: null,
    updated_at: null,
    completed_at: null,
    players: [{ id: 'p1', name: 'Sam', handicapIndex: opts.baseIndex }],
    tee_boxes: [
      {
        teeName: 'Blue',
        pars: [4, 4, 4],
        parTotal: 71,
        slopeRating: 129,
        courseRating: 75.1,
      },
    ],
    rounds: [
      {
        id: 'r1',
        name: 'Saturday',
        format: 'stroke_play',
        ...snapshot,
        player_hole_scores: [{ playerId: 'p1', holeScores: [4, 4, 4] }],
      },
    ],
  };
}

const chOf = (t: TournamentRow): number | null =>
  buildRoundLeaderboard(t, 'r1', 'net')[0].courseHandicapAvg;

describe('Ballyneal opt-out honours the per-round index override', () => {
  it('rounds up the BASE index when no override is set', () => {
    expect(chOf(ballynealTournament({ baseIndex: 10.4 }))).toBe(11);
  });

  it('rounds up the OVERRIDDEN index when the round carries one', () => {
    // The regression. Before the fix this returned 11 — the base index
    // rounded up — while the app returned 5.
    expect(chOf(ballynealTournament({ baseIndex: 10.4, overrideIndex: 4.2 })))
      .toBe(5);
  });

  it('honours an override that RAISES the index too', () => {
    // Not just the generous direction: a director can adjust upward.
    expect(chOf(ballynealTournament({ baseIndex: 4.0, overrideIndex: 12.1 })))
      .toBe(13);
  });

  it('applies the override to NET, not just the displayed handicap', () => {
    // courseHandicapAvg is display. This asserts the strokes actually
    // moved: 3 holes of par 4 scored 4 each = gross 12. With CH 5 the
    // player gets a stroke on stroke indexes 1..5, which on a 3-hole
    // card is all three holes → net 9.
    const rows = buildRoundLeaderboard(
      ballynealTournament({ baseIndex: 10.4, overrideIndex: 4.2 }),
      'r1',
      'net',
    );
    expect(rows[0].gross).toBe(12);
    expect(rows[0].net).toBe(9);
  });

  it('still uses WHS on a course that does not opt out', () => {
    // Guard the guard: if `usesDirectHandicap` ever matched everything,
    // every assertion above would pass for the wrong reason.
    const ch = chOf(ballynealTournament({
      baseIndex: 10.4,
      courseName: 'Shattuck Golf Club',
    }));
    // WHS: round(10.4 × 129/113 + (75.1 − 71)) = round(15.97) = 16.
    expect(ch).toBe(16);
  });

  it('applies the override under WHS as well', () => {
    // The same override must flow through the normal path, which it
    // always did — asserted so a future refactor cannot regress one
    // path while fixing the other.
    const ch = chOf(ballynealTournament({
      baseIndex: 10.4,
      overrideIndex: 4.2,
      courseName: 'Shattuck Golf Club',
    }));
    // round(4.2 × 129/113 + 4.1) = round(8.90) = 9.
    expect(ch).toBe(9);
  });
});
