// ============================================================
// Data safety for the field-competition keys on `tournaments.rounds`
// ============================================================
// Railway writes `rounds` WHOLESALE. Every website path that rewrites
// it must carry each round's keys it does not manage — in particular
// the competition keys the app started writing 2026-11-08
// (`longest_drive_holes`), the older `ctp_holes`,
// `closest_to_pin_by_hole`, `longest_drive_male_id/female_id`, and
// `spine_round_id`, `player_hole_scores`, `team_hole_scores`,
// `segments` — plus keys nobody has invented yet.
//
// One path DID drop them before this file: `/rounds` (manage.astro's
// round + pairing editors) overlaid a PAGE-LOAD snapshot onto the fresh
// read, so a winner recorded on a phone after the page loaded was
// overwritten by the snapshot's older value. See PROTECTED_ROUND_KEYS.

import { describe, expect, it } from 'vitest';

import {
  PROTECTED_ROUND_KEYS,
  rebaseRoundsOntoFresh,
  withFreshRounds,
  withFreshRoundsAll,
} from './tournamentWrite';
import {
  EMPTY_CONFIG,
  mergePools,
  nextRoundCompetitionFields,
  type CompetitionConfig,
} from './competitionConfig';
import { mergeCtpWinners, resolveCtpHoles } from './ctpHoles';
import type { TournamentRow } from './tournamentQueries';

/// A round as the app writes it today, competition keys included.
const appRound = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  name: `Round ${id}`,
  format: 'stroke_play',
  player_hole_scores: [{ playerId: 'p1', holeScores: [4, 3, 5] }],
  team_hole_scores: [{ teamId: 't1', holeScores: [4, null, null] }],
  closest_to_pin_by_hole: { 3: 'p1' },
  longest_drive_male_id: 'p1',
  longest_drive_female_id: 'p2',
  ctp_holes: [3, 7],
  longest_drive_holes: [16],
  spine_round_id: 'aaaaaaaa-0000-0000-0000-000000000001',
  segments: [{ id: 's1', holes: [1, 9] }],
  attending_player_ids: ['p1', 'p2'],
  completed: true,
  some_future_key: { nested: [1, 2] },
  ...over,
});

const tournament = (rounds: Record<string, unknown>[]): TournamentRow => ({
  id: 't', user_id: 'u', name: 'T', course_name: null, total_holes: 18,
  par_total: 72, created_at: null, updated_at: null, completed_at: null,
  players: [{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }],
  tee_boxes: [], rounds,
} as unknown as TournamentRow);

describe('/rounds rebase: a stale snapshot cannot overwrite competition keys', () => {
  it('REGRESSION: a CTP winner recorded after page load survives a rename', () => {
    // Page loaded before the CTP on 7 was recorded on a phone.
    const snapshot = [{ ...appRound('r1', { closest_to_pin_by_hole: { 3: 'p1' } }),
      name: 'Saturday' }];
    const fresh = [appRound('r1', { closest_to_pin_by_hole: { 3: 'p1', 7: 'p2' } })];
    const merged = rebaseRoundsOntoFresh(fresh, snapshot);
    expect(merged[0].name).toBe('Saturday');
    expect(merged[0].closest_to_pin_by_hole).toEqual({ 3: 'p1', 7: 'p2' });
  });

  it('every protected key comes from the fresh read, never the snapshot', () => {
    const fresh = [appRound('r1')];
    const stale: Record<string, unknown> = { id: 'r1', name: 'Renamed' };
    for (const k of PROTECTED_ROUND_KEYS) stale[k] = `STALE_${k}`;
    const merged = rebaseRoundsOntoFresh(fresh, [stale])[0];
    for (const k of PROTECTED_ROUND_KEYS) {
      if (k in fresh[0]) expect(merged[k], k).toEqual((fresh[0] as Record<string, unknown>)[k]);
      else expect(k in merged, k).toBe(false);
    }
    expect(merged.name).toBe('Renamed');
  });

  it('keys the editor never sent ride along, including unknown ones', () => {
    const fresh = [appRound('r1')];
    const merged = rebaseRoundsOntoFresh(fresh, [{ id: 'r1', teeBoxName: 'Blue' }])[0];
    expect(merged.some_future_key).toEqual({ nested: [1, 2] });
    expect(merged.longest_drive_holes).toEqual([16]);
    expect(merged.teeBoxName).toBe('Blue');
  });

  it('a protected key the client invents for a round is dropped', () => {
    const fresh = [{ id: 'r1', name: 'R1' }];
    const merged = rebaseRoundsOntoFresh(fresh,
      [{ id: 'r1', name: 'R1', longest_drive_male_id: 'p9' }])[0];
    expect('longest_drive_male_id' in merged).toBe(false);
  });
});

