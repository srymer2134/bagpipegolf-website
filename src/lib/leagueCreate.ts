// ── Creating a league from the website ──────────────────────────
//
// WHY SUPABASE-DIRECT AND NOT RAILWAY
//
// Tournaments create through Railway, so that looks like the pattern to
// copy. It isn't, for leagues. `routes/leagues.ts` says why in its own
// header: leagues are "otherwise entirely Supabase-direct", and the
// Railway router exists for ONE reason — email invites need SendGrid,
// which only exists server-side.
//
// Routing create through Railway would give leagues two create paths —
// the app inserting directly, the website going through an API — with
// two sets of validation to keep in step. That is the same second-writer
// problem that keeps the portal's manage page read-only.
//
// So this mirrors `LeagueNotifier.createLeague` in the Flutter app
// exactly: same id shape, same column names, same defaults. RLS permits
// it — `leagues` has `Owner manages own leagues` ALL with
// `with_check (user_id = auth.uid())`, verified 2026-09-30.
//
// If §9 (data-path consolidation) later moves league writes behind
// Railway, it moves BOTH callers at once. That is the right time.

export type PointsModel = 'position' | 'stroke_aggregate' | 'match_play';
export type SubScoringRule = 'regular_keeps_sub' | 'blind_default' | 'sub_takes_regular_zero';

// ── The generated league configuration schema ───────────────────
//
// W2 of the parity plan, satisfying its L4: "The team-league form is
// generated from one source. 33 settings today, 23 a few weeks ago,
// and the stale '23-setting preset' copy on /app/leagues/new is the
// proof that hand-maintained counts drift."
//
// `__generated__/league-config.json` is produced by the Flutter repo's
// test/parity/league_config_schema_test.dart, which parses the columns,
// defaults, allowed values and CROSS-FIELD RULES out of migration
// 20261013 and reads the templates out of kLeagueTemplates. It is not
// hand-maintained.
//
// 🚨 WHAT IS AND IS NOT GUARDED. The Flutter test guards that ITS copy
// matches the migration. `leagueConfig.test.ts` guards that this copy
// is well-formed, complete (23 columns), and that every cross-field
// rule in it has an implementation here. **Nothing automatically
// checks that this copy is as FRESH as the Flutter one** — the repos
// are separate and neither CI can see the other. So the copy step is
// not optional, and a schema change is a two-repo change:
//
//   1. (flutter) REGEN=1 flutter test test/parity/league_config_schema_test.dart
//   2. verify the diff
//   3. cp test/parity/league_config_schema.json \
//        ../bagpipegolf-website/src/lib/__generated__/league-config.json
//   4. npm test here, and implement any new rule it names
//
// This is what made Match Play League possible here. The previous
// comment in this file explained why it could not be: restating the
// preset would be a second definition of the same template, and the
// only cross-repo drift guard we had silently passed in CI. W0 gave
// this repo real CI; this file gives the preset one home.

import rawConfig from './__generated__/league-config.json';

export type LeagueConfigField = {
  name: string;
  type: string;
  notNull: boolean;
  default: string | null;
  allowed: string[] | null;
  allowedFrom: string | null;
  clientPatchable: boolean;
};

export type LeagueConfigRule = {
  constraint: string;
  sql: string;
  fields: string[];
  summary: string;
};

export type GeneratedTemplate = {
  id: string;
  title: string;
  rosterHint: string;
  scheduleEnabled: boolean;
  intervalDays: number;
  eventCount: number;
  pointsModel: PointsModel;
  defaultWeekFormat: string;
  subScoringRule: SubScoringRule;
  flightCount: number;
  playoffSize: number;
  matchPreset: Record<string, string | number> | null;
};

export const LEAGUE_CONFIG_FIELDS = rawConfig.fields as LeagueConfigField[];
export const LEAGUE_CONFIG_RULES = rawConfig.rules as LeagueConfigRule[];
export const GENERATED_TEMPLATES = rawConfig.templates as GeneratedTemplate[];
export const LEAGUE_CONFIG_SOURCE = rawConfig.source as string;

