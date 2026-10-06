// ============================================================
// League configuration — the L4 ratchet
// ============================================================
// W2 of the Flutter repo's docs/plans/WEBSITE_APP_PARITY_PLAN.md,
// enforcing its L4: "The team-league form is generated from one
// source. 33 settings today, 23 a few weeks ago, and the stale
// '23-setting preset' copy on /app/leagues/new is the proof that
// hand-maintained counts drift."
//
// `__generated__/league-config.json` is produced by the Flutter repo's
// test/parity/league_config_schema_test.dart, which parses the
// columns, defaults, allowed values and cross-field rules out of
// migration 20261013 and reads the templates out of kLeagueTemplates.
//
// What this file guards, in order of how badly it would hurt:
//
//   1. Every cross-field RULE in the schema has an implementation.
//      Without this, a new Postgres constraint reaches a director as a
//      raw 23514 on submit.
//   2. The Match Play template still carries its preset, and the row
//      we build from it would satisfy those rules.
//   3. The generated file is actually the generated shape, not a
//      hand-edited or truncated copy.
//
// What it CANNOT guard: that this copy is as fresh as the Flutter one.
// The repos are separate and neither CI can see the other, so copying
// the regenerated file across is a manual step. Everything here
// validates the copy we have; the Flutter test validates that copy
// against the migration.

import { describe, expect, it } from 'vitest';

import {
  GENERATED_TEMPLATES,
  LEAGUE_CONFIG_FIELDS,
  LEAGUE_CONFIG_RULES,
  LEAGUE_CONFIG_SOURCE,
  LEAGUE_CONFIG_SOURCES,
  RULE_CHECKS,
  WEB_LEAGUE_TEMPLATES,
  buildLeagueRow,
  leagueConfigField,
  templateByKey,
  validateCreateLeague,
  validateLeagueConfigRow,
} from './leagueCreate';

describe('every cross-field rule is implemented', () => {
  // THE important test in this file. The generated schema carries each
  // constraint's SQL, which we cannot evaluate — so each is hand-
  // implemented in RULE_CHECKS. If migration 20261013 gains a
  // constraint and nobody writes the check, this fails. Without it,
  // the failure mode is a league director pressing Create and getting
  // a Postgres error code.
  it('has a RULE_CHECKS entry for each rule in the schema', () => {
    const missing = LEAGUE_CONFIG_RULES
      .filter((r) => typeof RULE_CHECKS[r.constraint] !== 'function')
      .map((r) => r.constraint);
    expect(missing).toEqual([]);
  });

  it('has no RULE_CHECKS entry for a constraint that no longer exists', () => {
    // The reverse drift: a constraint dropped from the migration leaves
    // dead validation here that may reject a row Postgres would accept.
    const known = new Set(LEAGUE_CONFIG_RULES.map((r) => r.constraint));
    const orphans = Object.keys(RULE_CHECKS).filter((k) => !known.has(k));
    expect(orphans).toEqual([]);
  });

  it('carries the four rules we know about today', () => {
    // A guard against the schema regenerating EMPTY, which would make
    // both tests above vacuously pass.
    expect(LEAGUE_CONFIG_RULES.length).toBeGreaterThanOrEqual(4);
    const names = LEAGUE_CONFIG_RULES.map((r) => r.constraint);
    expect(names).toContain('leagues_absent_rule_format_chk');
    expect(names).toContain('leagues_tie_hole_points_chk');
  });
});

