// ── Shared Cup template catalog ──────────────────────────────
//
// Single canonical definition of the four buddies-trip Cup
// templates. Consumed by three surfaces:
//
//   1. /tournaments (marketing) — the "Buddies Trip Templates"
//      grid.
//   2. /buddies-trips (marketing) — the "Cup Templates" grid.
//   3. /app/tournaments/new (wizard) — Step 0 "Pick a template".
//
// The round schema (session name, format, points, courseKey) MUST
// mirror the mobile app's authoritative constants:
//
//   * Ryder Cup Classic          → kRyderCupVariants[classic] +
//     _buildRyderCupRounds()  in
//     lib/features/tourney/screens/new_tournament_screen.dart
//   * Scarecrow Cup              → kRyderCupVariants[scarecrowCup] +
//     _buildScarecrowCupRounds()
//   * Ballyneal Brigade          → ballynealBrigadeRoundSpecs()
//   * Bandon Dunes Cup           → bandonDunesCupRoundSpecs(n)
//
// When any of those Flutter constants change, update this file in
// the same PR — the drift risk is exactly what the shared module
// exists to prevent.
//
// Wire values: RoundFormat values use the mobile app's snake_case
// wire keys from `RoundFormatValue.value` (round_format.dart line
// 361). ScoringMode values use `ScoringModeValue.value` from
// tournament.dart line 2339. Keeping to those constants means the
// wizard writes rounds the mobile app can read without ambiguity
// (the mobile parser also tolerates enum `.name` forms but shared
// truth is safer).

/** Mobile-app RoundFormat wire values, snake_case per
 *  `RoundFormatValue.value`. Only the subset the four Cup
 *  templates use is enumerated here; the other formats
 *  (stableford, roundRobin, sixSixSix, etc.) exist on the enum
 *  but no Cup template references them today. */
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

/** Mobile-app ScoringMode wire values, snake_case per
 *  `ScoringModeValue.value`. */
export type CupScoringMode = 'stroke_aggregate' | 'match_points';

/** Mobile-app MatchupCompositionMode wire value, snake_case per
 *  `MatchupCompositionModeValue.value`. Only Scarecrow Cup uses
 *  these today. */
export type CupMatchupCompositionMode =
  | 'auto'
  | 'presidents_cup'
  | 'teammates_pick'
  | 'blind_submit';

/** One round in a Cup template. */
export interface CupTemplateRound {
  /** Session label surfaced to the user — e.g. "Day 1 —
   *  Foursomes" or "Fri PM · 4-Man Best Ball". Editable on the
   *  wizard's Rounds step after the template is applied. */
  name: string;

  /** Snake-case wire value. Matches `RoundFormatValue.value`
   *  in the mobile app so the tournament round writes a shape
   *  the app can read back cleanly. */
  format: CupRoundFormat;

  /** Per-round Cup point budget. Defaults to 1 (Ryder Cup
   *  Classic uses 1-per-session); Scarecrow / Bandon use
   *  variable point weights so the Singles closer carries the
   *  most Cup drama. */
  pointsAvailable: number;

  /** True when each player's own gross/net feeds the cross-round
   *  aggregate leaderboard even on team-format rounds. Matches
   *  Ballyneal Brigade + Bandon Cup discipline — team scoring
   *  runs on top, but the individual ledger stays honest. */
  useIndividualScoring?: boolean;

  /** Optional Scarecrow Cup — captain composition mode surfaced
   *  in the mobile app's dashboard. */
  matchupCompositionMode?: CupMatchupCompositionMode;

  /** ISO date the round is nominally scheduled for. Scarecrow
   *  Cup pre-fills 2026-06-20 → 2026-06-22; other templates
   *  leave date-picking to the TD. */
  scheduledDate?: string;

  /** Display-only first tee time (HH:MM). Ryder Cup Classic +
   *  Ballyneal Brigade skip this; Scarecrow pre-fills it. */
  firstTeeTime?: string;

  /** Optional curated-course key. When set, the mobile app
   *  overrides the tournament-level course for this specific
   *  round (used by Bandon's par-3 shootouts at The Preserve /
   *  Shorty's). The wizard currently doesn't wire per-round
   *  course overrides on the web (Manage page + mobile app do),
   *  so this is metadata-only for the display layer. */
  courseKey?: string;
}

