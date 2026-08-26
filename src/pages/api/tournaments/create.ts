import type { APIRoute } from 'astro';
import { callRailway, RailwayApiError } from '../../../lib/railway';
import {
  buildCreatePayload,
  MAX_FLIGHTS,
  type CreateTournamentResponse,
  type WizardFlightInput,
  type WizardInput,
  type WizardRoundInput,
} from '../../../lib/tournamentCreate';
import {
  PAIRING_MODES,
  type PairingMode,
  type WizardRoundPairing,
} from '../../../lib/pairings';

// POST /api/tournaments/create
//
// Wizard submits here (same-origin fetch from
// `/app/tournaments/new`). Handler:
//   1. Validates the wizard shape (fail-loud on shape drift so a
//      broken client build is obvious).
//   2. Builds the Railway payload via `buildCreatePayload`.
//   3. Proxies to Railway `POST /api/tournaments` with the signed-
//      in user's JWT.
//   4. Returns the created tournament id so the wizard can redirect
//      to `/app/tournaments/{id}/leaderboard`.

export const POST: APIRoute = async (ctx) => {
  let raw: unknown;
  try {
    raw = await ctx.request.json();
  } catch {
    return json({ error: 'Request body must be valid JSON.' }, 400);
  }

  const validated = validateWizardInput(raw);
  if ('error' in validated) return json({ error: validated.error }, 400);

  const payload = buildCreatePayload(validated.input);

  try {
    const result = await callRailway<CreateTournamentResponse>(ctx, {
      method: 'POST',
      path: '/api/tournaments',
      body: payload,
    });
    const id = result?.tournament?.id;
    if (typeof id !== 'string' || id.length === 0) {
      return json(
        { error: 'Railway responded without a tournament id.' },
        502,
      );
    }
    return json({ id }, 200);
  } catch (err) {
    if (err instanceof RailwayApiError) {
      return json({ error: err.message }, err.status);
    }
    console.error('[api/tournaments/create] unexpected error', err);
    return json({ error: 'Tournament create failed.' }, 500);
  }
};

/**
 * Guard against a broken/tampered client posting shapes the wizard
 * would never send. We're not chasing every field — Railway is the
 * authoritative validator — but the required fields have to be
 * present or the payload builder throws on downstream access.
 */
