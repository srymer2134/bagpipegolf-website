// ── Website tournament-create payload shape ──────────────────
//
// Phase 1 mirrors the subset of `Tournament.toApiJson()` (mobile
// app, `lib/core/models/tournament.dart` line 3078) that the
// essentials wizard collects. Everything else is a defaulted empty
// array so the Railway POST allowlist (`TOURNAMENT_POST_ALLOWED` in
// `packages/api/src/routes/tournaments.ts` line 96) accepts a
// clean, minimal write.
//
// Later phases (see `docs/plans/WEBSITE_TOURNAMENT_CREATE_PLAN.md`
// in the flutter repo) will populate `flights`, `skins_competitions`,
// `sponsors`, `pools`, and the pairing composer fields.

export type FieldGender = 'male' | 'female' | 'mixed';
// Pre-Cup-template (Phase 2a) scoring modes — camelCase strings
// the Format-step radios emit. Kept for backwards compatibility
// with clients that only send these four.
export type ScoringMode =
  | 'strokeAggregate'
  | 'scramble'
  | 'bestBall'
  | 'matchPlay';
// Pre-Cup-template (Phase 2a) round formats — camelCase strings
// the Rounds-step per-round dropdown emits.
export type RoundFormat = 'stroke' | 'scramble' | 'bestBall' | 'matchPlay';

// Cup-template scoring modes — snake_case wire values that match
// the mobile app's `ScoringModeValue.value` (lib/core/models/
// tournament.dart line 2339). The Cup template picker (Step 0)
// writes these; the wizard's Format step still emits the camelCase
// ScoringMode above, and the payload builder translates.
export type CupScoringMode = 'stroke_aggregate' | 'match_points';

// Cup-template round formats — snake_case wire values that match
// the mobile app's `RoundFormatValue.value` (lib/core/models/
// round_format.dart line 361). The Cup template picker writes
// these on template-driven rounds; the wizard's per-round format
// dropdown still emits the pre-Cup RoundFormat enum.
export type CupRoundFormat =
  | 'stroke_play'
  | 'match_play_singles'
  | 'best_ball'
  | 'best_ball_four_man'
  | 'best_three_of_four'
  | 'foursomes'
  | 'greensomes'
  | 'pinehurst'
  | 'modified_stableford'
  | 'high_low_2v2'
  | 'twelves'
  | 'bramble'
  | 'yellow_ball';

// Cup-template matchup composition modes — mirrors
// `MatchupCompositionModeValue.value`.
export type CupMatchupCompositionMode =
  | 'auto'
  | 'presidents_cup'
  | 'teammates_pick'
  | 'blind_submit';

export type WizardPlayerInput = {
  name: string;
  handicap: number;
  /** Populated when the player came from the friends picker so the
   *  mobile app can bind the roster row to the actual signed-in
   *  user.  Null for manually-typed guest players. */
  userId?: string | null;
};

export type StartType = 'teeTimes' | 'shotgun';