/** Marketing copy for a Cup template card. */
export interface CupTemplateCopy {
  /** One-line big-picture pitch. */
  pitch: string;
  /** "Who it's for" callout. */
  fit: string;
  /** 3-5 bullets summarizing what the template configures. */
  includes: string[];
  /** Short line under the rounds preview on /tournaments (e.g.
   *  "5 sessions · 3 days · 5 points"). */
  meta: string;
  /** Longer detail paragraph under the meta line. */
  detail: string;
}

/** A Cup template — combines the wizard-writable round schema
 *  with the marketing copy for the sales pages. */
export interface CupTemplate {
  /** Stable identifier. Referenced by the wizard's Step 0
   *  picker. */
  id: 'ryderCupClassic' | 'scarecrowCup' | 'ballynealBrigade' | 'bandonDunesCup';
  /** Display name (mirrors the mobile app label). */
  name: string;
  /** Short tagline for the marketing cards. */
  tagline: string;
  /** Marketing copy for the /buddies-trips + /tournaments cards. */
  copy: CupTemplateCopy;
  /** Wizard defaults applied to the tournament when the template
   *  is picked. */
  defaults: {
    scoringMode: CupScoringMode;
    useNetScoring: boolean;
    /** Tournament-wide par-3 CTP tracking on every par 3. */
    trackCTPOnPar3s: boolean;
    /** Tournament-wide longest-drive tracking. */
    trackLongestDrive: boolean;
  };
  /** Round schedule. For Bandon Cup this is round-count driven —
   *  see [bandonDunesCupRounds]. */
  rounds: CupTemplateRound[];
}

// ── Ryder Cup Classic ────────────────────────────────────────
// Mirrors _buildRyderCupRounds() — 4/4/4/4/12 = 28 pts, first
// to 14.5 wins. Match points scoring, US v Europe team split.
const ryderCupClassic: CupTemplate = {
  id: 'ryderCupClassic',
  name: 'Ryder Cup Classic',
  tagline:
    'The classic 5-session team match — three days, alternating formats, singles to close.',
  copy: {
    pitch:
      'The definitive 5-session team match — three days, alternating formats, Singles Match Play to close.',
    fit: 'Two teams (8-12 per side), three-day trip, everyone plays every session.',
    includes: [
      'Foursomes / Four-Ball / Foursomes / Four-Ball / Singles',
      '28 points total (4 / 4 / 4 / 4 / 12) — first team to 14.5 wins the Cup',
      'Team Rosters step in the wizard + Cup Scoreboard',
      'USA / Europe default team names — editable',
    ],
    meta: '5 sessions · 3 days · 28 points total',
    detail:
      'Applies Match Points scoring and adds a Team Rosters step to the wizard. Standings recompute round-by-round as scores land.',
  },
  defaults: {
    scoringMode: 'match_points',
    useNetScoring: true,
    trackCTPOnPar3s: false,
    trackLongestDrive: false,
  },
  rounds: [
    { name: 'Day 1 — Foursomes', format: 'foursomes', pointsAvailable: 4 },
    { name: 'Day 1 — Four-Ball', format: 'best_ball', pointsAvailable: 4 },
    { name: 'Day 2 — Foursomes', format: 'foursomes', pointsAvailable: 4 },
    { name: 'Day 2 — Four-Ball', format: 'best_ball', pointsAvailable: 4 },
    { name: 'Day 3 — Singles', format: 'match_play_singles', pointsAvailable: 12 },
  ],
};

