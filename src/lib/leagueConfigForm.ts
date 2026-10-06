// Turning the generated league-config schema into a form, and a form
// back into a Postgres row.
//
// W2b of docs/plans/WEBSITE_APP_PARITY_PLAN.md (fairwayiq-flutter):
// "Creation applies the preset; editing the 23 settings afterwards is
// not built on the web. The generated schema is exactly what a settings
// form needs — types, defaults, allowed values, rules."
//
// NOTHING HERE IS HAND-MAINTAINED. Every input is derived from
// `__generated__/league-config.json`, which is parsed from the
// migrations themselves. A new column on `leagues` reaches this form by
// being added to the generator's migration list and regenerated — and
// `leagueConfigForm.test.ts` fails if a generated field belongs to no
// group, so a new column cannot be silently dropped from the page.
//
// Validation is NOT here. The server re-validates every patch with
// `validateLeagueConfigRow`, which implements the database's own
// cross-field CHECK constraints. A form that validated on its own
// would be a second opinion about what Postgres allows.

import {
  LEAGUE_CONFIG_FIELDS,
  LEAGUE_CONFIG_RULES,
  type LeagueConfigField,
} from './leagueCreate';

export type ConfigInputKind =
  | 'select'
  | 'checkbox'
  | 'number'
  | 'time'
  | 'date'
  | 'intlist'
  | 'text';

export type ConfigGroup = {
  key: string;
  title: string;
  blurb: string;
  fields: LeagueConfigField[];
};

/** Field order within each group, and the grouping itself. Order is
 *  editorial; membership is checked exhaustively by the test. */
const GROUP_DEFS: Array<{ key: string; title: string; blurb: string; names: string[] }> = [
  {
    key: 'scoring',
    title: 'Scoring',
    blurb: 'How a week turns into points.',
    names: [
      'week_format', 'points_per_hole', 'tie_hole_points', 'points_per_match',
      'team_points', 'team_points_basis', 'attendance_points',
    ],
  },
  {
    key: 'handicaps',
    title: 'Teams & handicaps',
    blurb: 'Team size, and how strokes are allocated.',
    names: [
      'team_size', 'handicap_basis', 'allowance_pct', 'max_strokes_given',
      'sub_handicap_rule', 'sub_league_max',
    ],
  },
  {
    key: 'absence',
    title: 'Absences & byes',
    blurb: 'What happens when someone does not play.',
    names: [
      'absent_rule', 'absent_ghost_strokes_over_net_par', 'forfeit_points',
      'bye_rule',
    ],
  },
  {
    key: 'season',
    title: 'Season shape',
    blurb: 'Holes per week, and where the season splits.',
    names: ['holes_per_week', 'half_split_slot'],
  },
  {
    key: 'day',
    title: 'Course, tee times & reminders',
    blurb: 'The defaults a week inherits.',
    names: [
      'default_course_id', 'default_tee', 'default_first_tee',
      'tee_interval_minutes', 'reminder_time', 'timezone',
    ],
  },
  {
    key: 'pot',
    title: 'Weekly pot',
    blurb: 'Entries are collected in person — never by card.',
    names: [
      'pot_skins', 'pot_skins_entry', 'pot_skins_carryover',
      'pot_ctp_entry', 'pot_ld_entry', 'pot_ctp_holes', 'pot_ld_holes',
    ],
  },
  {
    key: 'dues',
    title: 'Season dues',
    blurb: 'What a member owes for the season. Recording it does not collect it.',
    names: ['dues_cents', 'dues_due_date'],
  },
];

/** Every generated field, in exactly one group. A field in no group
 *  lands in "Other" rather than vanishing — and the test fails, so
 *  "Other" should never render in a green build. */
export function groupedConfigFields(
  fields: LeagueConfigField[] = LEAGUE_CONFIG_FIELDS,
): ConfigGroup[] {
  const byName = new Map(fields.map((f) => [f.name, f]));
  const placed = new Set<string>();
  const groups: ConfigGroup[] = [];
  for (const def of GROUP_DEFS) {
    const picked: LeagueConfigField[] = [];
    for (const n of def.names) {
      const f = byName.get(n);
      if (f) {
        picked.push(f);
        placed.add(n);
      }
    }
    if (picked.length) {
      groups.push({ key: def.key, title: def.title, blurb: def.blurb, fields: picked });
    }
  }
  const leftovers = fields.filter((f) => !placed.has(f.name));
  if (leftovers.length) {
    groups.push({
      key: 'other',
      title: 'Other',
      blurb: 'Added to the database but not yet grouped on this page.',
      fields: leftovers,
    });
  }
  return groups;
}

/** Which control a field gets, from its SQL type and its CHECK. */
export function inputKindFor(field: LeagueConfigField): ConfigInputKind {
  if (field.allowed && field.allowed.length) return 'select';
  const t = field.type.toLowerCase();
  if (t === 'boolean') return 'checkbox';
  if (t.endsWith('[]')) return 'intlist';
  if (t === 'time') return 'time';
  if (t === 'date') return 'date';
  if (t.startsWith('numeric') || t === 'integer' || t === 'smallint' || t === 'bigint') {
    return 'number';
  }
  return 'text';
}