export type WizardRoundInput = {
  teeName: string;
  totalHoles: 9 | 18;
  /** EITHER the pre-Cup camelCase enum (from the Rounds-step per-
   *  round dropdown) OR the Cup snake_case wire value (from a
   *  template pre-fill). Payload builder tolerates both and
   *  writes the mobile-app-canonical snake_case form. */
  format: RoundFormat | CupRoundFormat;
  /** Cup template — human name for the round (e.g. "R1 · Best
   *  Ball (Pacific Dunes)"). Passed through to the wire so the
   *  mobile app renders it verbatim; null on Blank rounds. */
  roundName?: string | null;
  /** Cup template — per-round point budget. Ryder Cup Classic
   *  uses 1-per-round; Scarecrow / Bandon use variable weights
   *  (Singles closer carries the most). Defaults to 1 when
   *  omitted (backward compatible with pre-Cup rounds). */
  pointsAvailable?: number;
  /** Cup template — when true, each player's own gross/net feeds
   *  the cross-round aggregate leaderboard even on team-format
   *  rounds. Matches Ballyneal Brigade / Bandon Cup discipline. */
  useIndividualScoring?: boolean;
  /** Cup template — captain composition mode for the round.
   *  Scarecrow Cup uses these; other templates leave null. */
  matchupCompositionMode?: CupMatchupCompositionMode | null;
  /** Cup template — ISO date (YYYY-MM-DD) the round is nominally
   *  scheduled for. Scarecrow Cup pre-fills 2026-06-20 → 06-22;
   *  Ryder Cup / Ballyneal Brigade / Bandon leave null. */
  scheduledDate?: string | null;
  /** Cup template — HH:MM display-only first tee time. */
  firstTeeTime?: string | null;
  /** Cup template — curated-course key that overrides the
   *  tournament-level course for THIS round (Bandon's par-3
   *  shootouts at The Preserve / Shorty's). Wire-only; the
   *  wizard doesn't UI-support per-round course overrides today. */
  courseKey?: string | null;
  /** Resolved from the picked tee's course_rating/slope_rating —
   *  null when the course-detail fetch didn't return per-tee data
   *  (fallback name-only path). */
  courseRating?: number | null;
  slopeRating?: number | null;
  parTotal?: number | null;
  gender?: FieldGender;
  /** Phase 2a: how groups start the round. `teeTimes` (default) =
   *  historical sequential-from-hole-1 flow; `shotgun` = every
   *  group starts simultaneously from their assigned start hole
   *  at `shotgunStartTime`. Team-level start-hole assignment
   *  happens in the pairing composer (Phase 3) — the wizard just
   *  captures the round-level intent. */
  startType?: StartType;
  /** Phase 2a: players per tee-time group (2/3/4). Default 4.
   *  Applies to teeTimes AND shotgun rounds — even shotgun rounds
   *  bundle players into groups; the number just varies. Serialised
   *  as `tee_time_group_size` on the wire to match the mobile app
   *  (which distinguishes `group_size` for team assembly from
   *  `tee_time_group_size` for on-course grouping). */
  teeTimeGroupSize?: 2 | 3 | 4;
  /** Phase 2a: HH:MM string for shotgun rounds (e.g. `"09:00"`).
   *  Ignored when `startType === 'teeTimes'`. Purely display /
   *  run-book copy — engines don't read it. Optional at wizard
   *  time; director can fill in later via Manage. */
  shotgunStartTime?: string | null;
};

export type WizardCourseInput = {
  id: string;
  clubName: string | null;
  courseName: string | null;
};

/** One entry in the picked course's tee catalog. Mirrors Railway's
 *  `GET /api/courses/:id` `tee_boxes[]` shape (snake_case wire). */
export type WizardTeeBox = {
  tee_name: string;
  gender: 'male' | 'female' | string;
  course_rating: number | null;
  slope_rating: number | null;
  bogey_rating?: number | null;
  total_yards?: number | null;
  par_total: number | null;
};

/** One flight on the wire. Mirrors the mobile app's
 *  `TournamentFlight.toJson()` (flutter repo,
 *  `lib/core/models/tournament.dart` line 2503). Emitted as
 *  snake_case to match the app's canonical shape. Empty
 *  `flights` array on the tournament = no flighting (single
 *  competition, default behavior). */
export type WizardFlightInput = {
  /** Stable id inside the tournament (e.g. `flight_a_<ts>`). */
  id: string;
  /** Display name — Championship / First / Second / etc. */
  name: string;
  /** Handicap-index min/max the auto-splitter observed for this
   *  flight. Both inclusive. Null on either bound = unbounded
   *  that direction. Metadata only — playerIds is the source of
   *  truth for membership. */
  handicapMin?: number | null;
  handicapMax?: number | null;
  /** Player ids assigned to this flight. Must match ids in the
   *  wizard's `players` array (post-`buildCreatePayload` id
   *  generation, `p_<tournamentId>_<i>`). */
  playerIds: string[];
};

export type WizardInput = {
  name: string;
  course: WizardCourseInput;
  /** Full tee catalog from the picked course (may be empty when
   *  the upstream provider didn't return per-tee data). */
  teeBoxes: WizardTeeBox[];
  /** Tournament-level rating/slope/par — default to the first
   *  round's resolved tee data.  Null when unavailable. */
  courseRating: number | null;
  slopeRating: number | null;
  parTotal: number | null;
  fieldGender: FieldGender;
  scoringMode: ScoringMode | CupScoringMode;
  useNetScoring: boolean;
  /** Cup template — one of the four Cup template ids or
   *  `'blank'` (default). Used for logging + surfacing on the
   *  wire so the mobile app can show a "Cup: Ryder" chip. */
  templateId?: string | null;
  /** Cup template — mirrors the Bandon Dunes Cup +
   *  Ballyneal Brigade defaults. When true, `track_ctp_on_par3s`
   *  is set on the tournament. */
  trackCTPOnPar3s?: boolean;
  trackLongestDrive?: boolean;
  rounds: WizardRoundInput[];
  players: WizardPlayerInput[];
  /** Optional handicap-bucketed sub-competitions. Empty = no
   *  flighting (single competition across the whole field —
   *  original wizard behavior). See the mobile app's
   *  `TournamentFlight` shape for the wire contract; the payload
   *  builder rewrites each flight's `playerIds` to match the
   *  server-generated player ids (wizard IDs like `wp_0` become
   *  `p_<tournamentId>_0`). */
  flights?: WizardFlightInput[];
};