describe('withFreshRounds / withFreshRoundsAll keep unknown + new keys', () => {
  it('a winners edit on one round keeps every other key on it', () => {
    const t = tournament([appRound('r1'), appRound('r2')]);
    const out = withFreshRounds(t, 'r1', (r) => ({ ...r, longest_drive_male_id: 'p2' }) as never);
    const { longest_drive_male_id: _a, ...restOut } = out[0] as Record<string, unknown>;
    const { longest_drive_male_id: _b, ...restIn } = appRound('r1') as Record<string, unknown>;
    expect(restOut).toEqual(restIn);
    expect(out[1]).toBe(t.rounds[1]);
  });

  it('a hole-config save over every round keeps scores, winners, spine ids and unknown keys', () => {
    const t = tournament([appRound('r1'), appRound('r2')]);
    const out = withFreshRoundsAll(t, (r) => nextRoundCompetitionFields(r, {
      prev: { ...EMPTY_CONFIG, closestToPin: true, longestDrive: true },
      next: { ...EMPTY_CONFIG, closestToPin: true, longestDrive: true },
      submitted: r.id === 'r1' ? { ldHoles: [4, 16] } : undefined,
      par5s: [4, 8, 16],
    }));
    expect(out[0].longest_drive_holes).toEqual([4, 16]);
    for (const k of ['player_hole_scores', 'team_hole_scores', 'closest_to_pin_by_hole',
      'longest_drive_male_id', 'longest_drive_female_id', 'ctp_holes', 'spine_round_id',
      'segments', 'some_future_key', 'completed']) {
      expect(out[0][k], k).toEqual((appRound('r1') as Record<string, unknown>)[k]);
    }
    expect(out[1]).toEqual(appRound('r2'));
  });
});

describe('nextRoundCompetitionFields mirrors the app wizard', () => {
  const on: CompetitionConfig = { ...EMPTY_CONFIG, closestToPin: true, longestDrive: true };
  const off: CompetitionConfig = EMPTY_CONFIG;
  const base = { id: 'r1', name: 'R1' };

  it('CTP off: an explicit hole list saves as [] (_ctpHolesForSave)', () => {
    const r = nextRoundCompetitionFields({ ...base, ctp_holes: [5, 15] },
      { prev: on, next: off, par5s: [] });
    expect(r.ctp_holes).toEqual([]);
    // [] is what stops an explicit list keeping CTP alive on its own:
    expect(resolveCtpHoles(tournament([r]), r as never)).toEqual([]);
  });

  it('CTP off: an absent list stays absent', () => {
    const r = nextRoundCompetitionFields({ ...base }, { prev: on, next: off, par5s: [] });
    expect('ctp_holes' in r).toBe(false);
  });

  it('CTP back on: [] resets to absent = all par 3s (_onCtpToggled)', () => {
    const r = nextRoundCompetitionFields({ ...base, ctp_holes: [] },
      { prev: off, next: on, par5s: [] });
    expect('ctp_holes' in r).toBe(false);
  });

  it('CTP back on WITH holes picked in the same save keeps the picks', () => {
    const r = nextRoundCompetitionFields({ ...base, ctp_holes: [] },
      { prev: off, next: on, par5s: [], submitted: { ctpHoles: [7] } });
    expect(r.ctp_holes).toEqual([7]);
  });

  it('a submitted [] means "no CTP this round", not "all par 3s"', () => {
    const r = nextRoundCompetitionFields({ ...base },
      { prev: on, next: on, par5s: [], submitted: { ctpHoles: [] } });
    expect(r.ctp_holes).toEqual([]);
  });

  it('LD turned on suggests the par 5s where no hole is picked (_onLongestDriveToggled)', () => {
    const r = nextRoundCompetitionFields({ ...base }, { prev: off, next: on, par5s: [4, 8, 16] });
    expect(r.longest_drive_holes).toEqual([4, 8, 16]);
  });

  it('LD turned on keeps a hole the director already picked', () => {
    const r = nextRoundCompetitionFields({ ...base, longest_drive_holes: [9] },
      { prev: off, next: on, par5s: [4, 8, 16] });
    expect(r.longest_drive_holes).toEqual([9]);
  });

  it('LD off leaves longest_drive_holes alone (readers gate on the flag)', () => {
    const r = nextRoundCompetitionFields({ ...base, longest_drive_holes: [9] },
      { prev: on, next: off, par5s: [] });
    expect(r.longest_drive_holes).toEqual([9]);
  });

  it('writes the snake spelling and drops the camel twin', () => {
    const r = nextRoundCompetitionFields({ ...base, ctpHoles: [3], longestDriveHoles: [16] },
      { prev: on, next: on, par5s: [] });
    expect(r).toEqual({ ...base, ctp_holes: [3], longest_drive_holes: [16] });
  });
});