// ── Scarecrow Cup ────────────────────────────────────────────
// Mirrors _buildScarecrowCupRounds() — 6/3/6/6/12 = 33 pts,
// per-round matchup composition modes.
const scarecrowCup: CupTemplate = {
  id: 'scarecrowCup',
  name: 'Scarecrow Cup',
  tagline:
    '5 sessions across 2 courses. Every round scores different points — the weight of the day shifts as the trip unfolds.',
  copy: {
    pitch:
      '5 rounds across 2 courses. Every round scores different points — the weight of the day shifts as the trip unfolds.',
    fit: 'Long-weekend trip with mixed formats and a big Singles finale.',
    includes: [
      'Best Ball · Best Three of Four · High-Low · Twelves · Singles',
      '33 points total (6 / 3 / 6 / 6 / 12), front-loaded but back-loaded in leverage',
      'Team Green / Team Gold default names + per-round captain composition modes',
      'Practice-green tiebreaker (off-app) when it comes down to it',
    ],
    meta: '5 rounds · 2 courses · 33 points total',
    detail:
      'Preset session grid, Cup composition with team composer, and a live Cup Scoreboard. Practice-green tiebreaker off-app when it comes down to it.',
  },
  defaults: {
    scoringMode: 'match_points',
    useNetScoring: true,
    trackCTPOnPar3s: false,
    trackLongestDrive: false,
  },
  rounds: [
    {
      name: 'R1 — Best Ball',
      format: 'best_ball',
      pointsAvailable: 6,
      matchupCompositionMode: 'presidents_cup',
      scheduledDate: '2026-06-20',
      firstTeeTime: '09:05',
    },
    {
      name: 'R2 — Best Three of Four',
      format: 'best_three_of_four',
      pointsAvailable: 3,
      matchupCompositionMode: 'teammates_pick',
      scheduledDate: '2026-06-20',
      firstTeeTime: '15:00',
    },
    {
      name: 'R3 — High-Low',
      format: 'high_low_2v2',
      pointsAvailable: 6,
      matchupCompositionMode: 'presidents_cup',
      scheduledDate: '2026-06-21',
      firstTeeTime: '09:00',
    },
    {
      name: 'R4 — Twelves',
      format: 'twelves',
      pointsAvailable: 6,
      matchupCompositionMode: 'blind_submit',
      scheduledDate: '2026-06-21',
      firstTeeTime: '14:45',
    },
    {
      name: 'R5 — Singles',
      format: 'match_play_singles',
      pointsAvailable: 12,
      matchupCompositionMode: 'presidents_cup',
      scheduledDate: '2026-06-22',
      firstTeeTime: '07:10',
    },
  ],
};

// ── Ballyneal Brigade ────────────────────────────────────────
// Mirrors ballynealBrigadeRoundSpecs() — 4 rounds, stroke-
// aggregate NET Championship, CTP tracking on par 3s.
const ballynealBrigade: CupTemplate = {
  id: 'ballynealBrigade',
  name: 'Ballyneal Brigade',
  tagline:
    'Weekend Ballyneal event. Team Best Ball Friday and Saturday, optional afternoon round, individual Championship Sunday.',
  copy: {
    pitch:
      'Team Best Ball Friday and Saturday. Optional Saturday afternoon round. Individual Championship Sunday.',
    fit: 'Weekend trip that mixes team play with an individual finale.',
    includes: [
      '4-Man Best Ball / 2-Man Best Ball / optional round / Individual Championship',
      'Net-only leaderboard aggregated across the trip',
      'Individual scoring on the team rounds feeds the Championship',
      'Par-3 Closest-to-Pin tracked all trip',
    ],
    meta: '4 rounds · Team + Individual Championship aggregate',
    detail:
      'One board for the whole trip — net-only leaderboard, round-strip chips, and Thru-Sat carry-in for the Championship. Optional Sat PM opts skipped players out of the aggregate cleanly.',
  },
  defaults: {
    scoringMode: 'stroke_aggregate',
    useNetScoring: true,
    trackCTPOnPar3s: true,
    trackLongestDrive: false,
  },
  rounds: [
    {
      name: 'Fri PM · 4-Man Best Ball',
      format: 'best_ball_four_man',
      pointsAvailable: 1,
      useIndividualScoring: true,
    },
    {
      name: 'Sat AM · 2-Man Best Ball',
      format: 'best_ball',
      pointsAvailable: 1,
      useIndividualScoring: true,
    },
    {
      name: 'Sat PM · Optional (Individual)',
      format: 'stroke_play',
      pointsAvailable: 1,
      useIndividualScoring: false,
    },
    {
      name: 'Sun AM · Championship',
      format: 'stroke_play',
      pointsAvailable: 1,
      useIndividualScoring: false,
    },
  ],
};

// ── Bandon Dunes Cup ─────────────────────────────────────────
// Round-count-driven. Mirrors bandonDunesCupRoundSpecs(n) —
// 2–12 rounds; Preserve par-3 at N≥6, Shorty's par-3 at N≥10.
// SSP + SMP always close (SMP always carries the biggest
// point weight — Ryder Cup drama pattern).

const BANDON_MIN_ROUNDS = 2;
const BANDON_MAX_ROUNDS = 12;
export const BANDON_DEFAULT_ROUNDS = 6;

/** Materializes the Bandon Dunes Cup round schedule for the
 *  chosen round count. Mirrors `bandonDunesCupRoundSpecs(n)`
 *  in the Flutter wizard — see the block-comment there for the
 *  point-budget rationale. */