/// A field's definition by column name, for a form that renders itself.
export function leagueConfigField(name: string): LeagueConfigField | undefined {
  return LEAGUE_CONFIG_FIELDS.find((f) => f.name === name);
}

export type LeagueTemplate = {
  key: string;
  title: string;
  blurb: string;
  rosterHint: string;
  pointsModel: PointsModel;
  subScoringRule: SubScoringRule;
  intervalDays: number;
  eventCount: number;
  flightCount: number;
  playoffSize: number;
  /// Seeded into every generated schedule slot, matching the app's
  /// wizard (`_buildSchedule` in new_league_screen.dart). Null means
  /// "leave the slots unlabelled" — the Custom card.
  defaultWeekFormat: string | null;
  /// The `public.leagues` configuration columns this template writes.
  /// Only the match-play template sets any; for every other template
  /// the DB defaults stand and the row is shaped exactly as before.
  matchColumns: Record<string, string | number> | null;
};

/// Website-only presentation copy, keyed by the Dart template id. The
/// app has no blurb field — these are marketing sentences, not
/// configuration, so they live here and nowhere else. A Dart id with
/// no entry falls back to its rosterHint rather than rendering blank.
const BLURBS: Record<string, string> = {
  travelTeam: 'Events on dates you pick. Cumulative net strokes; lowest wins.',
  weeklyRecurring: 'A fixed weekly night. Finish-position points across the season.',
  teamLeague:
    'Two-player teams, head to head every week. Two singles matches plus a team point.',
  memberGuest: 'A two-day event scored as a season. Three flights.',
};

/// Stable form values, so a bookmarked or in-flight form keeps working.
/// The Dart ids are internal; these strings are in the HTML.
const WEB_KEYS: Record<string, string> = {
  travelTeam: 'standard',
  weeklyRecurring: 'weekly',
  teamLeague: 'matchplay',
  memberGuest: 'memberguest',
};

/// Display order on /app/leagues/new. Deliberately NOT the Dart
/// catalog order: that would move Standard out of the first slot and
/// change which card is pre-selected, which is a UX change nobody
/// asked for. Match Play sits next to Weekly because they are the two
/// recurring-season templates.
const WEB_ORDER = ['standard', 'weekly', 'matchplay', 'memberguest'];

function fromGenerated(t: GeneratedTemplate): LeagueTemplate {
  return {
    key: WEB_KEYS[t.id] ?? t.id,
    title: t.title,
    blurb: BLURBS[t.id] ?? t.rosterHint,
    rosterHint: t.rosterHint,
    pointsModel: t.pointsModel,
    subScoringRule: t.subScoringRule,
    intervalDays: t.intervalDays,
    eventCount: t.eventCount,
    flightCount: t.flightCount,
    playoffSize: t.playoffSize,
    defaultWeekFormat: t.defaultWeekFormat,
    matchColumns: t.matchPreset,
  };
}

/// Custom is not in `kLeagueTemplates` — the app's wizard appends it as
/// a sentinel that applies no presets at all. Mirrored here with the
/// same meaning: no match columns, no seeded formats.
const CUSTOM_TEMPLATE: LeagueTemplate = {
  key: 'custom',
  title: 'Custom',
  blurb: 'Set the cadence and scoring yourself.',
  rosterHint: 'No defaults applied',
  pointsModel: 'position',
  subScoringRule: 'regular_keeps_sub',
  intervalDays: 7,
  eventCount: 8,
  flightCount: 1,
  playoffSize: 0,
  defaultWeekFormat: null,
  matchColumns: null,
};

/// The template set, derived from the generated catalog. Adding a
/// template in Dart makes it appear here once the schema is
/// regenerated; it does not need editing in this file, only a `BLURBS`
/// line and a `WEB_ORDER` slot.
export const WEB_LEAGUE_TEMPLATES: LeagueTemplate[] = [
  ...WEB_ORDER.map((key) => {
    const t = GENERATED_TEMPLATES.find((g) => WEB_KEYS[g.id] === key);
    if (!t) {
      throw new Error(
        `league-config.json has no template for web key "${key}". ` +
          'Regenerate it from the Flutter repo, or drop the key from WEB_ORDER.',
      );
    }
    return fromGenerated(t);
  }),
  CUSTOM_TEMPLATE,
];

