// ============================================================
// Field competitions — pinned to the app
// ============================================================
// Every case below mirrors a case in the flutter repo's
// `test/tourney/field_competition_setup_test.dart` and
// `test/tourney/competition_winner_picker_test.dart` (PR #1599), with
// the same inputs and the same expected outputs. When one of these
// fails, the TypeScript is wrong until proven otherwise.

import { describe, expect, it } from 'vitest';

import {
  cleanHoleList,
  ctpRowHoles,
  explicitLdHoles,
  formatHoleList,
  holesWithPar,
  LD_FORMAT_GENDERS,
  ldHolesLabel,
  longestDriveFieldNoteFor,
  longestDriveFormatFrom,
  longestDriveFormatsFor,
  longestDriveTitleFor,
  par5Holes,
  resolveLdHoles,
} from './fieldCompetitions';
import {
  acceptWinnerValue,
  competitionRosterFor,
  describeCompetitionWinner,
  effectivePlayerGender,
  resolveCompetitionWinner,
} from './competitionWinner';
import type { TournamentPlayer, TournamentRound, TournamentRow } from './tournamentQueries';

// Par 3s on 3, 5, 11, 15; par 5s on 4, 8, 16 — the app fixture's `_pars`.
const PARS = [4, 4, 3, 5, 3, 4, 4, 5, 4, 4, 3, 4, 4, 4, 3, 5, 4, 4];

const tourney = (
  round: Record<string, unknown>,
  o: { ctp?: boolean; ld?: boolean; players?: unknown[]; field?: string;
       ldGenders?: string[] | null } = {},
): TournamentRow => ({
  id: 't1', user_id: 'u1', name: 'T', course_name: null, total_holes: 18,
  par_total: 71, created_at: null, updated_at: null, completed_at: null,
  players: o.players ?? [],
  tee_boxes: [{ teeName: 'White', pars: PARS, parTotal: 71, slopeRating: 125, courseRating: 72.6 }],
  rounds: [{ id: 'r1', name: 'R1', format: 'stroke_play', ...round }],
  track_ctp_on_par3s: o.ctp ?? true,
  track_longest_drive: o.ld ?? true,
  ...(o.field && o.field !== 'male' ? { field_gender: o.field } : {}),
  ...(o.ldGenders !== undefined ? { longest_drive_genders: o.ldGenders } : {}),
} as unknown as TournamentRow);

const roundOf = (t: TournamentRow) => t.rounds[0] as TournamentRound;

describe('hole helpers (field_competition_setup.dart)', () => {
  it('holesWithPar finds par 3s and par 5s', () => {
    expect(holesWithPar(PARS, 3)).toEqual([3, 5, 11, 15]);
    expect(holesWithPar(PARS, 5)).toEqual([4, 8, 16]);
  });

  it('formatHoleList sorts and dedupes', () => {
    expect(formatHoleList([16, 4, 16])).toBe('#4, #16');
  });

  it('par5Holes reads the round pars', () => {
    const t = tourney({});
    expect(par5Holes(t, roundOf(t))).toEqual([4, 8, 16]);
  });

  it('cleanHoleList drops junk and out-of-range holes', () => {
    expect(cleanHoleList([5, '7', 0, 19, 5, 2.5, null, 'x'], 18)).toEqual([5, 7]);
    expect(cleanHoleList('nope', 18)).toEqual([]);
  });
});

describe('ctpRowHoles (ctpRowHolesFor)', () => {
  it('CTP rows = the configured holes, including a short par 4', () => {
    const t = tourney({ ctp_holes: [5, 7, 15] });
    expect(ctpRowHoles(t, roundOf(t))).toEqual([5, 7, 15]);
  });

  it('CTP rows, legacy null = every par 3', () => {
    const t = tourney({});
    expect(ctpRowHoles(t, roundOf(t))).toEqual([3, 5, 11, 15]);
  });

  it('CTP rows keep a hole with a recorded winner off the list', () => {
    const t = tourney({ ctp_holes: [5], closest_to_pin_by_hole: { 11: 'Pat' } });
    expect(ctpRowHoles(t, roundOf(t))).toEqual([5, 11]);
  });
});

