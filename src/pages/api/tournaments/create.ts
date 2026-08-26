import type { APIRoute } from 'astro';
import { callRailway, RailwayApiError } from '../../../lib/railway';
import {
  buildCreatePayload,
  type CreateTournamentResponse,
  type WizardInput,
} from '../../../lib/tournamentCreate';

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

  const scoringMode =
    r.scoringMode === 'strokeAggregate' ||
    r.scoringMode === 'scramble' ||
    r.scoringMode === 'bestBall' ||
    r.scoringMode === 'matchPlay'
      ? r.scoringMode
      : 'strokeAggregate';

  const useNetScoring = r.useNetScoring !== false; // default true

  const roundsRaw = Array.isArray(r.rounds) ? r.rounds : [];
  if (roundsRaw.length === 0) {
    return { error: 'At least one round is required.' };
  }
  if (roundsRaw.length > 12) {
    return { error: 'Up to 12 rounds per tournament.' };
  }
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
    const format =
      e.format === 'scramble' ||
      e.format === 'bestBall' ||
      e.format === 'matchPlay'
        ? e.format
        : 'stroke';
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
      rounds,
      players,
    },
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