export function templateByKey(key: string | null | undefined): LeagueTemplate {
  return WEB_LEAGUE_TEMPLATES.find((t) => t.key === key) ?? WEB_LEAGUE_TEMPLATES[0];
}

export type CreateLeagueInput = {
  name: string;
  description?: string | null;
  template?: string | null;
  pointsModel?: PointsModel | null;
  startDate?: string | null;
  intervalDays?: number | null;
  eventCount?: number | null;
  scheduleEnabled?: boolean;
};

export type CreateLeagueProblem = { field: string; message: string };

/** Validate the way the DB and the app would, before we touch either. */
export function validateCreateLeague(input: CreateLeagueInput): CreateLeagueProblem[] {
  const out: CreateLeagueProblem[] = [];
  const name = (input.name ?? '').trim();
  if (!name) out.push({ field: 'name', message: 'Give the league a name.' });
  if (name.length > 120) out.push({ field: 'name', message: 'Keep the name under 120 characters.' });

  if (input.scheduleEnabled) {
    if (!input.startDate || !/^\d{4}-\d{2}-\d{2}$/.test(input.startDate)) {
      out.push({ field: 'startDate', message: 'Pick a first event date.' });
    }
    const n = input.eventCount ?? 0;
    // Matches the app's stepper bounds (league_schedule_dialog.dart).
    if (n < 2 || n > 52) out.push({ field: 'eventCount', message: 'Between 2 and 52 events.' });
    const iv = input.intervalDays ?? 0;
    if (iv < 1 || iv > 30) out.push({ field: 'intervalDays', message: 'Between 1 and 30 days apart.' });
  }

  // The template's own configuration columns, checked against the DB's
  // cross-field constraints. A template that violates one is a 23514
  // for every director who picks it, so this catches it at the form.
  const t = templateByKey(input.template);
  if (t.matchColumns) {
    out.push(...validateLeagueConfigRow({
      ...t.matchColumns,
      points_model: input.pointsModel ?? t.pointsModel,
    }));
  }
  return out;
}

/**
 * Build the insert payload, column-for-column with the app's
 * `createLeague`. Pure — no Supabase import — so it unit-tests without
 * a configured client.
 */
export function buildLeagueRow(
  input: CreateLeagueInput,
  userId: string,
  now: number = Date.now(),
): Record<string, unknown> {
  const t = templateByKey(input.template);
  const pointsModel = input.pointsModel ?? t.pointsModel;
  const name = (input.name ?? '').trim();
  const description = (input.description ?? '').trim();

  const row: Record<string, unknown> = {
    // Same shape the app mints: `league_<epoch ms>`. The column is text,
    // and several tables FK to it, so the shape is load-bearing.
    id: `league_${now}`,
    user_id: userId,
    name,
    event_tournament_ids: [],
    points_model: pointsModel,
    sub_scoring_rule: t.subScoringRule,
    flight_count: t.flightCount,
    playoff_size: t.playoffSize,
  };
  if (description) row.description = description;

  // The match-play configuration columns. Only the Match Play League
  // template carries any; for every other template this spreads
  // nothing and the row is shaped exactly as it was before W2, with
  // the DB defaults standing. The values come from the generated
  // schema, so they are the app's preset verbatim rather than a second
  // copy of it — which is the whole reason this template could not be
  // offered here before.
  if (t.matchColumns) Object.assign(row, t.matchColumns);

  if (input.scheduleEnabled && input.startDate) {
    const eventCount = input.eventCount ?? t.eventCount;
    // Seed every generated slot with the template's default weekly
    // format, matching `_buildSchedule` in the app's wizard. The
    // website used to write an empty map here, so a league created on
    // the web showed unlabelled slots in the schedule editor while the
    // same template in the app showed "Stableford" on every week.
    const formats: Record<string, string> = {};
    if (t.defaultWeekFormat) {
      for (let i = 0; i < eventCount; i++) formats[String(i)] = t.defaultWeekFormat;
    }
    // `LeagueSchedule` — the three seed fields plus the two slot-keyed
    // maps the app writes. Empty maps rather than omitted keys, so a
    // round-trip through the app's Freezed model is byte-identical.
    row.schedule = {
      startDate: input.startDate,
      intervalDays: input.intervalDays ?? t.intervalDays,
      eventCount,
      bindings: {},
      formats,
    };
  }
  return row;
}