describe('the rules actually reject what Postgres would reject', () => {
  const base = {
    points_model: 'match_play',
    week_format: 'two_singles_team',
    absent_rule: 'ghost',
    points_per_hole: 1,
    tie_hole_points: 0.5,
  };

  it('accepts the shipped preset', () => {
    expect(validateLeagueConfigRow(base)).toEqual([]);
  });

  it('rejects forfeit_hole outside best_ball', () => {
    // leagues_absent_rule_format_chk. This is the pairing a hand-built
    // form would have offered freely.
    const problems = validateLeagueConfigRow({
      ...base,
      absent_rule: 'forfeit_hole',
    });
    expect(problems).toHaveLength(1);
    expect(problems[0].message).toMatch(/best-ball/i);
  });

  it('allows forfeit_hole when the format IS best_ball', () => {
    expect(validateLeagueConfigRow({
      ...base,
      week_format: 'best_ball',
      absent_rule: 'forfeit_hole',
    })).toEqual([]);
  });

  it('rejects against_par on a best_ball league', () => {
    const problems = validateLeagueConfigRow({
      ...base,
      week_format: 'best_ball',
      absent_rule: 'against_par',
    });
    expect(problems).toHaveLength(1);
    expect(problems[0].message).toMatch(/singles/i);
  });

  it('rejects a tie worth anything but 0 or half a hole', () => {
    expect(validateLeagueConfigRow({ ...base, tie_hole_points: 0.25 }))
      .toHaveLength(1);
    // Both legal values pass.
    expect(validateLeagueConfigRow({ ...base, tie_hole_points: 0 })).toEqual([]);
    expect(validateLeagueConfigRow({ ...base, tie_hole_points: 0.5 })).toEqual([]);
    // And it scales with points_per_hole rather than hard-coding 0.5.
    expect(validateLeagueConfigRow({
      ...base,
      points_per_hole: 2,
      tie_hole_points: 1,
    })).toEqual([]);
  });

  it('rejects a non-match-play weekly format on a match-play league', () => {
    const problems = validateLeagueConfigRow({ ...base, week_format: 'stableford' });
    expect(problems).toHaveLength(1);
  });

  it('leaves non-match-play leagues alone', () => {
    // Every cross-field rule is conditioned on points_model =
    // 'match_play'. A position league must not be validated against
    // them, or Standard/Weekly/Member-Guest stop being creatable.
    expect(validateLeagueConfigRow({
      points_model: 'position',
      week_format: 'stableford',
      absent_rule: 'forfeit_hole',
    })).toEqual([]);
  });

  it('accepts a null allowance and rejects one out of range', () => {
    expect(validateLeagueConfigRow({ ...base, allowance_pct: null })).toEqual([]);
    expect(validateLeagueConfigRow({ ...base, allowance_pct: 85 })).toEqual([]);
    expect(validateLeagueConfigRow({ ...base, allowance_pct: 20 })).toHaveLength(1);
    expect(validateLeagueConfigRow({ ...base, allowance_pct: 120 })).toHaveLength(1);
  });
});

