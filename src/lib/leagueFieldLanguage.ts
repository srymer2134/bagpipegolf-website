// What a league director is actually called, in the words they use.
//
// The schema is generated from the migrations, which is right for
// types, defaults and rules — and wrong as an interface. A column is
// named `absent_ghost_strokes_over_net_par`; a director asks "what
// happens when someone misses a week". Rendering the column name with
// the underscores swapped for spaces, and the enum values raw, gave us
// a settings page that read like a database dump. Sam, 2026-10-06:
// "Scoring section never has underscores in the drop down… what is a
// ghost rule… dues are not measured in cents."
//
// Three jobs here, all of them about language and fit:
//   1. FIELD_COPY   — a human label, and help where the name alone is
//                     not enough.
//   2. VALUE_COPY   — the same for every enum value, so no dropdown
//                     ever shows `off_low_in_match`.
//   3. appliesTo()  — most of these columns came from the match-play
//                     migration and mean nothing to a position or
//                     stroke-aggregate league. Showing them all to
//                     every director is how a form becomes noise.
//
// `leagueFieldLanguage.test.ts` fails if a generated field has no
// label or an allowed value has no copy, so a new column cannot reach
// the page as raw snake_case.

export type FieldCopy = {
  label: string;
  help?: string;
  /** Rendered before the input, e.g. `$`. */
  prefix?: string;
  /** Rendered after the input, e.g. `%` or `min`. */
  suffix?: string;
};

export const FIELD_COPY: Record<string, FieldCopy> = {
  // ── Scoring ────────────────────────────────────────────────
  week_format: {
    label: 'Format each week',
    help: 'How a week is played and scored.',
  },
  points_per_hole: { label: 'Points for winning a hole' },
  tie_hole_points: {
    label: 'Points for a tied hole',
    help: 'Either zero, or exactly half of a won hole.',
  },
  points_per_match: { label: 'Points for winning the match' },
  team_points: { label: 'Points for the team result' },
  team_points_basis: {
    label: 'Team result decided by',
    help: 'How two partners’ scores combine into one team result.',
  },
  attendance_points: {
    label: 'Points for showing up',
    help: 'Awarded for playing, win or lose. Zero turns it off.',
  },

  // ── Handicaps ──────────────────────────────────────────────
  team_size: { label: 'Players per side' },
  handicap_basis: { label: 'How strokes are allocated' },
  allowance_pct: {
    label: 'Handicap allowance',
    suffix: '%',
    help: 'Between 50 and 100. Blank means full allowance.',
  },
  max_strokes_given: {
    label: 'Most strokes one player can give',
    help: 'Caps a lopsided match. Blank means no cap.',
  },
  sub_handicap_rule: { label: 'A substitute plays off' },
  sub_league_max: {
    label: 'League maximum handicap',
    help: 'Used when a substitute plays off the league maximum.',
  },

  // ── Absences ───────────────────────────────────────────────
  absent_rule: { label: 'When a player misses a week' },
  absent_ghost_strokes_over_net_par: {
    label: 'Ghost score, strokes over net par',
    help: 'How many strokes over par a stand-in score is worth.',
  },
  forfeit_points: {
    label: 'Points if the match is forfeited',
    help: 'Awarded to the side that showed up. Blank means none.',
  },
  bye_rule: {
    label: 'A side with no opponent gets',
    help: 'Applies when the roster is an odd number.',
  },

  // ── Season shape ───────────────────────────────────────────
  holes_per_week: { label: 'Holes each event' },
  half_split_slot: {
    label: 'Second half starts at event',
    help: 'For leagues that run two halves. Blank means one season.',
  },

  // ── Course and tee times ───────────────────────────────────
  default_course_id: {
    label: 'Default course',
    help: 'Used for a new event unless you change it.',
  },
  default_tee: { label: 'Default tee' },
  default_first_tee: { label: 'First tee time' },
  tee_interval_minutes: {
    label: 'Between tee times',
    suffix: 'min',
  },
  reminder_time: {
    label: 'Reminder sent at',
    help: 'Local time, the day before an event.',
  },
  timezone: { label: 'Time zone' },

  // ── Pot ────────────────────────────────────────────────────
  pot_skins: { label: 'Skins' },
  pot_skins_entry: { label: 'Skins entry per player', prefix: '$' },
  pot_skins_carryover: {
    label: 'A tied hole carries over',
    help: 'The skin rolls into the next hole instead of being void.',
  },
  pot_ctp_entry: { label: 'Closest to the pin entry', prefix: '$' },
  pot_ld_entry: { label: 'Long drive entry', prefix: '$' },
  pot_ctp_holes: {
    label: 'Closest to the pin holes',
    help: 'Hole numbers, e.g. 3, 7, 12.',
  },
  pot_ld_holes: {
    label: 'Long drive holes',
    help: 'Hole numbers, e.g. 9, 18.',
  },

  // ── Dues ───────────────────────────────────────────────────
  dues_cents: {
    label: 'Season dues per player',
    prefix: '$',
    help: 'What a member owes for the season. Recording it does not collect it.',
  },
  dues_due_date: { label: 'Dues due by' },
};

