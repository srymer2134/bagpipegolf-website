import { describe, expect, it } from 'vitest';
import { LEAGUE_CONFIG_FIELDS } from './leagueCreate';
import {
  appliesTo,
  centsToInput,
  FIELD_COPY,
  fieldLabel,
  inputToCents,
  sectionEmptyReason,
  VALUE_COPY,
  valueHelp,
  valueLabel,
} from './leagueFieldLanguage';
import { suggestionsFor } from './leagueConfigForm';

describe('every generated field has human copy', () => {
  it('has a label for all 34 columns — no raw snake_case reaches the page', () => {
    const missing = LEAGUE_CONFIG_FIELDS
      .filter((f) => !FIELD_COPY[f.name])
      .map((f) => f.name);
    expect(missing).toEqual([]);
  });

  it('no label still contains an underscore', () => {
    const ugly = LEAGUE_CONFIG_FIELDS
      .map((f) => fieldLabel(f.name))
      .filter((l) => l.includes('_'));
    expect(ugly).toEqual([]);
  });

  it('every selectable VALUE has a label too', () => {
    // The complaint that started this: a dropdown reading
    // "off_low_in_match". Covers both the enum columns and the ones
    // whose vocabulary comes from a cross-field rule (week_format).
    const missing: string[] = [];
    for (const f of LEAGUE_CONFIG_FIELDS) {
      for (const v of suggestionsFor(f)) {
        if (!VALUE_COPY[f.name]?.[v]) missing.push(`${f.name}=${v}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('no value label still contains an underscore', () => {
    const ugly: string[] = [];
    for (const f of LEAGUE_CONFIG_FIELDS) {
      for (const v of suggestionsFor(f)) {
        if (valueLabel(f.name, v).includes('_')) ugly.push(`${f.name}=${v}`);
      }
    }
    expect(ugly).toEqual([]);
  });
});

describe('the jargon a director asked about', () => {
  it('"ghost" is explained rather than shown as a word', () => {
    expect(valueLabel('absent_rule', 'ghost')).toBe('A ghost score is used');
    expect(valueHelp('absent_rule', 'ghost')).toMatch(/stand-in score/i);
  });

  it('off_low_in_match reads as English', () => {
    expect(valueLabel('handicap_basis', 'off_low_in_match'))
      .toBe('Off the low handicap');
    expect(valueHelp('handicap_basis', 'off_low_in_match'))
      .toMatch(/plays scratch/i);
  });
});

describe('appliesTo — not every league is match play', () => {
  const matchPlay = { points_model: 'match_play', team_size: 2 };
  const position = { points_model: 'position', team_size: 1 };

  it('hides match-only settings from a position league', () => {
    for (const n of ['week_format', 'points_per_hole', 'points_per_match', 'bye_rule']) {
      expect(appliesTo(n, position), n).toBe(false);
      expect(appliesTo(n, matchPlay), n).toBe(true);
    }
  });

  it('keeps settings that apply to any league', () => {
    for (const n of ['holes_per_week', 'timezone', 'dues_cents', 'pot_skins',
      'sub_handicap_rule', 'attendance_points', 'default_course_id']) {
      expect(appliesTo(n, position), n).toBe(true);
    }
  });

  it('hides team settings when a side is one player', () => {
    expect(appliesTo('team_points_basis', { ...matchPlay, team_size: 1 })).toBe(false);
    expect(appliesTo('team_points_basis', { ...matchPlay, team_size: 2 })).toBe(true);
  });

  it('shows the ghost detail only when ghost scores are in use', () => {
    const f = 'absent_ghost_strokes_over_net_par';
    expect(appliesTo(f, { ...matchPlay, absent_rule: 'ghost' })).toBe(true);
    expect(appliesTo(f, { ...matchPlay, absent_rule: 'against_par' })).toBe(false);
  });

  it('shows skins detail only once skins are on', () => {
    expect(appliesTo('pot_skins_entry', { pot_skins: 'off' })).toBe(false);
    expect(appliesTo('pot_skins_entry', { pot_skins: 'net' })).toBe(true);
    expect(appliesTo('pot_skins_carryover', { pot_skins: 'gross' })).toBe(true);
  });

  it('shows contest holes only once that contest has an entry', () => {
    expect(appliesTo('pot_ctp_holes', { pot_ctp_entry: 0 })).toBe(false);
    expect(appliesTo('pot_ctp_holes', { pot_ctp_entry: '5.00' })).toBe(true);
    expect(appliesTo('pot_ld_holes', { pot_ld_entry: 2 })).toBe(true);
  });

  it('hiding is display only — a value is never cleared', () => {
    // The whole set is still writable; appliesTo governs rendering, so
    // switching a league back to match play restores its settings
    // untouched. This test documents the intent.
    expect(appliesTo('week_format', position)).toBe(false);
    expect(appliesTo('week_format', matchPlay)).toBe(true);
  });
});

describe('sectionEmptyReason', () => {
  it('explains an empty scoring card instead of showing a blank', () => {
    expect(sectionEmptyReason('scoring', { points_model: 'position' }))
      .toMatch(/describe a match/i);
    expect(sectionEmptyReason('scoring', { points_model: 'match_play' }))
      .toBeNull();
  });

  it('says nothing about sections that always apply', () => {
    expect(sectionEmptyReason('dues', { points_model: 'position' })).toBeNull();
    expect(sectionEmptyReason('pot', { points_model: 'position' })).toBeNull();
  });
});

describe('dues are typed in dollars, stored in cents', () => {
  it('cents render as dollars', () => {
    expect(centsToInput(4500)).toBe('45');
    expect(centsToInput(4550)).toBe('45.50');
    expect(centsToInput(1)).toBe('0.01');
  });

  it('zero and nonsense render as an empty box, never "$0"', () => {
    expect(centsToInput(0)).toBe('');
    expect(centsToInput(null)).toBe('');
    expect(centsToInput('abc')).toBe('');
  });

  it('dollars typed become cents, rounded not truncated', () => {
    expect(inputToCents('45')).toBe(4500);
    expect(inputToCents('45.50')).toBe(4550);
    // 45.55 * 100 is 4554.999… in binary floating point.
    expect(inputToCents('45.55')).toBe(4555);
    expect(inputToCents('$1,200')).toBe(120000);
  });

  it('blank is zero and negative clamps — the column has a >= 0 CHECK', () => {
    expect(inputToCents('')).toBe(0);
    expect(inputToCents('abc')).toBe(0);
    expect(inputToCents('-20')).toBe(2000);
  });

  it('round-trips', () => {
    for (const c of [0, 1, 999, 4500, 4555, 120000]) {
      expect(inputToCents(centsToInput(c))).toBe(c);
    }
  });
});