// ── The cross-field rules, implemented ──────────────────────────
//
// `LEAGUE_CONFIG_RULES` carries each Postgres check constraint's SQL
// verbatim, which we cannot evaluate — so each one is implemented here
// by constraint name, and `parity.test.ts` asserts that EVERY rule in
// the generated schema has an implementation. A new constraint added
// to migration 20261013 therefore fails this repo's CI until someone
// writes the check, instead of surfacing as a raw 23514 from Postgres
// in front of a league director.

type RuleCheck = (row: Record<string, unknown>) => string | null;

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

const SINGLES_FORMATS = ['match_play_singles', 'two_singles_team'];
const MATCH_PLAY_FORMATS = ['match_play_singles', 'two_singles_team', 'best_ball'];

export const RULE_CHECKS: Record<string, RuleCheck> = {
  leagues_tie_hole_points_chk: (row) => {
    const tie = num(row.tie_hole_points);
    const per = num(row.points_per_hole);
    if (tie == null || per == null) return null;
    if (tie === 0 || tie === per / 2) return null;
    return `A tied hole must be worth either 0 or half of ${per} points.`;
  },

  leagues_match_play_format_chk: (row) => {
    if (row.points_model !== 'match_play') return null;
    const wf = row.week_format;
    if (typeof wf !== 'string' || MATCH_PLAY_FORMATS.includes(wf)) return null;
    return 'A match-play league must use a match-play weekly format: '
      + MATCH_PLAY_FORMATS.join(', ') + '.';
  },

  leagues_absent_rule_format_chk: (row) => {
    if (row.points_model !== 'match_play') return null;
    const { absent_rule: absent, week_format: wf } = row;
    if (absent === 'forfeit_hole' && wf !== 'best_ball') {
      return 'Forfeiting the hole when a player is absent only works in a '
        + 'best-ball league.';
    }
    if (absent === 'against_par' && typeof wf === 'string'
        && !SINGLES_FORMATS.includes(wf)) {
      return 'Playing an absent player against par only works in a singles '
        + 'format.';
    }
    return null;
  },

  leagues_allowance_pct_chk: (row) => {
    const pct = num(row.allowance_pct);
    if (pct == null) return null; // null is permitted
    if (pct >= 50 && pct <= 100) return null;
    return 'Handicap allowance must be between 50% and 100%.';
  },
};

/// Run every generated rule against a would-be insert. Returns the
/// problems a human can act on; an empty array means Postgres will not
/// reject the row on any constraint this schema knows about.
///
/// Called by `validateCreateLeague`, so the web form catches a bad
/// combination before the insert rather than after.
export function validateLeagueConfigRow(
  row: Record<string, unknown>,
): CreateLeagueProblem[] {
  const out: CreateLeagueProblem[] = [];
  for (const rule of LEAGUE_CONFIG_RULES) {
    const check = RULE_CHECKS[rule.constraint];
    if (!check) {
      // Not reachable in a green build — parity.test.ts fails first.
      // Kept as a loud runtime fallback rather than a silent skip,
      // because skipping means shipping an unvalidated money setting.
      out.push({
        field: rule.fields[0] ?? 'config',
        message: `This league's settings cannot be checked (${rule.constraint}).`,
      });
      continue;
    }
    const problem = check(row);
    if (problem) out.push({ field: rule.fields[0] ?? 'config', message: problem });
  }
  return out;
}
