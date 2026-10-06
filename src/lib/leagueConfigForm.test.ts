import { describe, expect, it } from 'vitest';
import { LEAGUE_CONFIG_FIELDS, leagueConfigField } from './leagueCreate';
import {
  buildConfigPatch,
  coerceConfigValue,
  defaultDisplay,
  groupedConfigFields,
  inputKindFor,
  numberStepFor,
  parseIntList,
  sameValue,
  suggestionsFor,
} from './leagueConfigForm';

const f = (n: string) => leagueConfigField(n)!;

describe('groupedConfigFields', () => {
  it('places EVERY generated field in exactly one group', () => {
    // This is the anti-drift guard. A column added to `leagues` and
    // regenerated into the schema must be given a home here, or the
    // settings page would silently omit it — the exact failure that
    // made the generator read one migration for three weeks.
    const groups = groupedConfigFields();
    const placed = groups.flatMap((g) => g.fields.map((x) => x.name));
    expect(new Set(placed).size).toBe(placed.length); // no field twice
    expect(placed.sort()).toEqual(LEAGUE_CONFIG_FIELDS.map((x) => x.name).sort());
  });

  it('has no "Other" group — that bucket means a field was forgotten', () => {
    expect(groupedConfigFields().find((g) => g.key === 'other')).toBeUndefined();
  });

  it('but DOES catch a stray field rather than dropping it', () => {
    const stray = { ...f('team_size'), name: 'invented_column' };
    const groups = groupedConfigFields([...LEAGUE_CONFIG_FIELDS, stray]);
    const other = groups.find((g) => g.key === 'other');
    expect(other?.fields.map((x) => x.name)).toEqual(['invented_column']);
  });
});

describe('inputKindFor', () => {
  it('reads the control off the SQL type and the CHECK', () => {
    expect(inputKindFor(f('team_size'))).toBe('select'); // has allowed
    expect(inputKindFor(f('pot_skins_carryover'))).toBe('checkbox');
    expect(inputKindFor(f('pot_ctp_holes'))).toBe('intlist');
    expect(inputKindFor(f('reminder_time'))).toBe('time');
    expect(inputKindFor(f('dues_due_date'))).toBe('date');
    expect(inputKindFor(f('dues_cents'))).toBe('number');
    expect(inputKindFor(f('points_per_hole'))).toBe('number');
    expect(inputKindFor(f('timezone'))).toBe('text');
  });
});

describe('numberStepFor', () => {
  it('matches the column scale, so a form cannot submit unstorable precision', () => {
    expect(numberStepFor(f('points_per_hole'))).toBe('0.1'); // numeric(3,1)
    expect(numberStepFor(f('pot_skins_entry'))).toBe('0.01'); // numeric(6,2)
    expect(numberStepFor(f('dues_cents'))).toBe('1'); // integer
    expect(numberStepFor(f('team_size'))).toBe('1'); // smallint
  });
});

describe('suggestionsFor', () => {
  it('uses the allowed list when the CHECK is single-column', () => {
    expect(suggestionsFor(f('absent_rule'))).toEqual([
      'ghost', 'against_par', 'forfeit_hole',
    ]);
  });

  it('falls back to the cross-field rule for week_format', () => {
    // week_format has no `allowed` — its CHECK is conditional on
    // points_model, so the generator puts it in `rules`. The form
    // still needs the vocabulary.
    const s = suggestionsFor(f('week_format'));
    expect(s).toContain('match_play_singles');
    expect(s).toContain('best_ball');
  });

  it('returns nothing for a column no rule constrains', () => {
    expect(suggestionsFor(f('timezone'))).toEqual([]);
  });
});

describe('defaultDisplay', () => {
  it('strips the SQL quoting', () => {
    expect(defaultDisplay(f('timezone'))).toBe('America/Denver');
    expect(defaultDisplay(f('pot_skins'))).toBe('off');
    expect(defaultDisplay(f('dues_cents'))).toBe('0');
  });

  it('renders an empty array default as empty, not "{}"', () => {
    expect(defaultDisplay(f('pot_ctp_holes'))).toBe('');
  });

  it('is null when the column has no default', () => {
    expect(defaultDisplay(f('allowance_pct'))).toBeNull();
  });
});