export function bandonDunesCupRounds(roundCount: number): CupTemplateRound[] {
  const n = Math.min(
    BANDON_MAX_ROUNDS,
    Math.max(BANDON_MIN_ROUNDS, Math.round(roundCount)),
  );
  const teamRound = (
    name: string,
    format: CupRoundFormat,
    pointsAvailable: number,
    courseKey?: string,
  ): CupTemplateRound => ({
    name,
    format,
    pointsAvailable,
    useIndividualScoring: true,
    ...(courseKey ? { courseKey } : {}),
  });
  const singlesMP = (label: string, points: number): CupTemplateRound => ({
    name: label,
    format: 'match_play_singles',
    pointsAvailable: points,
    useIndividualScoring: false,
  });
  const singlesSP = (label: string, points: number): CupTemplateRound => ({
    name: label,
    format: 'stroke_play',
    pointsAvailable: points,
    useIndividualScoring: false,
  });

  switch (n) {
    case 2:
      return [
        teamRound('R1 · Best Ball (Four-Ball)', 'best_ball', 4),
        singlesMP('R2 · Singles Match Play', 12),
      ];
    case 3:
      return [
        teamRound('R1 · Best Ball (Four-Ball)', 'best_ball', 4),
        teamRound('R2 · Foursomes (Alt Shot)', 'foursomes', 4),
        singlesMP('R3 · Singles Match Play', 8),
      ];
    case 4:
      return [
        teamRound('R1 · Best Ball (Four-Ball)', 'best_ball', 4),
        teamRound('R2 · Foursomes (Alt Shot)', 'foursomes', 4),
        singlesSP('R3 · Singles Stroke Play', 4),
        singlesMP('R4 · Singles Match Play', 8),
      ];
    case 5:
      return [
        teamRound('R1 · Best Ball (Four-Ball)', 'best_ball', 4),
        teamRound('R2 · Bramble', 'bramble', 3),
        teamRound('R3 · Foursomes (Alt Shot)', 'foursomes', 4),
        singlesSP('R4 · Singles Stroke Play', 4),
        singlesMP('R5 · Singles Match Play', 8),
      ];
    case 6:
      // Signature Bandon shape.
      return [
        teamRound('R1 · Best Ball (Pacific Dunes)', 'best_ball', 4),
        teamRound('R2 · Bramble (Old Mac)', 'bramble', 3),
        teamRound(
          'R3 · Preserve Par-3 Shootout',
          'modified_stableford',
          3,
          'bandon_preserve',
        ),
        teamRound('R4 · Foursomes (Bandon Trails)', 'foursomes', 5),
        singlesSP('R5 · Singles Stroke Play (Bandon Dunes)', 4),
        singlesMP('R6 · Singles Match Play', 12),
      ];
    case 7:
      return [
        teamRound('R1 · Best Ball', 'best_ball', 4),
        teamRound('R2 · Bramble', 'bramble', 3),
        teamRound('R3 · Yellow Ball', 'yellow_ball', 3),
        teamRound(
          'R4 · Preserve Par-3 Shootout',
          'modified_stableford',
          3,
          'bandon_preserve',
        ),
        teamRound('R5 · Foursomes', 'foursomes', 4),
        singlesSP('R6 · Singles Stroke Play', 4),
        singlesMP('R7 · Singles Match Play', 12),
      ];
    case 8:
      return [
        teamRound('R1 · Best Ball', 'best_ball', 4),
        teamRound('R2 · Bramble', 'bramble', 3),
        teamRound('R3 · Yellow Ball', 'yellow_ball', 3),
        teamRound(
          'R4 · Preserve Par-3 Shootout',
          'modified_stableford',
          3,
          'bandon_preserve',
        ),
        teamRound('R5 · Foursomes', 'foursomes', 4),
        teamRound('R6 · Best 2 of 4', 'best_ball_four_man', 5),
        singlesSP('R7 · Singles Stroke Play', 4),
        singlesMP('R8 · Singles Match Play', 12),
      ];
    default: {
      // 9–12 rounds: team rotation base + Preserve at R4;
      // Shorty's joins the base at R7 when N ≥ 10. Trimmed to
      // N-2 team rounds, then SSP + SMP closers appended.
      const bigTrip = n >= 11;
      const withShortys = n >= 10;
      const base: CupTemplateRound[] = [
        teamRound('R1 · Best Ball', 'best_ball', 4),
        teamRound('R2 · Bramble', 'bramble', 3),
        teamRound('R3 · Yellow Ball', 'yellow_ball', 3),
        teamRound(
          'R4 · Preserve Par-3 Shootout',
          'modified_stableford',
          3,
          'bandon_preserve',
        ),
        teamRound('R5 · Foursomes', 'foursomes', 4),
        teamRound('R6 · Best 2 of 4', 'best_ball_four_man', 5),
      ];
      if (withShortys) {
        base.push(
          teamRound(
            "R7 · Shorty's Par-3 Shootout",
            'modified_stableford',
            3,
            'bandon_shortys',
          ),
        );
      }
      const nextIdx = withShortys ? 8 : 7;
      base.push(teamRound(`R${nextIdx} · Pinehurst`, 'pinehurst', 4));
      base.push(
        teamRound(
          `R${nextIdx + 1} · Modified Stableford`,
          'modified_stableford',
          4,
        ),
      );
      base.push(teamRound(`R${nextIdx + 2} · Best Ball`, 'best_ball', 4));
      base.push(teamRound('R11 · Foursomes', 'foursomes', 4));

      const trimmed = base.slice(0, n - 2);
      trimmed.push(singlesSP(`R${n - 1} · Singles Stroke Play`, bigTrip ? 6 : 4));
      trimmed.push(singlesMP(`R${n} · Singles Match Play`, bigTrip ? 18 : 15));
      return trimmed;
    }
  }
}