describe('the Match Play template', () => {
  it('is offered on the web at all', () => {
    // The thing W2 exists to deliver. Before this slice the page
    // steered directors to the app instead.
    const t = templateByKey('matchplay');
    expect(t.key).toBe('matchplay');
    expect(t.pointsModel).toBe('match_play');
    expect(t.matchColumns).toBeTruthy();
  });

  it("carries the app's preset verbatim, not a restatement", () => {
    const web = templateByKey('matchplay').matchColumns!;
    const generated = GENERATED_TEMPLATES.find((t) => t.id === 'teamLeague')!;
    expect(web).toEqual(generated.matchPreset);
  });

  it('sets the two values the old comment called out as divergent', () => {
    // The previous comment in leagueCreate.ts named these exactly:
    // "team_size 1 vs 2, week_format match_play_singles vs
    // two_singles_team" — the DB defaults versus the app's preset.
    const mc = templateByKey('matchplay').matchColumns!;
    expect(mc.team_size).toBe(2);
    expect(mc.week_format).toBe('two_singles_team');
    // And those really are different from the column defaults, which
    // is why writing nothing would have produced the wrong league.
    expect(leagueConfigField('team_size')?.default).toBe('1');
    expect(leagueConfigField('week_format')?.default).toBe("'match_play_singles'");
  });

  it('builds a row that writes every preset column', () => {
    const row = buildLeagueRow(
      { name: 'Thursday Pairs', template: 'matchplay', scheduleEnabled: false },
      'user-1',
      1700000000000,
    );
    const mc = templateByKey('matchplay').matchColumns!;
    for (const [k, v] of Object.entries(mc)) {
      expect(row[k]).toBe(v);
    }
    expect(row.points_model).toBe('match_play');
  });

  it('builds a row the DB constraints would accept', () => {
    const row = buildLeagueRow(
      { name: 'Thursday Pairs', template: 'matchplay', scheduleEnabled: false },
      'user-1',
    );
    expect(validateLeagueConfigRow(row)).toEqual([]);
    expect(validateCreateLeague({ name: 'Thursday Pairs', template: 'matchplay' }))
      .toEqual([]);
  });

  it('writes only columns the client is allowed to patch', () => {
    // kLeagueMatchConfigColumns is the app's allow-list; updateLeague
    // throws on anything outside it. A preset key outside that set
    // would be a column this client has no business writing.
    const mc = templateByKey('matchplay').matchColumns!;
    const patchable = new Set(
      LEAGUE_CONFIG_FIELDS.filter((f) => f.clientPatchable).map((f) => f.name),
    );
    for (const k of Object.keys(mc)) expect(patchable).toContain(k);
  });
});

describe('other templates are unchanged by W2', () => {
  // The risk in generating this file is a regression in the three
  // templates that already worked. None of them may gain match columns.
  for (const key of ['standard', 'weekly', 'memberguest', 'custom']) {
    it(`${key} writes no match-play columns`, () => {
      const t = templateByKey(key);
      expect(t.matchColumns).toBeNull();
      const row = buildLeagueRow({ name: 'X', template: key }, 'u');
      expect(row.team_size).toBeUndefined();
      expect(row.week_format).toBeUndefined();
    });
  }

  it('keeps Standard first, so the default selection did not move', () => {
    expect(WEB_LEAGUE_TEMPLATES[0].key).toBe('standard');
  });

  it('offers five cards, with Custom last', () => {
    expect(WEB_LEAGUE_TEMPLATES).toHaveLength(5);
    expect(WEB_LEAGUE_TEMPLATES[WEB_LEAGUE_TEMPLATES.length - 1].key).toBe('custom');
    expect(WEB_LEAGUE_TEMPLATES.map((t) => t.key)).toContain('matchplay');
  });

  it('gives every card a blurb and a title', () => {
    for (const t of WEB_LEAGUE_TEMPLATES) {
      expect(t.title.length).toBeGreaterThan(0);
      expect(t.blurb.length).toBeGreaterThan(0);
    }
  });
});

describe('schedule formats are seeded per slot, like the app', () => {
  // The website used to write `formats: {}` while the app seeds the
  // template's default format into every generated slot. A league
  // created on the web showed unlabelled weeks in the schedule editor.
  it('labels every slot for a template with a default format', () => {
    const row = buildLeagueRow({
      name: 'Weekly',
      template: 'weekly',
      scheduleEnabled: true,
      startDate: '2026-04-02',
      eventCount: 4,
    }, 'u');
    const schedule = row.schedule as { formats: Record<string, string>; eventCount: number };
    expect(Object.keys(schedule.formats)).toEqual(['0', '1', '2', '3']);
    expect(schedule.eventCount).toBe(4);
    const t = templateByKey('weekly');
    expect(new Set(Object.values(schedule.formats))).toEqual(
      new Set([t.defaultWeekFormat!]),
    );
  });

  it('leaves Custom slots unlabelled, matching the app sentinel', () => {
    const row = buildLeagueRow({
      name: 'C',
      template: 'custom',
      scheduleEnabled: true,
      startDate: '2026-04-02',
      eventCount: 3,
    }, 'u');
    const schedule = row.schedule as { formats: Record<string, string> };
    expect(schedule.formats).toEqual({});
  });

  it('writes no schedule at all when it is disabled', () => {
    const row = buildLeagueRow(
      { name: 'X', template: 'weekly', scheduleEnabled: false },
      'u',
    );
    expect(row.schedule).toBeUndefined();
  });
});

