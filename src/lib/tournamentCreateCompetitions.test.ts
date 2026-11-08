// ============================================================
// Wizard create payload — skins, CTP / LD holes, LD option, pars
// ============================================================
// The website wizard used to create every tournament with
// `skins_competitions: []` and `pools: []` while still setting
// `track_ctp_on_par3s` — the "flags on, pools stale" half of the
// two-representation trap in `competitionConfig.ts`. It now writes both
// representations through `buildCompetitionPatch`, plus per-round
// `ctp_holes` / `longest_drive_holes` with the app wizard's save rules.

import { describe, expect, it } from 'vitest';

import { buildCreatePayload, type WizardInput } from './tournamentCreate';
import { extractLdEntries } from './leaderboard';
import type { TournamentRow } from './tournamentQueries';

const PARS = [4, 4, 3, 5, 3, 4, 4, 5, 4, 4, 3, 4, 4, 4, 3, 5, 4, 4];

const input = (over: Partial<WizardInput> = {}): WizardInput => ({
  name: 'Brigade',
  course: { id: 'c1', clubName: 'Club', courseName: 'Course' },
  teeBoxes: [{ tee_name: 'White', gender: 'male', course_rating: 72, slope_rating: 125, par_total: 71 }],
  courseRating: 72, slopeRating: 125, parTotal: 71,
  fieldGender: 'male',
  scoringMode: 'strokeAggregate',
  useNetScoring: true,
  rounds: [
    { teeName: 'White', totalHoles: 18, format: 'stroke', ctpHoles: [5, 7], ldHoles: [16] },
    { teeName: 'White', totalHoles: 18, format: 'stroke' },
  ],
  players: [{ name: 'Ann', handicap: 10 }, { name: 'Bob', handicap: 12 }],
  ...over,
} as WizardInput);

describe('competitions on create', () => {
  it('writes skins + CTP + LD as BOTH representations, with buy-ins', () => {
    const p = buildCreatePayload(input({
      trackCTPOnPar3s: true,
      trackLongestDrive: true,
      competitions: {
        skins: ['gross_skins', 'super_skins'],
        buyIns: { gross_skins: 20, closest_to_pin: 5 },
        longestDriveGenders: [],
      },
    }));
    expect(p.skins_competitions).toEqual(['gross_skins', 'super_skins']);
    expect(p.track_ctp_on_par3s).toBe(true);
    expect(p.track_longest_drive).toBe(true);
    expect(p.pools).toEqual([
      { id: 'legacy_gross_skins', kind: 'gross_skins', buy_in_amount: 20 },
      { id: 'legacy_super_skins', kind: 'super_skins' },
      { id: 'legacy_closest_to_pin', kind: 'closest_to_pin', buy_in_amount: 5 },
      { id: 'legacy_longest_drive_male', kind: 'longest_drive', config: { gender: 'male' } },
    ]);
    // Men's field -> Men's Longest Drive only, as the app wizard persists it.
    expect(p.longest_drive_genders).toEqual(['male']);
  });

  it('per-round holes: picked lists ride, untouched rounds stay absent', () => {
    const p = buildCreatePayload(input({ trackCTPOnPar3s: true, trackLongestDrive: true }));
    const rounds = p.rounds as Record<string, unknown>[];
    expect(rounds[0].ctp_holes).toEqual([5, 7]);
    expect(rounds[0].longest_drive_holes).toEqual([16]);
    expect('ctp_holes' in rounds[1]).toBe(false);
    expect('longest_drive_holes' in rounds[1]).toBe(false);
  });

  it('CTP off: an explicit list saves as [] (app `_ctpHolesForSave`)', () => {
    const p = buildCreatePayload(input({ trackCTPOnPar3s: false }));
    const rounds = p.rounds as Record<string, unknown>[];
    expect(rounds[0].ctp_holes).toEqual([]);
    expect('ctp_holes' in rounds[1]).toBe(false);
  });

  it('mixed field: the chosen option decides the brackets', () => {
    const p = buildCreatePayload(input({
      fieldGender: 'mixed', trackLongestDrive: true,
      competitions: { skins: [], buyIns: {}, longestDriveGenders: ['female'] },
    }));
    expect(p.longest_drive_genders).toEqual(['female']);
    expect(p.pools).toEqual([
      { id: 'legacy_longest_drive_female', kind: 'longest_drive', config: { gender: 'female' } },
    ]);
  });

  it('nothing on: empty pools, flags false, no LD genders key', () => {
    const p = buildCreatePayload(input());
    expect(p.pools).toEqual([]);
    expect(p.skins_competitions).toEqual([]);
    expect(p.track_ctp_on_par3s).toBe(false);
    expect('longest_drive_genders' in p).toBe(false);
  });

  it('course pars are stamped onto the tee boxes so par 3s / skins resolve', () => {
    const p = buildCreatePayload(input({ coursePars: PARS }));
    expect((p.tee_boxes as Array<Record<string, unknown>>)[0].pars).toEqual(PARS);
    const none = buildCreatePayload(input());
    expect('pars' in (none.tee_boxes as Array<Record<string, unknown>>)[0]).toBe(false);
  });
});

describe('extractLdEntries (leaderboard)', () => {
  const t = (round: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
    id: 't', user_id: 'u', name: 'T', course_name: null, total_holes: 18, par_total: 72,
    created_at: null, updated_at: null, completed_at: null, tee_boxes: [],
    players: [{ id: 'p1', name: 'Ann' }, { id: 'p2', name: 'Bea' }],
    rounds: [{ id: 'r1', name: 'Fri PM', format: 'stroke_play', ...round }],
    track_longest_drive: true,
    ...extra,
  } as unknown as TournamentRow);

  it("men's field lists the men's winner with the hole", () => {
    expect(extractLdEntries(t({ longest_drive_male_id: 'p1', longest_drive_holes: [16] })))
      .toEqual([{ roundName: 'Fri PM', bracket: "Men's", holesLabel: 'Hole #16',
        winnerName: 'Ann', legacy: false }]);
  });

  it('a legacy typed name is shown and flagged, never dropped', () => {
    expect(extractLdEntries(t({ longest_drive_male_id: 'Guest Bob' }))[0])
      .toMatchObject({ winnerName: 'Guest Bob', legacy: true });
  });

  it("a men's field ignores a stray women's winner; LD off shows nothing", () => {
    expect(extractLdEntries(t({ longest_drive_female_id: 'p2' }))).toEqual([]);
    expect(extractLdEntries(t({ longest_drive_male_id: 'p1' }, { track_longest_drive: false })))
      .toEqual([]);
  });
});
