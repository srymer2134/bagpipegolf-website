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
};

/**
 * The web's template set, mirroring `league_templates.dart`.
 *
 * **Match Play League is deliberately absent.** Its template carries a
 * 23-column `LeagueMatchPreset` (`team_size`, `week_format`,
 * `points_per_hole`, the absence ladder…) that lives in Dart, and the
 * DB defaults are NOT the same values — a match-play league created
 * here would differ from one created in the app (`team_size` 1 vs 2,
 * `week_format` `match_play_singles` vs `two_singles_team`).
 *
 * Restating those 23 values here would be a second definition of the
 * same template, and our one existing cross-repo drift guard silently
 * passes in CI, so it would drift unnoticed. Create match-play leagues
 * in the app until that preset has one home both clients can read.
 */
export const WEB_LEAGUE_TEMPLATES: LeagueTemplate[] = [
  {
    key: 'standard',
    title: 'Standard League',
    blurb: 'Events on dates you pick. Cumulative net strokes; lowest wins.',
    rosterHint: 'Any roster size',
    pointsModel: 'stroke_aggregate',
    subScoringRule: 'regular_keeps_sub',
    intervalDays: 30,
    eventCount: 6,
    flightCount: 1,
    playoffSize: 0,
  },
  {
    key: 'weekly',
    title: 'Weekly League',
    blurb: 'A fixed weekly night. Finish-position points across the season.',
    rosterHint: '8–12 regulars',
    pointsModel: 'position',
    subScoringRule: 'regular_keeps_sub',
    intervalDays: 7,
    eventCount: 16,
    flightCount: 1,
    playoffSize: 4,
  },
  {
    key: 'memberguest',
    title: 'Member-Guest',
    blurb: 'A two-day event scored as a season. Three flights.',
    rosterHint: '~40 players',
    pointsModel: 'position',
    subScoringRule: 'blind_default',
    intervalDays: 1,
    eventCount: 2,
    flightCount: 3,
    playoffSize: 0,
  },
  {
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
  },
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

  if (input.scheduleEnabled && input.startDate) {
    // `LeagueSchedule` — the three seed fields plus the two slot-keyed
    // maps the app writes. Empty maps rather than omitted keys, so a
    // round-trip through the app's Freezed model is byte-identical.
    row.schedule = {
      startDate: input.startDate,
      intervalDays: input.intervalDays ?? t.intervalDays,
      eventCount: input.eventCount ?? t.eventCount,
      bindings: {},
      formats: {},
    };
  }
  return row;
}
