// The website's round surfaces read `public.rounds`, which stopped
// carrying scores on 2026-08-16 and stopped getting rows on
// 2026-09-10. Verified against dev 2026-10-04: 163 of 258 scored spine
// rounds are invisible or broken on the website, across 17 of 38 users.
//
// The fixture below is the REAL shape of the 2026-09-19 Inverness round
// as `bagpipe_get_round` returns it, trimmed to 4 holes. It is used
// because it carries the guest-twin pathology: seven player rows for
// four humans, duplicate `guest_name` rows all at `order_index: 0`
// sitting alongside the profile-linked ones. Taking `players[0]` is the
// bug that shipped to the app (api #123 / flutter #1274).

import { describe, expect, it } from 'vitest';

import {
  holesToScoreArray,
  mergeRoundLists,
  pickViewerPlayer,
  scoredHoleCount,
  spineGross,
  spineListItemToRoundRow,
  spineRoundToRoundRow,
  type SpinePlayer,
  type SpineRoundProjection,
} from './spineRounds';
import type { RoundRow } from './queries';

const SAM = '0505d033-3548-4bcf-8583-75918adac710';
const OTHER = '489bf206-e1cb-4053-aed4-ed9287c557de';

function holes(strokes: Array<number | null>) {
  return strokes.map((s, i) => ({ hole_number: i + 1, strokes: s }));
}

/// The twin round, trimmed. Order matters: the guest twins come first,
/// exactly as the RPC returned them.
const INVERNESS: SpineRoundProjection = {
  round: {
    round_id: '52b6f0ec-f761-43e6-b051-fef39a92f453',
    status: 'completed',
    played_on: '2026-09-19',
    course_name: 'The Club at Inverness',
    hole_count: 4,
    hole_pars: [4, 5, 3, 4],
    course_rating: 72.3,
    slope_rating: 135,
    tee: 'Blue',
    created_by: SAM,
  },
  players: [
    // Guest twin, order_index 0, no profile_id.
    { round_player_id: 'rp_guest_casey', guest_name: 'Casey Keefe', order_index: 0,
      is_team_card: false, playing_handicap: 9, holes: holes([null, 5, 4, 5]) },
    { round_player_id: 'rp_guest_scot', guest_name: 'Scot Gause', order_index: 0,
      is_team_card: false, playing_handicap: 26, holes: holes([4, 5, 4, 4]) },
    // The real cards.
    { round_player_id: 'rp_sam', profile_id: SAM, order_index: 1, tee: 'Blue',
      is_team_card: false, playing_handicap: 10, holes: holes([4, 5, 4, 4]) },
    { round_player_id: 'rp_other', profile_id: OTHER, order_index: 2, tee: 'Blue',
      is_team_card: false, playing_handicap: 26, holes: holes([4, 5, 4, 4]) },
  ],
};

describe('pickViewerPlayer does not repeat the Round Detail wrong-player bug', () => {
  it('REGRESSION: returns the viewer, not the guest twin at order_index 0', () => {
    const me = pickViewerPlayer(INVERNESS.players, SAM);
    expect(me?.round_player_id).toBe('rp_sam');
    // The bug was taking players[0].
    expect(me?.round_player_id).not.toBe(INVERNESS.players![0].round_player_id);
  });

  it('returns the OTHER viewer their own card from the same round', () => {
    expect(pickViewerPlayer(INVERNESS.players, OTHER)?.round_player_id).toBe('rp_other');
  });

  it('returns null rather than someone else card when the viewer did not play', () => {
    // Showing a stranger's scorecard under "your round" is worse than
    // showing nothing, so this does not guess.
    expect(pickViewerPlayer(INVERNESS.players, 'nobody-uuid')).toBeNull();
  });

  it('prefers the fuller card when the viewer holds a twin of their own', () => {
    const players: SpinePlayer[] = [
      { round_player_id: 'empty', profile_id: SAM, order_index: 0, holes: [] },
      { round_player_id: 'full', profile_id: SAM, order_index: 1, holes: holes([4, 4, 4, 4]) },
    ];
    expect(pickViewerPlayer(players, SAM)?.round_player_id).toBe('full');
  });

  it('skips a team card', () => {
    const players: SpinePlayer[] = [
      { round_player_id: 'team', profile_id: SAM, is_team_card: true, holes: holes([4, 4]) },
      { round_player_id: 'mine', profile_id: SAM, is_team_card: false, holes: holes([5, 5]) },
    ];
    expect(pickViewerPlayer(players, SAM)?.round_player_id).toBe('mine');
  });

  it('with no viewer id, prefers a profile-linked row over a guest twin', () => {
    // The shared/public read path has no viewer. It must still not
    // land on the twin.
    expect(pickViewerPlayer(INVERNESS.players, null)?.round_player_id).toBe('rp_sam');
    expect(pickViewerPlayer(INVERNESS.players, undefined)?.round_player_id).toBe('rp_sam');
  });

  it('handles an empty or absent roster', () => {
    expect(pickViewerPlayer([], SAM)).toBeNull();
    expect(pickViewerPlayer(null, SAM)).toBeNull();
    expect(pickViewerPlayer(undefined, undefined)).toBeNull();
  });
});

describe('holesToScoreArray', () => {
  it('places strokes by hole NUMBER, not array position', () => {
    // The projection omits unscored holes entirely, so position is
    // meaningless — hole 5 arriving first must still land at index 4.
    const out = holesToScoreArray(
      [{ hole_number: 5, strokes: 7 }, { hole_number: 1, strokes: 4 }],
      9,
    );
    expect(out).toEqual([4, 0, 0, 0, 7, 0, 0, 0, 0]);
  });

  it('pads to the round length so the grid renders every hole', () => {
    expect(holesToScoreArray([{ hole_number: 1, strokes: 4 }], 18)).toHaveLength(18);
  });

  it('drops a hole beyond the round length instead of stretching it', () => {
    // A 9-hole round with a stray hole-12 row must not render 12 holes.
    expect(holesToScoreArray([{ hole_number: 12, strokes: 5 }], 9)).toEqual(Array(9).fill(0));
  });

  it('treats null, zero and missing strokes as unscored', () => {
    const out = holesToScoreArray(
      [{ hole_number: 1, strokes: null }, { hole_number: 2, strokes: 0 },
       { hole_number: 3 }, { hole_number: 4, strokes: 4 }],
      4,
    );
    expect(out).toEqual([0, 0, 0, 4]);
  });
});

describe('spineGross and scoredHoleCount', () => {
  it('null gross for an unscored round, so the card shows a dash not a zero', () => {
    expect(spineGross({ round_player_id: 'x', holes: [] })).toBeNull();
    expect(spineGross({ round_player_id: 'x', holes: holes([null, null]) })).toBeNull();
  });

  it('sums only real strokes', () => {
    expect(spineGross({ round_player_id: 'x', holes: holes([4, null, 5]) })).toBe(9);
    expect(scoredHoleCount({ round_player_id: 'x', holes: holes([4, null, 5]) })).toBe(2);
  });
});

describe('spineRoundToRoundRow', () => {
  it('builds the viewer card, not the twin card', () => {
    const row = spineRoundToRoundRow(INVERNESS, SAM);
    expect(row.id).toBe('52b6f0ec-f761-43e6-b051-fef39a92f453');
    expect(row.hole_scores).toEqual([4, 5, 4, 4]);
    expect(row.total_score).toBe(17);
    expect(row.hole_pars).toEqual([4, 5, 3, 4]);
    expect(row.par_total).toBe(16);
    expect(row.course_name).toBe('The Club at Inverness');
    expect(row.date_played).toBe('2026-09-19');
    expect(row.completed).toBe(true);
    expect(row.course_rating).toBe(72.3);
    expect(row.slope_rating).toBe(135);
    expect(row.tee_color).toBe('Blue');
  });

  it('renders an empty card rather than throwing when the viewer is absent', () => {
    const row = spineRoundToRoundRow(INVERNESS, 'nobody-uuid');
    expect(row.total_score).toBeNull();
    expect(row.hole_scores).toEqual([0, 0, 0, 0]);
    // The round itself still identifies correctly.
    expect(row.course_name).toBe('The Club at Inverness');
  });

  it('falls back to hole_pars length when hole_count is absent', () => {
    const p: SpineRoundProjection = {
      round: { round_id: 'r', hole_pars: [4, 4, 4] },
      players: [{ round_player_id: 'x', profile_id: SAM, holes: holes([4, 4, 4]) }],
    };
    expect(spineRoundToRoundRow(p, SAM).hole_scores).toHaveLength(3);
  });

  it('defaults to 18 holes when the projection says nothing', () => {
    const p: SpineRoundProjection = { round: { round_id: 'r' }, players: [] };
    expect(spineRoundToRoundRow(p, SAM).hole_scores).toHaveLength(18);
  });

  it('leaves putts null when no hole carries one', () => {
    // A stats-off round must not report 0 putts as a fact.
    expect(spineRoundToRoundRow(INVERNESS, SAM).total_putts).toBeNull();
  });

  it('sums putts and counts fir/gir when present', () => {
    const p: SpineRoundProjection = {
      round: { round_id: 'r', hole_count: 3 },
      players: [{
        round_player_id: 'x', profile_id: SAM,
        holes: [
          { hole_number: 1, strokes: 4, putts: 2, fir: true, gir: true },
          { hole_number: 2, strokes: 5, putts: 3, fir: false, gir: false },
          { hole_number: 3, strokes: 4, putts: 1, fir: true, gir: false },
        ],
      }],
    };
    const row = spineRoundToRoundRow(p, SAM);
    expect(row.total_putts).toBe(6);
    expect(row.fairways_hit).toBe(2);
    expect(row.greens_in_reg).toBe(1);
  });
});

