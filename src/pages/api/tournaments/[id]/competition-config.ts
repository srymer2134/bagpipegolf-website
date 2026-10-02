import type { APIRoute } from 'astro';
import { callRailway, RailwayApiError } from '../../../../lib/railway';
import { createSupabaseClient } from '../../../../lib/supabase';
import { getPublicTournament } from '../../../../lib/tournamentQueries';
import {
  buildCompetitionPatch,
  fieldGenderOf,
  parseCompetitionConfig,
} from '../../../../lib/competitionConfig';
import { ScoreLossError, withFreshRounds } from '../../../../lib/tournamentWrite';

// POST /api/tournaments/[id]/competition-config
//
// CONFIGURE which field-wide competitions a tournament runs, their
// buy-ins, and which holes carry closest-to-pin on a given round.
// W4b config side — the counterpart to `competitions.ts`, which
// records WINNERS.
//
// Deliberately a separate route from winner-recording. They are
// different actions with different blast radii: a config change
// alters what prizes exist for the whole field, while recording a
// winner is one observation. Sharing one endpoint would mean a typo
// in a buy-in could block a director from entering a CTP.
//
// TWO WRITES, AND WHY BOTH
//
// 1. Tournament-level. A competition's existence is stored TWICE —
//    the v1 flags and the v2 `pools` array — and `fromJson` prefers
//    `pools` while `resolveCtpHolesFor` reads the v1 flag. Writing
//    one without the other leaves CTP pickers with no CTP pool, or a
//    pool with no way to record a winner. `buildCompetitionPatch`
//    emits both, rebuilt together, with Dart's deterministic ids.
//    See `lib/competitionConfig.ts`.
//
// 2. Round-level `ctp_holes`. Goes through `withFreshRounds` + the
//    score-loss guard like every other rounds write here, because
//    Railway writes that array wholesale with no server-side merge.

const ALLOWED_KEYS = [
  'skins_competitions',
  'track_ctp_on_par3s',
  'track_longest_drive',
  'longest_drive_genders',
  'pools',
];

export const POST: APIRoute = async (ctx) => {
  const id = ctx.params.id;
  if (typeof id !== 'string' || id.length === 0) {
    return json({ error: 'Missing tournament id.' }, 400);
  }

  const locals = ctx.locals as App.Locals;
  if (!locals.user?.id) {
    return json({ error: 'Sign in to change competitions.' }, 401);
  }

  let raw: { config?: unknown; roundId?: unknown; ctpHoles?: unknown };
  try {
    raw = (await ctx.request.json()) as typeof raw;
  } catch {
    return json({ error: 'Request body must be valid JSON.' }, 400);
  }

  try {
    const supabase = createSupabaseClient({
      request: ctx.request,
      cookies: ctx.cookies,
      locals,
    });
    const fresh = await getPublicTournament(supabase, id);
    if (!fresh) return json({ error: 'Tournament not found.' }, 404);

    const body: Record<string, unknown> = {};

    // ── Tournament-level competitions ────────────────────────────
    if (raw.config !== undefined) {
      const config = parseCompetitionConfig(raw.config);
      const patch = buildCompetitionPatch(config, fieldGenderOf(fresh));
      // Belt and braces: only competition keys leave this route, so a
      // future edit here cannot accidentally patch scoring or roster
      // fields through the same call.
      for (const k of ALLOWED_KEYS) body[k] = patch[k];
    }

    // ── Round-level: WHICH holes carry closest-to-pin ────────────
    const roundId = typeof raw.roundId === 'string' && raw.roundId.trim().length > 0
      ? raw.roundId.trim()
      : null;
    if (roundId && raw.ctpHoles !== undefined) {
      const round = (fresh.rounds ?? []).find((r) => r.id === roundId);
      if (!round) {
        return json({ error: 'That round is no longer on this tournament.' }, 404);
      }
      // Hole numbers are 1-indexed and bounded by the round's own
      // length. `ctp_holes` may legitimately name a NON-par-3 hole —
      // the model is hole-agnostic and a director may put a CTP
      // anywhere — so this does not filter by par.
      const totalHoles = Number(fresh.total_holes) > 0 ? Number(fresh.total_holes) : 18;
      const holes = Array.isArray(raw.ctpHoles)
        ? (raw.ctpHoles as unknown[])
            .map((h) => Number(h))
            .filter((h) => Number.isInteger(h) && h >= 1 && h <= totalHoles)
            .filter((h, i, a) => a.indexOf(h) === i)
            .sort((a, b) => a - b)
        : [];

      body.rounds = withFreshRounds(fresh, roundId, (r) => {
        const next: Record<string, unknown> = { ...r, ctp_holes: holes };
        // Drop the camelCase twin or `fromJson` would read the stale
        // one — it checks `ctpHoles` first.
        delete (next as Record<string, unknown>).ctpHoles;
        return next as never;
      });
    }

    if (Object.keys(body).length === 0) {
      return json({ error: 'Nothing to change.' }, 400);
    }

    await callRailway<{ tournament: { id: string } }>(ctx, {
      method: 'PATCH',
      path: `/api/tournaments/${encodeURIComponent(id)}`,
      body,
    });
    return json({ ok: true, changed: Object.keys(body) }, 200);
  } catch (err) {
    if (err instanceof ScoreLossError) {
      console.error('[api/tournaments/competition-config] score-loss guard', {
        tournament: id, round: err.roundId, before: err.before, after: err.after,
      });
      return json({ error: err.message, guard: 'score_loss' }, 409);
    }
    if (err instanceof RailwayApiError) {
      return json({ error: err.message }, err.status);
    }
    console.error('[api/tournaments/competition-config] unexpected', err);
    return json({ error: 'Could not save the competition setup.' }, 500);
  }
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