describe('the generated file is the generated shape', () => {
  // Catches a hand-edited, truncated or stale copy — the failure the
  // whole single-source design exists to prevent.
  it('names the migrations it was parsed from', () => {
    expect(LEAGUE_CONFIG_SOURCE).toMatch(/20261013_league_weekly_matchup_tables\.sql$/);
    expect(LEAGUE_CONFIG_SOURCES).toHaveLength(4);
    expect(LEAGUE_CONFIG_SOURCES.join(' ')).toMatch(/20261025_league_season_dues/);
  });

  it('carries all 34 configuration columns, not just the first migration\'s 23', () => {
    // Was 23 until 2026-10-05. The generator read ONE migration, so
    // nine columns that landed on `leagues` afterwards were invisible
    // to this file — a settings form built from it would have silently
    // omitted the weekly pot, the reminder time and the season dues.
    expect(LEAGUE_CONFIG_FIELDS).toHaveLength(34);
    for (const name of [
      'pot_skins', 'pot_skins_entry', 'pot_skins_carryover',
      'pot_ctp_entry', 'pot_ld_entry', 'pot_ctp_holes', 'pot_ld_holes',
      'reminder_time', 'timezone',
      'dues_cents', 'dues_due_date',
    ]) {
      expect(leagueConfigField(name), `${name} missing`).toBeDefined();
    }
  });

  it('carries the array and date shapes the old parse could not express', () => {
    expect(leagueConfigField('pot_ctp_holes')!.type).toBe('smallint[]');
    expect(leagueConfigField('pot_skins_entry')!.type).toBe('numeric(6,2)');
    const due = leagueConfigField('dues_due_date')!;
    expect(due.type).toBe('date');
    expect(due.notNull).toBe(false);
    expect(due.default).toBeNull();
  });

  it('clientPatchable is the app matchColumns allow-list, NOT a permission', () => {
    // dues_* are written by the app every day through their own typed
    // updateLeague arguments, and RLS lets a league owner update any
    // column on their own row. A form must not read `false` here as
    // "read-only".
    expect(leagueConfigField('pot_skins')!.clientPatchable).toBe(true);
    expect(leagueConfigField('dues_cents')!.clientPatchable).toBe(false);
  });

  it('carries types, defaults and nullability, not just names', () => {
    const teamSize = leagueConfigField('team_size')!;
    expect(teamSize.type).toBe('smallint');
    expect(teamSize.notNull).toBe(true);
    expect(teamSize.allowed).toEqual(['1', '2']);

    // A nullable column with no default must survive as null, or the
    // form would send 0 where the app sends nothing.
    const allowance = leagueConfigField('allowance_pct')!;
    expect(allowance.notNull).toBe(false);
    expect(allowance.default).toBeNull();
  });

  it('does NOT treat a conditional constraint as an allowed-value list', () => {
    // week_format's only check is conditional on points_model, so it
    // must arrive with `allowed: null` and be governed by a rule. If a
    // regeneration ever flattened it into an allowed list, the form
    // would offer best_ball on a league where it is legal and
    // match_play_singles where it is not, with no rule to catch it.
    expect(leagueConfigField('week_format')?.allowed).toBeNull();
    expect(LEAGUE_CONFIG_RULES.map((r) => r.constraint))
      .toContain('leagues_match_play_format_chk');
  });

  it('has a template for every web card', () => {
    expect(GENERATED_TEMPLATES.length).toBeGreaterThanOrEqual(4);
    expect(GENERATED_TEMPLATES.filter((t) => t.matchPreset)).toHaveLength(1);
  });
});
