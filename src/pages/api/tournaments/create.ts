import type { APIRoute } from 'astro';
import { createSupabaseFromApi } from '../../../lib/supabase';

// Direct-Supabase insert (RLS-gated: "Users manage own tournaments"
// on public.tournaments). Deliberately does NOT route through
// Railway's /api/tournaments POST — the row is created here so the
// site owns its own error surface, and the mobile app + web read
// the same row via the shared schema.

const MAX_PARS = 27;
const MIN_PARS = 3;
const MIN_HANDICAP = -10;
const MAX_HANDICAP = 54;

function parseIntSafe(raw: FormDataEntryValue | null, fallback: number): number {
  if (raw == null || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function parsePars(form: FormData, totalHoles: number): number[] {
  const pars: number[] = [];
  for (let i = 0; i < totalHoles; i++) {
    const raw = form.get(`par_${i + 1}`);
    let p = Number(raw);
    if (!Number.isFinite(p) || p < 3 || p > 6) p = 4;
    pars.push(Math.trunc(p));
  }
  return pars;
}

function newTourneyId(): string {
  return `tourney_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function newRoundId(): string {
  return `round_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function newPlayerId(): string {
  return `player_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export const POST: APIRoute = async (ctx) => {
  const user = ctx.locals.user;
  if (!user) return ctx.redirect('/login?next=/app/tournaments/new', 303);

  const form = await ctx.request.formData();

  const name = String(form.get('name') ?? '').trim();
  if (!name) return ctx.redirect('/app/tournaments/new?err=name_required', 303);

  const totalHoles = Math.min(
    MAX_PARS,
    Math.max(MIN_PARS, parseIntSafe(form.get('total_holes'), 18)),
  );

  const courseId = String(form.get('course_id') ?? '').trim() || null;
  const courseName = String(form.get('course_name') ?? '').trim() || null;
  const courseRatingRaw = form.get('course_rating');
  const slopeRatingRaw = form.get('slope_rating');
  const courseRating =
    courseRatingRaw != null && courseRatingRaw !== ''
      ? Number(courseRatingRaw)
      : null;
  const slopeRating =
    slopeRatingRaw != null && slopeRatingRaw !== ''
      ? Number(slopeRatingRaw)
      : null;

  const pars = parsePars(form, totalHoles);
  const parTotal = pars.reduce((a, b) => a + b, 0);

  const creatorNameRaw = String(form.get('creator_name') ?? '').trim();
  const creatorHandicapRaw = form.get('creator_handicap');
  const creatorHandicap = (() => {
    if (creatorHandicapRaw == null || creatorHandicapRaw === '') return 18.0;
    const n = Number(creatorHandicapRaw);
    if (!Number.isFinite(n)) return 18.0;
    return Math.max(MIN_HANDICAP, Math.min(MAX_HANDICAP, n));
  })();

  const creatorName = creatorNameRaw || (user.email?.split('@')[0] ?? 'Player');

  const teeName = 'Default';
  const teeBox = {
    teeName,
    gender: 'male',
    slopeRating: slopeRating ?? 113,
    courseRating: courseRating ?? parTotal,
    parTotal,
    pars,
  };

  const tourneyId = newTourneyId();
  const roundId = newRoundId();
  const creatorPlayerId = newPlayerId();

  const row = {
    id: tourneyId,
    user_id: user.id,
    name,
    total_holes: totalHoles,
    par_total: parTotal,
    course_id: courseId,
    course_name: courseName,
    course_rating: courseRating,
    slope_rating: slopeRating,
    tee_boxes: [teeBox],
    players: [
      {
        id: creatorPlayerId,
        name: creatorName,
        handicapIndex: creatorHandicap,
        isCurrentUser: true,
        userId: user.id,
        selectedTee: teeName,
      },
    ],
    rounds: [
      {
        id: roundId,
        name: 'Round 1',
        format: 'stroke_play',
        bet_game_ids: [] as string[],
        teams: [] as unknown[],
        team_hole_scores: [] as unknown[],
        player_hole_scores: [] as unknown[],
        course_id: courseId,
        course_name: courseName,
        course_rating: courseRating,
        slope_rating: slopeRating,
        par_total: parTotal,
        tee_boxes: [teeBox],
        closest_to_pin_by_hole: {} as Record<string, string>,
      },
    ],
    teams: [] as unknown[],
    flights: [] as unknown[],
    skins_competitions: [] as string[],
    scoring_mode: 'stroke_aggregate',
    use_net_scoring: true,
  };

  const supabase = createSupabaseFromApi(ctx);
  const { error } = await supabase.from('tournaments').insert(row);
  if (error) {
    console.error('[api/tournaments/create]', error);
    return ctx.redirect(
      `/app/tournaments/new?err=${encodeURIComponent(error.message)}`,
      303,
    );
  }

  return ctx.redirect(`/app/tournaments/${tourneyId}/leaderboard`, 303);
};

export const GET: APIRoute = () =>
  new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } });
