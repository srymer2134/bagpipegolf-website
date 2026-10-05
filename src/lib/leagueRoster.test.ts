import { describe, expect, it } from 'vitest';
import { mergeRosterHandicaps, rosterUserIds } from './leagueRoster';

const roster = [
  { user_id: 'a', display_name: 'Casey', role: 'player', status: 'active' },
  { user_id: 'b', display_name: 'Adam', role: 'player', status: 'active' },
  { user_id: 'c', display_name: 'No Profile', role: 'player', status: 'active' },
  { user_id: null, display_name: 'Orphan', role: 'player', status: 'active' },
];

describe('rosterUserIds', () => {
  it('returns unique non-null ids', () => {
    expect(rosterUserIds([...roster, roster[0]])).toEqual(['a', 'b', 'c']);
  });
});

describe('mergeRosterHandicaps', () => {
  it('uses the profile handicap, never a roster-side value', () => {
    const out = mergeRosterHandicaps(roster, [
      { id: 'a', handicap: 4.7 },
      { id: 'b', handicap: '1.5' }, // numeric comes back as a string from PostgREST sometimes
    ]);
    expect(out.map((r) => [r.display_name, r.handicap])).toEqual([
      ['Casey', 4.7],
      ['Adam', 1.5],
      ['No Profile', null],
      ['Orphan', null],
    ]);
  });

  it('treats a null or garbage profile handicap as none', () => {
    const out = mergeRosterHandicaps(roster.slice(0, 2), [
      { id: 'a', handicap: null },
      { id: 'b', handicap: 'abc' },
    ]);
    expect(out.map((r) => r.handicap)).toEqual([null, null]);
  });

  it('does not carry a handicap key from the input row through', () => {
    const withStale = [{ ...roster[0], handicap: 6.6 }] as unknown as typeof roster;
    const out = mergeRosterHandicaps(withStale, [{ id: 'a', handicap: 4.7 }]);
    expect(out[0].handicap).toBe(4.7);
  });
});
