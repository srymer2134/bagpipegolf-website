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
export type ScoringMode =
  | 'strokeAggregate'
  | 'scramble'
  | 'bestBall'
  | 'matchPlay';
export type RoundFormat = 'stroke' | 'scramble' | 'bestBall' | 'matchPlay';

export type WizardPlayerInput = {
  name: string;
  handicap: number;
  /** Populated when the player came from the friends picker so the
   *  mobile app can bind the roster row to the actual signed-in
   *  user.  Null for manually-typed guest players. */
  userId?: string | null;
};

export type WizardRoundInput = {
  teeName: string;
  totalHoles: 9 | 18;
  format: RoundFormat;
  /** Resolved from the picked tee's course_rating/slope_rating —
   *  null when the course-detail fetch didn't return per-tee data
   *  (fallback name-only path). */
  courseRating?: number | null;
  slopeRating?: number | null;
  parTotal?: number | null;
  gender?: FieldGender;
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
  scoringMode: ScoringMode;
  useNetScoring: boolean;
  rounds: WizardRoundInput[];
  players: WizardPlayerInput[];
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
  const rounds = input.rounds.map((r, i) => ({
    index: i,
    teeBoxName: r.teeName,
    totalHoles: r.totalHoles,
    format: r.format,
    // Player-hole-scores + per-player stroke totals default empty
    // so the leaderboard renders a blank scorecard until a scorer
    // starts entering values.
    playerHoleScores: {},
    playerStrokes: {},
    completed: false,
  }));

  // Players carry a stable local id so subsequent PATCHes can
  // address them even before they sign in.  Handicap is stored as
  // a number.  `userId` is set when the player came from the
  // friends picker (bindable to the real Supabase user); null for
  // manually-typed guests, matching the mobile app's guest-player
  // shape.
  const players = input.players.map((p, i) => ({
    id: `p_${id}_${i}`,
    name: p.name.trim(),
    handicap: p.handicap,
    userId: p.userId ?? null,
  }));

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
    scoring_mode: input.scoringMode,
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
    flights: [],
    skins_competitions: [],
    pools: [],
    sponsors: [],
    captain_user_ids: [],
    track_ctp_on_par3s: false,
    track_longest_drive: false,
  };
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