describe('longest drive holes (longestDriveHolesLabel)', () => {
  it('names the hole(s), only while LD is on', () => {
    const one = tourney({ longest_drive_holes: [16] });
    const two = tourney({ longest_drive_holes: [16, 4] });
    expect(ldHolesLabel(one, roundOf(one))).toBe('Hole #16');
    expect(ldHolesLabel(two, roundOf(two))).toBe('Holes #4, #16');
    const off = tourney({ longest_drive_holes: [16] }, { ld: false });
    expect(ldHolesLabel(off, roundOf(off))).toBeNull();
    const legacy = tourney({});
    expect(ldHolesLabel(legacy, roundOf(legacy))).toBeNull();
  });

  it('keeps absent and empty apart, like ctp_holes', () => {
    expect(explicitLdHoles({ id: 'r', name: 'r', format: 'x' })).toBeNull();
    expect(explicitLdHoles({ id: 'r', name: 'r', format: 'x', longest_drive_holes: [] }))
      .toEqual([]);
    expect(explicitLdHoles({ id: 'r', name: 'r', format: 'x', longestDriveHoles: [8, 16] }))
      .toEqual([8, 16]);
  });

  it('resolveLdHoles is empty when LD is off', () => {
    const t = tourney({ longest_drive_holes: [16] }, { ld: false });
    expect(resolveLdHoles(t, roundOf(t))).toEqual([]);
  });
});

describe('the Longest Drive option follows the field gender', () => {
  it("men's field: one option, titled Men's Longest Drive", () => {
    expect(longestDriveFormatsFor('male')).toEqual(['mensOnly']);
    expect(longestDriveTitleFor('male')).toBe("Men's Longest Drive");
    expect(longestDriveFormatFrom(['male', 'female'], 'male')).toBe('mensOnly');
    expect(longestDriveFieldNoteFor('male')).toBe("Men's field — one men's winner each round.");
  });

  it("women's field: one option, titled Women's Longest Drive", () => {
    expect(longestDriveFormatsFor('female')).toEqual(['womensOnly']);
    expect(longestDriveTitleFor('female')).toBe("Women's Longest Drive");
    expect(longestDriveFormatFrom(null, 'female')).toBe('womensOnly');
  });

  it('mixed field: three single-choice options, default both', () => {
    expect(longestDriveFormatsFor('mixed')).toEqual(['mensAndWomens', 'mensOnly', 'womensOnly']);
    expect(longestDriveTitleFor('mixed')).toBe('Longest Drive');
    expect(longestDriveFormatFrom(null, 'mixed')).toBe('mensAndWomens');
    expect(longestDriveFormatFrom(['male'], 'mixed')).toBe('mensOnly');
    expect(longestDriveFormatFrom(['female'], 'mixed')).toBe('womensOnly');
    expect(longestDriveFormatFrom(['female', 'male'], 'mixed')).toBe('mensAndWomens');
  });

  it('each option persists the genders the read sites understand', () => {
    expect(LD_FORMAT_GENDERS.mensAndWomens).toEqual(['male', 'female']);
    expect(LD_FORMAT_GENDERS.mensOnly).toEqual(['male']);
    expect(LD_FORMAT_GENDERS.womensOnly).toEqual(['female']);
  });
});

// ── competition_winner.dart ──────────────────────────────────────

const p = (id: string, name: string, gender?: string): TournamentPlayer =>
  ({ id, name, handicapIndex: 10, ...(gender ? { gender } : {}) });
const ROSTER = [
  p('tp_1', 'Casey Kline', 'M'),
  p('tp_2', 'Alex Moore', 'W'),
  p('tp_3', 'Sam Rymer', 'M'),
  p('tp_4', 'Jo Park', 'W'),
];