describe('mergePools — never deletes a pool the site does not manage', () => {
  const stored = [
    { id: 'legacy_gross_skins', kind: 'gross_skins', buy_in_amount: 20 },
    { id: 'pool_17', kind: 'greenies', buy_in_amount: 5, display_name: 'Greenies' },
    { id: 'pool_18', kind: 'deuces_pool' },
    { id: 'pool_app_ctp', kind: 'closest_to_pin', display_name: 'CTP pot', config: { x: 1 } },
  ];

  it('REGRESSION: greenies and deuces pools survive a setup save', () => {
    const { pools } = mergePools(stored,
      { ...EMPTY_CONFIG, skins: ['gross_skins'], closestToPin: true }, 'male');
    expect(pools.find((p) => p.kind === 'greenies')).toEqual(stored[1]);
    expect(pools.find((p) => p.kind === 'deuces_pool')).toEqual(stored[2]);
  });

  it('an app-created pool keeps its id, display name and config; only the buy-in moves', () => {
    const { pools } = mergePools(stored,
      { ...EMPTY_CONFIG, skins: ['gross_skins'], closestToPin: true,
        buyIns: { closest_to_pin: 10 } }, 'male');
    expect(pools.find((p) => p.kind === 'closest_to_pin')).toEqual(
      { id: 'pool_app_ctp', kind: 'closest_to_pin', display_name: 'CTP pot',
        config: { x: 1 }, buy_in_amount: 10 });
    expect(pools.find((p) => p.kind === 'gross_skins')).toEqual(
      { id: 'legacy_gross_skins', kind: 'gross_skins' });
  });

  it('a managed pool switched off is removed and reported', () => {
    const { pools, removed } = mergePools(stored, { ...EMPTY_CONFIG }, 'male');
    expect(pools.map((p) => p.id)).toEqual(['pool_17', 'pool_18']);
    expect(removed.map((p) => p.id)).toEqual(['legacy_gross_skins', 'pool_app_ctp']);
  });

  it('a newly wanted pool is appended with the deterministic id', () => {
    const { pools } = mergePools(stored,
      { ...EMPTY_CONFIG, skins: ['gross_skins', 'super_skins'], closestToPin: true }, 'male');
    expect(pools.at(-1)).toEqual({ id: 'legacy_super_skins', kind: 'super_skins' });
  });

  it('longest drive matches by gender tag', () => {
    const ld = [{ id: 'legacy_longest_drive', kind: 'longest_drive' }];
    const { pools, removed } = mergePools(ld,
      { ...EMPTY_CONFIG, longestDrive: true, longestDriveGenders: ['male', 'female'] }, 'mixed');
    expect(removed).toEqual(ld);
    expect(pools.map((p) => p.id)).toEqual(
      ['legacy_longest_drive_male', 'legacy_longest_drive_female']);
  });

  it('survives junk', () => {
    expect(mergePools('nope', EMPTY_CONFIG, 'male')).toEqual({ pools: [], removed: [] });
    expect(mergePools([null, 3], EMPTY_CONFIG, 'male')).toEqual({ pools: [], removed: [] });
  });
});

describe('mergeCtpWinners keeps legacy text through a picker save', () => {
  it('an unchanged legacy name is accepted, even on an untracked hole', () => {
    const { winners, rejected } = mergeCtpWinners(
      { 3: 'Guest Bob', 11: 'Old Name' },
      { 3: 'Guest Bob', 11: 'Old Name' },
      { tracked: new Set([3]), roster: new Set(['p1']) },
    );
    expect(rejected).toEqual([]);
    expect(winners).toEqual({ 3: 'Guest Bob', 11: 'Old Name' });
  });

  it('a NEW non-roster value is still refused', () => {
    const { rejected } = mergeCtpWinners({ 3: 'Guest Bob' }, { 3: 'Someone Else' },
      { tracked: new Set([3]), roster: new Set(['p1']) });
    expect(rejected).toHaveLength(1);
  });
});
