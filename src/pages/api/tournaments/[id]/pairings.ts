import type { APIRoute } from 'astro';
import { callRailway, RailwayApiError } from '../../../../lib/railway';
import { createSupabaseClient } from '../../../../lib/supabase';
import { getPublicTournament } from '../../../../lib/tournamentQueries';
import {
  ScoreLossError,
  normalizePairings,
  withFreshRounds,
  type PairingInput,
} from '../../../../lib/tournamentWrite';

// POST /api/tournaments/[id]/pairings
//
// Save the groups / teams for ONE round. W3 of the parity plan.
//
// WHY THIS IS NOT JUST A CALL TO /update
//
// `/update` is a transparent proxy: whatever the browser sends goes
// to Railway's PATCH, which writes `rounds` wholesale with no
// per-record merge and no shrink detection (Layer 3 of
// DATA_DROP_PREVENTION was specified and never built — verified in
// `packages/api/src/routes/tournaments.ts`, 2026-10-01). A browser
// posting a `rounds` array it assembled from a page-load snapshot is
// the 2026-06-21 Scarecrow Cup R1 wipe, re-implemented in a tab that
// may have been open for an hour.
//
// So the browser never sends `rounds` here. It sends ONE round's
// pairing intent — `{roundId, teams}` — and this handler:
//
//   1. re-reads the tournament fresh, server-side, in this request;
//   2. rebuilds `rounds` from THAT read via `withFreshRounds`, which
//      touches only the named round and passes every other through
//      by reference;
//   3. runs the score-loss guard before anything leaves;
//   4. PATCHes through Railway as the signed-in user, so authz is
//      the same surface the app hits.
//
// The window between the read and the write is milliseconds instead
// of however long the tab was open, and the guard covers that window.
//
// 🚨 Do not "simplify" this into a client-built `rounds` payload.
// That is the bug, not the boilerplate.

const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;

export const POST: APIRoute = async (ctx) => {
  const id = ctx.params.id;
  if (typeof id !== 'string' || id.length === 0) {
    return json({ error: 'Missing tournament id.' }, 400);
  }

  const locals = ctx.locals as App.Locals;
  if (!locals.user?.id) return json({ error: 'Sign in to edit pairings.' }, 401);

  let raw: { roundId?: unknown; teams?: unknown };
  try {
    raw = (await ctx.request.json()) as typeof raw;
  } catch {
    return json({ error: 'Request body must be valid JSON.' }, 400);
  }

  const roundId = str(raw?.roundId);
  if (!roundId) return json({ error: 'Which round? `roundId` is required.' }, 400);
  if (!Array.isArray(raw?.teams)) {
    return json({ error: '`teams` must be an array.' }, 400);
  }

  // Rebuilt field by field from untrusted input, with unique group
  // ids and no player in two groups. Pure + unit-tested in
  // `tournamentWrite.test.ts`.
  const teams = normalizePairings(roundId, raw.teams as PairingInput[]);

  // ── Fresh read, in THIS request ────────────────────────────────
  let rounds: Record<string, unknown>[];
  try {
    const supabase = createSupabaseClient({
      request: ctx.request,
      cookies: ctx.cookies,
      locals,
    });
    const fresh = await getPublicTournament(supabase, id);
    if (!fresh) return json({ error: 'Tournament not found.' }, 404);

    rounds = withFreshRounds(fresh, roundId, (round) => ({
      ...round,
      // Only this key changes. Everything else on the round — scores,
      // tee boxes, spine ids, settings this client has never heard of
      // — rides along from the fresh read untouched.
      teams: teams as never,
    }));
  } catch (err) {
    if (err instanceof ScoreLossError) {
      // The guard fired. This is a refusal, not a crash: 409 so the
      // browser can tell the director to reload rather than retry.
      console.error('[api/tournaments/pairings] score-loss guard', {
        tournament: id,
        round: err.roundId,
        before: err.before,
        after: err.after,
      });
      return json({ error: err.message, guard: 'score_loss' }, 409);
    }
    const message = err instanceof Error ? err.message : 'Could not load the tournament.';
    return json({ error: message }, 400);
  }

  // ── Write, as the user, through the app's own contract ─────────
  try {
    await callRailway<{ tournament: { id: string } }>(ctx, {
      method: 'PATCH',
      path: `/api/tournaments/${encodeURIComponent(id)}`,
      body: { rounds },
    });
    return json({ ok: true, roundId, groups: teams.length }, 200);
  } catch (err) {
    if (err instanceof RailwayApiError) {
      return json({ error: err.message }, err.status);
    }
    console.error('[api/tournaments/pairings] unexpected', err);
    return json({ error: 'Could not save the pairings.' }, 500);
  }
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