/** The step a number input should use: one decimal for `numeric(x,1)`,
 *  two for money-shaped `numeric(x,2)`, whole numbers for integers. */
export function numberStepFor(field: LeagueConfigField): string {
  const m = /^numeric\(\d+,\s*(\d+)\)$/.exec(field.type.toLowerCase());
  if (!m) return '1';
  const places = Number(m[1]);
  return places <= 0 ? '1' : `0.${'0'.repeat(places - 1)}1`;
}

/** Suggestions for a free-text column whose only CHECK is cross-field,
 *  so `allowed` is null but the rules still name the vocabulary (the
 *  standing case is `week_format`). Never a hard constraint — the
 *  server validates with the real rule. */
export function suggestionsFor(
  field: LeagueConfigField,
  rules = LEAGUE_CONFIG_RULES,
): string[] {
  if (field.allowed && field.allowed.length) return field.allowed;
  const out = new Set<string>();
  for (const rule of rules) {
    if (!rule.fields.includes(field.name)) continue;
    const re = new RegExp(`${field.name}\\s+in\\s*\\(([^)]*)\\)`, 'gi');
    for (const m of (rule.sql ?? '').matchAll(re)) {
      for (const raw of m[1].split(',')) {
        const v = raw.trim().replace(/^'|'$/g, '');
        if (v) out.add(v);
      }
    }
  }
  return [...out];
}

/** The SQL default, rendered the way the form should show it: quotes
 *  stripped, `{}` as an empty list. Null when the column has none. */
export function defaultDisplay(field: LeagueConfigField): string | null {
  const d = field.default;
  if (d === null || d === undefined) return null;
  const s = String(d).trim();
  if (s === "'{}'" || s === '{}') return '';
  return s.replace(/^'|'$/g, '');
}

/** A Postgres array literal or a form string → a list of integers.
 *  Accepts `{1,2}`, `1,2`, `1 2`. Out-of-order and duplicate entries
 *  are normalised, because two forms of the same set must not read as
 *  a change. */
export function parseIntList(raw: unknown): number[] {
  if (Array.isArray(raw)) {
    return [...new Set(raw.map((v) => Number(v)).filter(Number.isFinite))].sort(
      (a, b) => a - b,
    );
  }
  if (typeof raw !== 'string') return [];
  const nums = raw
    .replace(/[{}]/g, '')
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter((s) => s !== '')
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n));
  return [...new Set(nums)].sort((a, b) => a - b);
}

/** A submitted form value → what the column should hold. Returns
 *  `undefined` when the submission says nothing about this field (an
 *  absent checkbox is `false`, not `undefined` — the caller passes
 *  `false` explicitly). */
export function coerceConfigValue(
  field: LeagueConfigField,
  raw: unknown,
): string | number | boolean | number[] | null | undefined {
  const kind = inputKindFor(field);
  if (kind === 'checkbox') return raw === true || raw === 'on' || raw === 'true';
  if (kind === 'intlist') return parseIntList(raw);

  if (raw === undefined) return undefined;
  const s = typeof raw === 'string' ? raw.trim() : raw;
  if (s === '' || s === null) {
    // An empty box on a NOT NULL column means "leave it alone"; on a
    // nullable one it means "clear it". Sending null to a NOT NULL
    // column would be a 23502 the director cannot act on.
    return field.notNull ? undefined : null;
  }
  if (kind === 'number') {
    const n = Number(s);
    return Number.isFinite(n) ? n : undefined;
  }
  return String(s);
}

/** Only what actually changed, so a save never rewrites a column the
 *  director did not touch (and never fights a concurrent edit over a
 *  field nobody edited). */
export function buildConfigPatch(
  submitted: Record<string, unknown>,
  current: Record<string, unknown>,
  fields: LeagueConfigField[] = LEAGUE_CONFIG_FIELDS,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const f of fields) {
    if (!(f.name in submitted)) continue;
    const next = coerceConfigValue(f, submitted[f.name]);
    if (next === undefined) continue;
    const now = current[f.name];
    if (sameValue(f, next, now)) continue;
    patch[f.name] = next;
  }
  return patch;
}

/** Equality that understands the wire shapes Postgres hands back:
 *  `"2.0"` for a numeric, `"{1,2}"` for an array, `"09:00:00"` for a
 *  time the form submits as `"09:00"`. */
export function sameValue(
  field: LeagueConfigField,
  a: unknown,
  b: unknown,
): boolean {
  const kind = inputKindFor(field);
  if (kind === 'intlist') {
    return parseIntList(a).join(',') === parseIntList(b).join(',');
  }
  if (a === null || b === null || a === undefined || b === undefined) {
    return (a ?? null) === (b ?? null);
  }
  if (kind === 'number') return Number(a) === Number(b);
  if (kind === 'checkbox') return Boolean(a) === Boolean(b);
  if (kind === 'time') return normaliseTime(a) === normaliseTime(b);
  return String(a) === String(b);
}

function normaliseTime(v: unknown): string {
  const s = String(v ?? '').trim();
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(s);
  if (!m) return s;
  return `${m[1].padStart(2, '0')}:${m[2]}:${m[3] ?? '00'}`;
}