export type ValueCopy = { label: string; help?: string };

export const VALUE_COPY: Record<string, Record<string, ValueCopy>> = {
  team_size: {
    '1': { label: 'Individual' },
    '2': { label: 'Pairs' },
  },
  holes_per_week: {
    '9': { label: '9 holes' },
    '18': { label: '18 holes' },
  },
  week_format: {
    match_play_singles: {
      label: 'Singles match play',
      help: 'One player against one player.',
    },
    two_singles_team: {
      label: 'Two singles and a team point',
      help: 'Partners play their own matches, plus a point for the pair.',
    },
    best_ball: {
      label: 'Best ball',
      help: 'The better of the two partners’ scores counts on each hole.',
    },
  },
  team_points_basis: {
    aggregate_net: {
      label: 'Combined net score',
      help: 'Both partners’ net scores added together.',
    },
    low_ball: {
      label: 'Better ball of the pair',
      help: 'Only the lower net score on each hole counts.',
    },
  },
  handicap_basis: {
    off_low_in_match: {
      label: 'Off the low handicap',
      help: 'The lowest handicap in the match plays scratch; everyone else gets the difference.',
    },
    full: {
      label: 'Full handicap',
      help: 'Everyone receives their whole handicap.',
    },
  },
  sub_handicap_rule: {
    own: { label: 'Their own handicap' },
    min_own_regular: {
      label: 'The lower of theirs and the regular’s',
      help: 'Stops a high-handicap substitute being an advantage.',
    },
    regular: { label: 'The handicap of the player they replace' },
    league_max: { label: 'The league maximum' },
  },
  absent_rule: {
    ghost: {
      label: 'A ghost score is used',
      help: 'A stand-in score based on the absent player’s handicap, so the match still has a result.',
    },
    against_par: {
      label: 'Their opponent plays against par',
      help: 'No stand-in score. The player who turned up plays the course.',
    },
    forfeit_hole: {
      label: 'Every hole is forfeited',
      help: 'The absent player loses each hole outright. Best ball only.',
    },
  },
  bye_rule: {
    half_available: { label: 'Half the points available' },
    season_average: { label: 'Their season average' },
    zero: { label: 'Nothing' },
  },
  pot_skins: {
    off: { label: 'Off' },
    gross: { label: 'Gross skins' },
    net: { label: 'Net skins' },
  },
};

/** The label for a field, never its column name. */
export function fieldLabel(name: string): string {
  return FIELD_COPY[name]?.label ?? name.replace(/_/g, ' ');
}

/** The label for one of a field's values, never the raw wire value. */
export function valueLabel(field: string, value: string): string {
  return VALUE_COPY[field]?.[value]?.label ?? value.replace(/_/g, ' ');
}