function validateWizardInput(
  raw: unknown,
): { input: WizardInput } | { error: string } {
  if (!raw || typeof raw !== 'object') {
    return { error: 'Wizard payload must be an object.' };
  }
  const r = raw as Record<string, unknown>;

  const name = typeof r.name === 'string' ? r.name.trim() : '';
  if (name.length === 0) return { error: 'Tournament name is required.' };

  const course = r.course;
  if (!course || typeof course !== 'object') {
    return { error: 'A course is required.' };
  }
  const c = course as Record<string, unknown>;
  if (typeof c.id !== 'string' || c.id.length === 0) {
    return { error: 'The selected course is missing an id.' };
  }

  const fieldGender =
    r.fieldGender === 'male' ||
    r.fieldGender === 'female' ||
    r.fieldGender === 'mixed'
      ? r.fieldGender
      : 'male';

  // Accept both the pre-Cup Format-step camelCase enums
  // ('strokeAggregate' | 'scramble' | 'bestBall' | 'matchPlay')
  // AND the Cup-template canonical snake_case wire values
  // ('stroke_aggregate' | 'match_points'). Payload builder
  // translates to canonical on emit.
  const scoringModeRaw = r.scoringMode;
  const scoringMode: WizardInput['scoringMode'] =
    scoringModeRaw === 'strokeAggregate' ||
    scoringModeRaw === 'scramble' ||
    scoringModeRaw === 'bestBall' ||
    scoringModeRaw === 'matchPlay' ||
    scoringModeRaw === 'stroke_aggregate' ||
    scoringModeRaw === 'match_points'
      ? scoringModeRaw
      : 'strokeAggregate';

  const useNetScoring = r.useNetScoring !== false; // default true
  const trackCTPOnPar3s = r.trackCTPOnPar3s === true;
  const trackLongestDrive = r.trackLongestDrive === true;
  const templateId =
    typeof r.templateId === 'string' && r.templateId.length > 0
      ? r.templateId
      : null;

  const roundsRaw = Array.isArray(r.rounds) ? r.rounds : [];
  if (roundsRaw.length === 0) {
    return { error: 'At least one round is required.' };
  }
  if (roundsRaw.length > 12) {
    return { error: 'Up to 12 rounds per tournament.' };
  }
  // Allowed round formats — both the pre-Cup Rounds-step
  // camelCase enum values AND the Cup-template snake_case wire
  // values. Payload builder normalizes to canonical snake_case
  // on emit.
  const ALLOWED_FORMATS = new Set<string>([
    // pre-Cup (Format dropdown on Rounds step)
    'stroke', 'scramble', 'bestBall', 'matchPlay',
    // Cup templates (Step 0)
    'stroke_play', 'match_play_singles',
    'best_ball', 'best_ball_four_man', 'best_three_of_four',
    'foursomes', 'greensomes', 'pinehurst',
    'modified_stableford', 'high_low_2v2', 'twelves',
    'bramble', 'yellow_ball',
  ]);
  const ALLOWED_COMPOSITION_MODES = new Set<string>([
    'auto', 'presidents_cup', 'teammates_pick', 'blind_submit',
  ]);
  const rounds = roundsRaw.map((entry, i) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error(`Round ${i + 1} is malformed.`);
    }
    const e = entry as Record<string, unknown>;
    const teeName =
      typeof e.teeName === 'string' && e.teeName.trim().length > 0
        ? e.teeName.trim()
        : 'Default';
    const totalHoles = e.totalHoles === 9 ? 9 : 18;
    const rawFormat = typeof e.format === 'string' ? e.format : '';
    const format = (ALLOWED_FORMATS.has(rawFormat)
      ? rawFormat
      : 'stroke') as WizardRoundInput['format'];
    const gender =
      e.gender === 'female' || e.gender === 'mixed' ? e.gender : 'male';
    const num = (v: unknown): number | null =>
      typeof v === 'number' && Number.isFinite(v) ? v : null;
    // Phase 2a additions. Sanitize each: startType only allows
    // teeTimes|shotgun, teeTimeGroupSize snaps to 2/3/4 (defaults 4),
    // shotgunStartTime is a HH:MM string (or null when teeTimes).
    const startType = e.startType === 'shotgun' ? 'shotgun' : 'teeTimes';
    const rawGroupSize = Number(e.teeTimeGroupSize);
    const teeTimeGroupSize: 2 | 3 | 4 =
      rawGroupSize === 2 || rawGroupSize === 3 || rawGroupSize === 4
        ? (rawGroupSize as 2 | 3 | 4)
        : 4;
    const shotgunStartTime =
      startType === 'shotgun' && typeof e.shotgunStartTime === 'string' &&
      /^\d{1,2}:\d{2}$/.test(e.shotgunStartTime.trim())
        ? e.shotgunStartTime.trim()
        : null;
    // Cup template additions. All optional — omitted on Blank
    // rounds so their absence round-trips as pre-Cup behavior.
    const roundName =
      typeof e.roundName === 'string' && e.roundName.trim().length > 0
        ? e.roundName.trim()
        : null;
    const pointsRaw = Number(e.pointsAvailable);
    const pointsAvailable = Number.isFinite(pointsRaw) && pointsRaw > 0
      ? Math.min(100, Math.round(pointsRaw))
      : 1;
    const useIndividualScoring = e.useIndividualScoring === true;
    const rawComp = typeof e.matchupCompositionMode === 'string'
      ? e.matchupCompositionMode : null;
    const matchupCompositionMode =
      rawComp && ALLOWED_COMPOSITION_MODES.has(rawComp)
        ? (rawComp as 'auto' | 'presidents_cup' | 'teammates_pick' | 'blind_submit')
        : null;
    const scheduledDate =
      typeof e.scheduledDate === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(e.scheduledDate)
        ? e.scheduledDate
        : null;
    const firstTeeTime =
      typeof e.firstTeeTime === 'string' &&
      /^\d{1,2}:\d{2}$/.test(e.firstTeeTime.trim())
        ? e.firstTeeTime.trim()
        : null;
    const courseKey =
      typeof e.courseKey === 'string' && e.courseKey.length > 0
        ? e.courseKey
        : null;
    return {
      teeName,
      totalHoles,
      format,
      gender,
      courseRating: num(e.courseRating),
      slopeRating: num(e.slopeRating),
      parTotal: num(e.parTotal),
      startType,
      teeTimeGroupSize,
      shotgunStartTime,
      roundName,
      pointsAvailable,
      useIndividualScoring,
      matchupCompositionMode,
      scheduledDate,
      firstTeeTime,
      courseKey,
    } as const;
  });

  const playersRaw = Array.isArray(r.players) ? r.players : [];
  if (playersRaw.length === 0) {
    return { error: 'Add at least one player.' };
  }
  if (playersRaw.length > 24) {
    return { error: 'Phase 1 supports up to 24 players.' };
  }
  const players = playersRaw.map((entry, i) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error(`Player ${i + 1} is malformed.`);
    }
    const e = entry as Record<string, unknown>;
    const name = typeof e.name === 'string' ? e.name.trim() : '';
    if (name.length === 0) {
      throw new Error(`Player ${i + 1} is missing a name.`);
    }
    const handicap =
      typeof e.handicap === 'number' && Number.isFinite(e.handicap)
        ? e.handicap
        : 18;
    // userId is set when the player came from the friends picker;
    // stored as-is (uuid string) so the mobile app can bind the
    // roster row to a real Supabase user for scoring later. Null
    // for guests.
    const userId = typeof e.userId === 'string' && e.userId.length > 0
      ? e.userId
      : null;
    return { name, handicap, userId };
  });

  // Tee catalog + tournament-level rating/slope/par ride the wizard
  // as-is (already gated by the client-side tee picker). Fall
  // through silently on shape drift — Railway will 400 if it hates
  // something, and the client surfaces that error.
  const teeBoxes = Array.isArray(r.teeBoxes)
    ? (r.teeBoxes as unknown[]).filter(
        (t): t is Record<string, unknown> => !!t && typeof t === 'object',
      )
    : [];
  const num = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? v : null;

  // Flights (optional). Empty / missing = single competition
  // (original wizard behavior). Each flight is sanitized:
  //   * name: trimmed, defaults to `Flight N` when empty
  //   * handicap min/max: numeric or null (metadata only)
  //   * player_ids: array of the wizard's local `wp_<i>` ids
  //     that reference a real player index. Bad ids are dropped
  //     silently — the payload builder does the wp→server-id
  //     rewrite and will refuse to persist unknown ids.
  //
  // The wizard prevents > MAX_FLIGHTS entries in the UI; this
  // validator caps as a belt-and-suspenders defense against a
  // tampered client.
  const validPlayerIds = new Set(
    playersRaw.map((_, i) => `wp_${i}`),
  );
  const flightsRaw = Array.isArray(r.flights) ? r.flights : [];
  if (flightsRaw.length > MAX_FLIGHTS) {
    return { error: `Up to ${MAX_FLIGHTS} flights per tournament.` };
  }
  const flights: WizardFlightInput[] = flightsRaw.map((entry, i) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error(`Flight ${i + 1} is malformed.`);
    }
    const e = entry as Record<string, unknown>;
    const rawName = typeof e.name === 'string' ? e.name.trim() : '';
    const name = rawName.length > 0 ? rawName : `Flight ${i + 1}`;
    const id =
      typeof e.id === 'string' && e.id.length > 0
        ? e.id
        : `flight_${i}_${Date.now()}`;
    const rawIds = Array.isArray(e.playerIds) ? e.playerIds : [];
    const playerIds = rawIds
      .filter((pid): pid is string => typeof pid === 'string')
      .filter((pid) => validPlayerIds.has(pid));
    return {
      id,
      name,
      handicapMin: num(e.handicapMin),
      handicapMax: num(e.handicapMax),
      playerIds,
    };
  });

  // Pairings (roadmap #6). Optional; missing / empty = no pairing
  // composer surfaces used (every round runs ad-hoc). Each entry:
  //   * `roundIndex`: integer 0..rounds.length-1 — anything out of
  //     range is dropped silently.
  //   * `mode`: one of the allowlisted PairingMode values.
  //   * `groups[]`: only kept when mode === 'groups'. Each group
  //     retains its id (or `pairing_g_<r>_<i>` fallback), a
  //     trimmed name (default `Group A`), a `wp_<i>`-scoped
  //     playerIds array (bad ids dropped), and an optional
  //     startingHole clamped to 1..18.
  //   * `teams[]`: only kept when mode === 'teams'. Same shape as
  //     groups plus an optional captainId (must be one of the
  //     team's own playerIds).
  const pairingsRaw = Array.isArray(r.pairings) ? r.pairings : [];
  const pairings: WizardRoundPairing[] = pairingsRaw
    .map((entry, i): WizardRoundPairing | null => {
      if (!entry || typeof entry !== 'object') return null;
      const e = entry as Record<string, unknown>;
      const rawIdx = Number(e.roundIndex);
      if (
        !Number.isFinite(rawIdx) ||
        rawIdx < 0 ||
        rawIdx >= roundsRaw.length
      ) {
        return null;
      }
      const roundIndex = Math.floor(rawIdx);
      const modeRaw = typeof e.mode === 'string' ? (e.mode as PairingMode) : 'none';
      const mode: PairingMode = (PAIRING_MODES as readonly string[]).includes(
        modeRaw,
      )
        ? modeRaw
        : 'none';
      if (mode === 'none') {
        return { roundIndex, mode };
      }
      if (mode === 'groups') {
        const rawGroups = Array.isArray(e.groups) ? e.groups : [];
        const groups = rawGroups
          .map((g, gi) => {
            if (!g || typeof g !== 'object') return null;
            const gg = g as Record<string, unknown>;
            const rawGid = typeof gg.id === 'string' ? gg.id : '';
            const id = rawGid.length > 0 ? rawGid : `pairing_g_${roundIndex}_${gi}`;
            const rawName = typeof gg.name === 'string' ? gg.name.trim() : '';
            const name = rawName.length > 0 ? rawName : `Group ${gi + 1}`;
            const rawPids = Array.isArray(gg.playerIds) ? gg.playerIds : [];
            const playerIds = rawPids
              .filter((pid): pid is string => typeof pid === 'string')
              .filter((pid) => validPlayerIds.has(pid));
            const holeRaw = Number(gg.startingHole);
            const startingHole =
              Number.isFinite(holeRaw) && holeRaw >= 1 && holeRaw <= 18
                ? Math.round(holeRaw)
                : null;
            return { id, name, playerIds, startingHole };
          })
          .filter((g): g is NonNullable<typeof g> => g !== null);
        return { roundIndex, mode, groups };
      }
      // teams mode
      const rawTeams = Array.isArray(e.teams) ? e.teams : [];
      const teams = rawTeams
        .map((t, ti) => {
          if (!t || typeof t !== 'object') return null;
          const tt = t as Record<string, unknown>;
          const rawTid = typeof tt.id === 'string' ? tt.id : '';
          const id = rawTid.length > 0 ? rawTid : `pairing_t_${roundIndex}_${ti}`;
          const rawName = typeof tt.name === 'string' ? tt.name.trim() : '';
          const name = rawName.length > 0 ? rawName : `Team ${ti + 1}`;
          const rawPids = Array.isArray(tt.playerIds) ? tt.playerIds : [];
          const playerIds = rawPids
            .filter((pid): pid is string => typeof pid === 'string')
            .filter((pid) => validPlayerIds.has(pid));
          const rawCaptain =
            typeof tt.captainId === 'string' ? tt.captainId : null;
          const captainId =
            rawCaptain && playerIds.includes(rawCaptain) ? rawCaptain : null;
          return { id, name, playerIds, captainId };
        })
        .filter((t): t is NonNullable<typeof t> => t !== null);
      return { roundIndex, mode, teams };
    })
    .filter((p): p is WizardRoundPairing => p !== null);

  return {
    input: {
      name,
      course: {
        id: c.id,
        clubName: typeof c.clubName === 'string' ? c.clubName : null,
        courseName: typeof c.courseName === 'string' ? c.courseName : null,
      },
      teeBoxes: teeBoxes as WizardInput['teeBoxes'],
      courseRating: num(r.courseRating),
      slopeRating: num(r.slopeRating),
      parTotal: num(r.parTotal),
      fieldGender,
      scoringMode,
      useNetScoring,
      templateId,
      trackCTPOnPar3s,
      trackLongestDrive,
      rounds,
      players,
      flights,
      pairings,
    },
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