describe('competitionRosterFor', () => {
  it("lists the round's attending players, sorted by name", () => {
    const t = tourney({ attending_player_ids: ['tp_1', 'tp_2', 'tp_4'] },
      { players: ROSTER, field: 'mixed' });
    expect(competitionRosterFor(t, roundOf(t)).map((x) => x.name))
      .toEqual(['Alex Moore', 'Casey Kline', 'Jo Park']);
  });

  it('a Longest Drive bracket lists only that gender on a mixed field', () => {
    const t = tourney({}, { players: ROSTER, field: 'mixed' });
    expect(competitionRosterFor(t, roundOf(t), 'female').map((x) => x.id))
      .toEqual(['tp_2', 'tp_4']);
    expect(competitionRosterFor(t, roundOf(t), 'male').map((x) => x.id))
      .toEqual(['tp_1', 'tp_3']);
  });

  it('players with no gender inherit the field gender', () => {
    const t = tourney({}, { players: [p('a', 'Ann'), p('b', 'Bea')], field: 'female' });
    expect(competitionRosterFor(t, roundOf(t), 'female')).toHaveLength(2);
    expect(competitionRosterFor(t, roundOf(t), 'male')).toEqual([]);
  });

  it('a mixed-field player with no gender defaults to men', () => {
    expect(effectivePlayerGender(p('a', 'A'), 'mixed')).toBe('male');
    expect(effectivePlayerGender(p('a', 'A', 'f'), 'mixed')).toBe('female');
  });
});

describe('describeCompetitionWinner', () => {
  it('a roster id resolves to the player', () => {
    const d = describeCompetitionWinner(ROSTER, 'tp_3');
    expect(d.player?.id).toBe('tp_3');
    expect(d.legacyText).toBeNull();
  });

  it('a typed name matching one roster player reads as that player', () => {
    const d = describeCompetitionWinner(ROSTER, '  casey kline ');
    expect(d.player?.id).toBe('tp_1');
    expect(d.legacyText).toBeNull();
  });

  it('unknown typed text is legacy, shown as-is', () => {
    const d = describeCompetitionWinner(ROSTER, 'Guest Bob');
    expect(d.player).toBeNull();
    expect(d.legacyText).toBe('Guest Bob');
    expect(d.stored).toBe('Guest Bob');
  });

  it('an ambiguous name is never guessed', () => {
    const dupes = [...ROSTER, p('tp_9', 'Sam Rymer')];
    expect(describeCompetitionWinner(dupes, 'Sam Rymer').legacyText).toBe('Sam Rymer');
  });

  it('empty is empty', () => {
    expect(describeCompetitionWinner(ROSTER, null)).toEqual(
      { player: null, legacyText: null, stored: null });
    expect(describeCompetitionWinner(ROSTER, '  ').player).toBeNull();
  });

  it('same resolution as the spine writer, case by case', () => {
    // Expected ids are what `SpineTournamentCompetitionWriter.resolveWinner`
    // returns for the same inputs in the Dart test.
    const dupes = [...ROSTER, p('tp_9', 'Sam Rymer')];
    const want: Record<string, string | undefined> = {
      tp_1: 'tp_1', 'Casey Kline': 'tp_1', 'casey kline': 'tp_1',
      'Sam Rymer': undefined, 'Guest Bob': undefined, p_me: undefined, ' tp_2 ': 'tp_2',
    };
    for (const [stored, id] of Object.entries(want)) {
      expect(resolveCompetitionWinner(dupes, stored)?.id, stored).toBe(id);
    }
  });
});

describe('acceptWinnerValue — what a save may write', () => {
  const ids = new Set(ROSTER.map((x) => x.id));
  it('a roster id is accepted', () => {
    expect(acceptWinnerValue('tp_2', null, ids)).toEqual({ ok: true, value: 'tp_2' });
  });
  it('blank clears', () => {
    expect(acceptWinnerValue('', 'tp_2', ids)).toEqual({ ok: true, value: null });
    expect(acceptWinnerValue(null, 'tp_2', ids)).toEqual({ ok: true, value: null });
  });
  it('REGRESSION: legacy text re-submitted untouched is KEPT, not cleared', () => {
    expect(acceptWinnerValue('Guest Bob', 'Guest Bob', ids))
      .toEqual({ ok: true, value: 'Guest Bob' });
  });
  it('new free text is refused — winners are picked from the roster', () => {
    expect(acceptWinnerValue('Someone New', 'Guest Bob', ids)).toEqual({ ok: false });
  });
});