/** Help for one of a field's values, for a hint under the control. */
export function valueHelp(field: string, value: string): string | undefined {
  return VALUE_COPY[field]?.[value]?.help;
}

// ── Relevance ───────────────────────────────────────────────
//
// Most of these columns arrived with the weekly-matchup migration and
// describe a MATCH. A position league ("most points across the
// season") or a stroke-aggregate league has no match, no opponent and
// no team point, so those settings are not merely unused — they are
// confusing, because a director reasonably assumes a setting shown to
// them does something.

/** Settings that only mean anything in a match-play league. */
const MATCH_PLAY_ONLY = new Set([
  'week_format',
  'points_per_hole',
  'tie_hole_points',
  'points_per_match',
  'team_points',
  'team_points_basis',
  'handicap_basis',
  'max_strokes_given',
  'absent_rule',
  'absent_ghost_strokes_over_net_par',
  'forfeit_points',
  'bye_rule',
]);

/** Settings that only mean anything when a side is more than one. */
const TEAM_ONLY = new Set(['team_points', 'team_points_basis']);

export type ConfigSnapshot = Record<string, unknown>;

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Whether this setting should be shown for the league as currently
 * configured. Hiding is a display decision only — nothing is cleared,
 * so switching a league back to match play brings its settings back
 * exactly as they were.
 */
export function appliesTo(name: string, cfg: ConfigSnapshot): boolean {
  const isMatchPlay = String(cfg.points_model ?? '') === 'match_play';
  if (MATCH_PLAY_ONLY.has(name) && !isMatchPlay) return false;
  if (TEAM_ONLY.has(name) && num(cfg.team_size) < 2) return false;

  // A ghost-score setting with no ghost scores is noise.
  if (name === 'absent_ghost_strokes_over_net_par') {
    return String(cfg.absent_rule ?? '') === 'ghost';
  }
  // The skins entry and carry-over only matter once skins are on.
  if (name === 'pot_skins_entry' || name === 'pot_skins_carryover') {
    return String(cfg.pot_skins ?? 'off') !== 'off';
  }
  // Contest holes only matter once there is an entry for that contest.
  if (name === 'pot_ctp_holes') return num(cfg.pot_ctp_entry) > 0;
  if (name === 'pot_ld_holes') return num(cfg.pot_ld_entry) > 0;

  return true;
}

/** Why a whole section is empty, so a director is told rather than
 *  shown a blank card. */
export function sectionEmptyReason(
  groupKey: string,
  cfg: ConfigSnapshot,
): string | null {
  const isMatchPlay = String(cfg.points_model ?? '') === 'match_play';
  if (!isMatchPlay && (groupKey === 'scoring' || groupKey === 'absence')) {
    return 'These settings describe a match. This league scores by ' +
      'position or by strokes, so they do not apply.';
  }
  return null;
}

// ── Money ───────────────────────────────────────────────────
//
// `dues_cents` is stored in cents, which is right for money and wrong
// for a form. Directors type dollars.

/** Columns stored in cents but typed in dollars. */
export const CENTS_FIELDS = new Set(['dues_cents']);

/** Stored cents → what the box shows. Whole dollars lose the `.00`. */
export function centsToInput(v: unknown): string {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n) || n === 0) return '';
  return n % 100 === 0 ? String(n / 100) : (n / 100).toFixed(2);
}

/** What the box holds → stored cents. Rounds to the cent rather than
 *  truncating a float: 45.55 × 100 is 4554.999… in binary. */
export function inputToCents(raw: unknown): number {
  const s = String(raw ?? '').replace(/[^0-9.]/g, '');
  if (s === '') return 0;
  const dollars = Number(s);
  if (!Number.isFinite(dollars)) return 0;
  const cents = Math.round(dollars * 100);
  return cents < 0 ? 0 : cents;
}