const bandonDunesCup: CupTemplate = {
  id: 'bandonDunesCup',
  name: 'Bandon Dunes Cup',
  tagline:
    'Round-count-driven — you pick 2–12 rounds, the template pre-populates the schedule. Team rounds early, medal round penult, Singles Match Play always closes.',
  copy: {
    pitch:
      'Round-count-driven — pick 2–12 rounds, the template pre-populates the schedule. Singles Match Play always closes.',
    fit: 'Bucket-list trips (Bandon, Streamsong, Cabot, etc.) — any length from a long weekend to a 10-day event.',
    includes: [
      'Team rounds up front, medal round penultimate, Singles Match Play closes',
      '6+ rounds: The Preserve par-3 shootout',
      "10+ rounds: Shorty's joins the rotation",
      'Par-3 Closest-to-Pin tracked on every par 3 across the whole trip',
      'Supports 4–48 players',
    ],
    meta:
      '2–12 rounds · signature 6-round shape shown · 31 points total · Team Cup points, Gross + Net · Preserve par-3 competition · Shorty\'s joins at 10+ rounds',
    detail:
      "The Tournament Director picks the round count first, then applies the Bandon template. Trips of 4+ rounds finish with Singles Stroke Play (medal round) into Singles Match Play (Cup championship). Trips of 6+ include The Preserve par-3 shootout; trips of 10+ add Shorty's. Par 3 Closest-to-Pin tracked on every par 3 across the whole trip. Supports 4–48 players.",
  },
  defaults: {
    scoringMode: 'match_points',
    useNetScoring: true,
    trackCTPOnPar3s: true,
    trackLongestDrive: false,
  },
  // Signature 6-round shape displayed on marketing surfaces + used
  // as the wizard default when the user hasn't overridden the count.
  rounds: bandonDunesCupRounds(BANDON_DEFAULT_ROUNDS),
};

/** All Cup templates, keyed by id. */
export const CUP_TEMPLATES: Record<CupTemplate['id'], CupTemplate> = {
  ryderCupClassic,
  scarecrowCup,
  ballynealBrigade,
  bandonDunesCup,
};

/** Ordered list of templates for card grids. */
export const CUP_TEMPLATE_LIST: CupTemplate[] = [
  ryderCupClassic,
  scarecrowCup,
  ballynealBrigade,
  bandonDunesCup,
];

/** True when the template's round count is user-driven (only
 *  Bandon today). Non-driven templates render their static
 *  `rounds` array; driven templates re-derive via
 *  [bandonDunesCupRounds]. */
export function isRoundCountDriven(id: CupTemplate['id']): boolean {
  return id === 'bandonDunesCup';
}

export const BANDON_ROUND_BOUNDS = {
  min: BANDON_MIN_ROUNDS,
  max: BANDON_MAX_ROUNDS,
  default: BANDON_DEFAULT_ROUNDS,
} as const;