describe('mergeRoundLists keeps the two legacy-only rounds alive', () => {
  // Sam's Lake Merced (2026-05-05, 74) and Ballyneal (2026-08-01, 91)
  // are real completed 18-hole cards with no spine twin. They are the
  // entire reason this is a merge and not a replacement.
  const row = (id: string, date: string, course: string | null = null): RoundRow => ({
    ...spineListItemToRoundRow({ round_id: id, played_on: date, course_name: course }),
  });

  it('REGRESSION: a legacy-only round still appears', () => {
    const spine = [row('s1', '2026-10-01', 'Kennedy')];
    const legacy = [row('lake_merced', '2026-05-05', 'Lake Merced Gc')];
    expect(mergeRoundLists(spine, legacy).map((r) => r.id))
      .toEqual(['s1', 'lake_merced']);
  });

  it('drops a legacy row the spine already lists, by date + course', () => {
    // The spine row has its own uuid; the legacy row has a different
    // one. Only date + course can tell they are one round, because
    // bagpipe_list_rounds does not return legacy_round_id.
    const spine = [row('spine_uuid', '2026-09-19', 'The Club at Inverness')];
    const legacy = [row('legacy_uuid', '2026-09-19', 'The Club at Inverness')];
    expect(mergeRoundLists(spine, legacy).map((r) => r.id)).toEqual(['spine_uuid']);
  });

  it('matches the course name case- and whitespace-insensitively', () => {
    const spine = [row('s', '2026-09-19', 'the club at INVERNESS')];
    const legacy = [row('l', '2026-09-19', '  The Club at Inverness  ')];
    expect(mergeRoundLists(spine, legacy)).toHaveLength(1);
  });

  it('drops a legacy row by exact id when the caller can supply one', () => {
    const spine = [row('spine_uuid', '2026-09-01', 'A')];
    const legacy = [row('legacy_uuid', '2026-09-01', 'B')];
    // Different course, so only the id mapping can match them.
    expect(mergeRoundLists(spine, legacy, ['legacy_uuid']).map((r) => r.id))
      .toEqual(['spine_uuid']);
  });

  it('FAILS SAFE: an unmatchable round duplicates rather than vanishing', () => {
    // The four measured misses on dev are backfilled twins whose spine
    // played_on is the backfill date, not the date played. No date key
    // can match those. The REQUIRED behaviour is that the round shows
    // twice — a visible, cosmetic wrong — never that it disappears,
    // which reads as lost data.
    const spine = [row('spine_uuid', '2026-09-06', 'Wellshire Golf Course')];
    const legacy = [row('legacy_uuid', '2026-07-18', 'Wellshire Golf Course')];
    const merged = mergeRoundLists(spine, legacy);
    expect(merged).toHaveLength(2);
    expect(merged.map((r) => r.id)).toContain('legacy_uuid');
  });

  it('never hides a round just because a date or course is missing', () => {
    // A null key must not collide with another null key.
    const spine = [row('s', '2026-09-01', null)];
    const legacy = [row('l1', '2026-09-01', null), row('l2', null as any, 'X')];
    expect(mergeRoundLists(spine, legacy)).toHaveLength(3);
  });

  it('sorts newest first across both sources', () => {
    const merged = mergeRoundLists(
      [row('s_mid', '2026-07-01', 'M')],
      [row('L_new', '2026-09-01', 'N'), row('L_old', '2026-01-01', 'O')],
    );
    expect(merged.map((r) => r.id)).toEqual(['L_new', 's_mid', 'L_old']);
  });

  it('an empty spine list degrades to exactly the legacy list', () => {
    // The dead-backend path: the page must still render every round it
    // renders today.
    const legacy = [row('a', '2026-02-01', 'A'), row('b', '2026-01-01', 'B')];
    expect(mergeRoundLists([], legacy).map((r) => r.id)).toEqual(['a', 'b']);
  });
});