describe('parseIntList', () => {
  it('reads every shape the wire and the form produce', () => {
    expect(parseIntList('{3,7}')).toEqual([3, 7]);
    expect(parseIntList('3, 7')).toEqual([3, 7]);
    expect(parseIntList('7 3')).toEqual([3, 7]);
    expect(parseIntList([7, 3])).toEqual([3, 7]);
  });

  it('normalises order and duplicates so the same set is not a change', () => {
    expect(parseIntList('7,3,7')).toEqual([3, 7]);
  });

  it('empty and nonsense are an empty list', () => {
    expect(parseIntList('')).toEqual([]);
    expect(parseIntList('{}')).toEqual([]);
    expect(parseIntList(null)).toEqual([]);
    expect(parseIntList('abc')).toEqual([]);
  });
});

describe('coerceConfigValue', () => {
  it('an empty box clears a NULLABLE column', () => {
    expect(coerceConfigValue(f('allowance_pct'), '')).toBeNull();
    expect(coerceConfigValue(f('dues_due_date'), '')).toBeNull();
  });

  it('an empty box LEAVES a NOT NULL column alone — never sends null', () => {
    // Sending null to a NOT NULL column is a 23502 the director can do
    // nothing about, so an empty box has to mean "no change".
    expect(coerceConfigValue(f('team_size'), '')).toBeUndefined();
    expect(coerceConfigValue(f('timezone'), '   ')).toBeUndefined();
  });

  it('numbers come through as numbers, nonsense as no change', () => {
    expect(coerceConfigValue(f('dues_cents'), '4500')).toBe(4500);
    expect(coerceConfigValue(f('points_per_hole'), '1.5')).toBe(1.5);
    expect(coerceConfigValue(f('dues_cents'), 'abc')).toBeUndefined();
  });

  it('an unchecked checkbox is false, not missing', () => {
    expect(coerceConfigValue(f('pot_skins_carryover'), undefined)).toBe(false);
    expect(coerceConfigValue(f('pot_skins_carryover'), 'on')).toBe(true);
  });
});

describe('buildConfigPatch', () => {
  const current = {
    team_size: 2,
    timezone: 'America/Denver',
    points_per_hole: '1.0',
    pot_ctp_holes: '{3,7}',
    pot_skins_carryover: true,
    reminder_time: '09:00:00',
    allowance_pct: null,
    dues_cents: 0,
  };

  it('sends only what changed', () => {
    const patch = buildConfigPatch(
      { team_size: '2', timezone: 'America/Phoenix', dues_cents: '4500' },
      current,
    );
    expect(patch).toEqual({ timezone: 'America/Phoenix', dues_cents: 4500 });
  });

  it('a numeric that reads back as a string is not a change', () => {
    // Postgres hands numeric(3,1) back as "1.0"; the form submits "1".
    expect(buildConfigPatch({ points_per_hole: '1' }, current)).toEqual({});
  });

  it('a reordered array is not a change', () => {
    expect(buildConfigPatch({ pot_ctp_holes: '7, 3' }, current)).toEqual({});
    expect(buildConfigPatch({ pot_ctp_holes: '3,7,9' }, current))
      .toEqual({ pot_ctp_holes: [3, 7, 9] });
  });

  it('"09:00" from a time input is not a change against "09:00:00"', () => {
    expect(buildConfigPatch({ reminder_time: '09:00' }, current)).toEqual({});
    expect(buildConfigPatch({ reminder_time: '07:30' }, current))
      .toEqual({ reminder_time: '07:30' });
  });

  it('unchecking a checkbox IS a change', () => {
    expect(buildConfigPatch({ pot_skins_carryover: undefined }, current))
      .toEqual({ pot_skins_carryover: false });
  });

  it('clearing a nullable column IS a change; clearing a NOT NULL one is not', () => {
    expect(buildConfigPatch({ dues_cents: '' }, { ...current, dues_cents: 4500 }))
      .toEqual({});
    expect(buildConfigPatch({ allowance_pct: '85' }, current))
      .toEqual({ allowance_pct: 85 });
    expect(buildConfigPatch({ allowance_pct: '' }, { ...current, allowance_pct: 85 }))
      .toEqual({ allowance_pct: null });
  });

  it('fields the form did not submit are never touched', () => {
    expect(buildConfigPatch({}, current)).toEqual({});
  });
});

describe('sameValue', () => {
  it('treats null and undefined as the same absence', () => {
    expect(sameValue(f('allowance_pct'), null, undefined)).toBe(true);
  });
});