// Client-generated id — matches the mobile app's `tourney_<ts>`
// convention. Railway's POST handler treats a `23505` collision as
// idempotent success (an already-created row is returned), so retries
// with the same id are safe.
export function newTournamentId(): string {
  const now = Date.now();
  // 6 chars of crypto-random suffix so parallel tabs / retries after
  // ms-boundary can't share a millisecond and forge a false collision.
  const suffix = Array.from(crypto.getRandomValues(new Uint8Array(3)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `tourney_${now}_${suffix}`;
}

/**
 * Turn the wizard's collected state into the JSON body the Railway
 * POST endpoint accepts.  Fields NOT collected in Phase 1 are set to
 * safe defaults (empty arrays, false booleans) so the mobile app can
 * finish the setup without seeing null/undefined that its Freezed
 * model would reject on load.
 */
export function buildCreatePayload(input: WizardInput): Record<string, unknown> {
  const id = newTournamentId();

  const courseName = pickCourseName(input.course);
  const totalHoles = deriveTotalHoles(input.rounds);

  // Each round mirrors the mobile app's `TournamentRound.toJson()`
  // (see lib/core/models/tournament.dart) — index, teeBoxName,
  // totalHoles, format. Score fields default empty; the app / web
  // scoring UI fills them in as the round is played.
  //
  // Cup template rounds also carry `name`, `points_available`,
  // `use_individual_scoring`, `matchup_composition_mode`,
  // `scheduled_date`, `first_tee_time`, `course_id` — the mobile
  // app's `TournamentRound.fromJson()` reads all of those keys
  // (see docstrings in tournament.dart). Wire is snake_case per
  // the app's canonical toJson output.
  const rounds = input.rounds.map((r, i) => {
    const startType = r.startType ?? 'teeTimes';
    const teeTimeGroupSize = r.teeTimeGroupSize ?? 4;
    const shotgunStartTime =
      startType === 'shotgun' && r.shotgunStartTime && r.shotgunStartTime.trim().length > 0
        ? r.shotgunStartTime.trim()
        : null;
    // Format: translate pre-Cup camelCase enum values to the
    // mobile-app canonical snake_case. Cup template rounds
    // already write snake_case; those pass through untouched.
    const format = translateRoundFormat(r.format);
    const base: Record<string, unknown> = {
      index: i,
      teeBoxName: r.teeName,
      totalHoles: r.totalHoles,
      format,
      start_type: startType === 'shotgun' ? 'shotgun' : 'tee_times',
      tee_time_group_size: teeTimeGroupSize,
      shotgun_start_time: shotgunStartTime,
      playerHoleScores: {},
      playerStrokes: {},
      completed: false,
    };
    // Cup template additions — emit only when set so pre-Cup
    // rounds (from the Blank template path) round-trip unchanged.
    if (r.roundName && r.roundName.trim().length > 0) {
      base.name = r.roundName.trim();
    }
    if (typeof r.pointsAvailable === 'number' && r.pointsAvailable !== 1) {
      base.points_available = r.pointsAvailable;
    }
    if (r.useIndividualScoring === true) {
      base.use_individual_scoring = true;
    }
    if (r.matchupCompositionMode) {
      base.matchup_composition_mode = r.matchupCompositionMode;
    }
    if (r.scheduledDate) base.scheduled_date = r.scheduledDate;
    if (r.firstTeeTime) base.first_tee_time = r.firstTeeTime;
    if (r.courseKey) {
      // Per-round course override — mobile app resolves the
      // curated key against `kCuratedCourses` on load. Writing
      // the raw key here is safe: the schema's `course_id`
      // column is text.
      base.course_id = r.courseKey;
    }
    return base;
  });

  // Players carry a stable local id so subsequent PATCHes can
  // address them even before they sign in.  Handicap is stored as
  // a number.  `userId` is set when the player came from the
  // friends picker (bindable to the real Supabase user); null for
  // manually-typed guests, matching the mobile app's guest-player
  // shape.
  //
  // The wizard tracks per-player flight assignment against a
  // client-local id (typically the player's index in the players
  // array — see `wizardPlayerId(i)` below). We rewrite each flight's
  // `playerIds` to the server-generated `p_<tournamentId>_<i>` ids
  // so the persisted flights actually reference real roster rows.
  const players = input.players.map((p, i) => ({
    id: `p_${id}_${i}`,
    name: p.name.trim(),
    handicap: p.handicap,
    userId: p.userId ?? null,
  }));

  // Build a `wizardId -> serverId` map so flight assignments
  // survive the id rewrite above. The wizard-side flight editor
  // stores playerIds as `wp_<index>`; anything else is passed
  // through unchanged (defensive — a caller could bypass the
  // wizard convention).
  const wizardIdToServerId = new Map<string, string>();
  for (let i = 0; i < input.players.length; i++) {
    wizardIdToServerId.set(wizardPlayerId(i), players[i].id);
  }

  const flights = (input.flights ?? [])
    .filter((f) => f && typeof f === 'object')
    .map((f, i) => {
      const remappedIds = (f.playerIds ?? [])
        .map((pid) => wizardIdToServerId.get(pid) ?? pid)
        // Drop any ids that don't resolve to a real player row.
        .filter((pid) => players.some((p) => p.id === pid));
      const out: Record<string, unknown> = {
        id: (f.id && f.id.length > 0) ? f.id : `flight_${i}_${Date.now()}`,
        name: (f.name && f.name.trim().length > 0)
          ? f.name.trim()
          : `Flight ${i + 1}`,
        player_ids: remappedIds,
      };
      if (typeof f.handicapMin === 'number' && Number.isFinite(f.handicapMin)) {
        out.handicap_min = f.handicapMin;
      }
      if (typeof f.handicapMax === 'number' && Number.isFinite(f.handicapMax)) {
        out.handicap_max = f.handicapMax;
      }
      return out;
    });

  return {
    id,
    name: input.name.trim(),
    course_name: courseName,
    // Tournament-level rating/slope/par — pulled from Round 1's
    // resolved tee data in the wizard.  Included only when a real
    // course detail landed; null when the wizard fell back to
    // name-only tee options.  Sending null instead of omitting the
    // key so a re-open/PATCH from the mobile app sees the same
    // shape.
    course_rating: input.courseRating,
    slope_rating: input.slopeRating,
    par_total: input.parTotal,
    field_gender: input.fieldGender,
    scoring_mode: translateScoringMode(input.scoringMode),
    use_net_scoring: input.useNetScoring,
    use_group_scoring: false,
    total_holes: totalHoles,
    rounds,
    players,
    // Full tee catalog from the picked course.  Empty when the
    // upstream provider returned no per-tee data — mobile app's
    // `parResolver` chain fills the gap on read.
    tee_boxes: input.teeBoxes,
    // Fields defaulted for Phase 1 — later wizard steps fill them:
    teams: [],
    // Flights (Phase 2 — handicap-split brackets). Empty = single
    // competition across the whole field. See `WizardFlightInput`
    // for the wire shape; each entry is emitted snake_case to
    // match the mobile app's `TournamentFlight.toJson()`.
    flights,
    skins_competitions: [],
    pools: [],
    sponsors: [],
    captain_user_ids: [],
    track_ctp_on_par3s: input.trackCTPOnPar3s === true,
    track_longest_drive: input.trackLongestDrive === true,
  };
}

/** Translate the wizard's format value (pre-Cup camelCase enum or
 *  Cup snake_case wire value) to the mobile app's canonical
 *  snake_case wire form. The mobile parser's `RoundFormat.fromValue`
 *  tolerates enum `.name` forms too, but writing canonical
 *  snake_case is safer for future readers. */
function translateRoundFormat(f: WizardRoundInput['format']): string {
  switch (f) {
    // Pre-Cup camelCase → canonical snake_case
    case 'stroke':
      return 'stroke_play';
    case 'scramble':
      return 'scramble';
    case 'bestBall':
      return 'best_ball';
    case 'matchPlay':
      return 'match_play_singles';
    default:
      // Cup templates already write snake_case values (e.g.
      // 'best_ball_four_man', 'high_low_2v2') — pass through.
      return f;
  }
}

/** Translate the wizard's scoringMode value to the mobile app's
 *  canonical `stroke_aggregate` / `match_points` wire form.
 *  Pre-Cup Format-step values (`strokeAggregate`, `scramble`,
 *  `bestBall`, `matchPlay`) collapse to the closest analog —
 *  matchPlay → match_points, everything else → stroke_aggregate.
 *  Cup templates already write canonical values; pass through. */
function translateScoringMode(m: WizardInput['scoringMode']): string {
  if (m === 'stroke_aggregate' || m === 'match_points') return m;
  if (m === 'matchPlay') return 'match_points';
  // 'strokeAggregate', 'scramble', 'bestBall' — none of these
  // have direct ScoringMode analogs; the mobile app treats them
  // all as strokeAggregate (round-level format carries the
  // per-round scoring rule anyway).
  return 'stroke_aggregate';
}

function pickCourseName(course: WizardCourseInput): string {
  // Prefer the specific course name (e.g. "Bandon Dunes") over the
  // club name ("Bandon Dunes Resort") when both exist. Falls back
  // to the club name for standalone courses that only have one.
  if (course.courseName && course.courseName.trim().length > 0) {
    return course.courseName.trim();
  }
  if (course.clubName && course.clubName.trim().length > 0) {
    return course.clubName.trim();
  }
  return 'Course';
}

function deriveTotalHoles(rounds: WizardRoundInput[]): number {
  // The tournament-level `total_holes` is the sum across rounds —
  // mobile app uses this for aggregate leaderboard columns. A 2-
  // round 18-hole event = 36, a 3x9 = 27, etc.
  return rounds.reduce((sum, r) => sum + r.totalHoles, 0);
}

export type CreateTournamentResponse = {
  tournament: {
    id: string;
    [key: string]: unknown;
  };
};

// ── Flights helpers ─────────────────────────────────────────
//
// The wizard tracks per-player flight assignment against a stable
// client-local id (`wp_<index>`); the payload builder rewrites
// these to the server-generated `p_<tournamentId>_<index>` on
// submit. Manage-page edits work off the already-server-generated
// ids, so `wp_*` mapping is a no-op there.
//
// `autoSplitFlightsForCount` mirrors the mobile app's algorithm
// (see `_ensureDefaultFlights` in
// `lib/features/tourney/screens/new_tournament_screen.dart` +
// `_runAutoFlight` immediately below it). Equal-count buckets,
// sorted by handicap ascending — lowest index → Championship
// (first flight).

export const MAX_FLIGHTS = 6;
export const DEFAULT_FLIGHT_NAMES = [
  'Championship',
  'First',
  'Second',
  'Third',
  'Fourth',
  'Fifth',
];

/** Wizard-side stable id for the player at `index` in the roster.
 *  The payload builder rewrites these to `p_<tournamentId>_<index>`
 *  server-side ids before POSTing. */
export function wizardPlayerId(index: number): string {
  return `wp_${index}`;
}

/** Mobile-app parity — auto-flight count from field size.
 *  Matches `_ensureDefaultFlights`: n≤16 → 2, n≤32 → 3, else 4. */
export function defaultFlightCountFor(playerCount: number): number {
  if (playerCount <= 16) return 2;
  if (playerCount <= 32) return 3;
  return 4;
}

/** Auto-split a roster into equal-count flights bucketed by
 *  handicap (lowest → Championship). Returns flights with
 *  `handicapMin`/`Max` populated from the roster's observed range
 *  per bucket. Empty roster → an empty flight list.
 *
 *  This is the shared engine both the wizard step and the
 *  Manage-page card lean on so the two surfaces produce
 *  identical assignments.
 *
 *  `players` here is the wizard's local shape (id + handicap);
 *  wizard callers pass `wizardPlayerId(i)` as each id so the
 *  payload builder can rewrite to server ids on submit. Manage
 *  callers pass the real server ids and get them back unchanged. */
export function autoSplitFlights(
  players: Array<{ id: string; handicap: number }>,
  flightCount: number,
): WizardFlightInput[] {
  const n = players.length;
  const count = Math.max(1, Math.min(MAX_FLIGHTS, Math.floor(flightCount)));
  if (n === 0) return [];
  const sorted = [...players].sort((a, b) => a.handicap - b.handicap);
  const perFlight = Math.ceil(n / count);
  const stamp = Date.now();
  const out: WizardFlightInput[] = [];
  for (let i = 0; i < count; i++) {
    const start = i * perFlight;
    if (start >= n) break;
    const end = Math.min(start + perFlight, n);
    const slice = sorted.slice(start, end);
    out.push({
      id: `flight_${i}_${stamp + i}`,
      name: DEFAULT_FLIGHT_NAMES[i] ?? `Flight ${i + 1}`,
      handicapMin: slice[0].handicap,
      handicapMax: slice[slice.length - 1].handicap,
      playerIds: slice.map((p) => p.id),
    });
  }
  return out;
}
