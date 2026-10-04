import type { APIRoute } from 'astro';
import { callRailway, RailwayApiError } from '../../../../lib/railway';
import { createSupabaseClient } from '../../../../lib/supabase';
import { getPublicTournament } from '../../../../lib/tournamentQueries';
import {
  ScoreLossError,
  assertNoScoreLoss,
  rebaseRoundsOntoFresh,
  scoredCellCount,
} from '../../../../lib/tournamentWrite';

// POST /api/tournaments/[id]/rounds
//
// The guarded replacement for `manage.astro`'s two `rounds` writes.
//
// 🚨 WHAT THIS FIXES, AND WHY IT IS MY BUG
//
// Patrick's 2026-10-04 audit (F12 / PA-A4) found `manage.astro`
// PATCHing `tournaments.rounds` WHOLESALE from a page-load snapshot
// (`initialRounds: tournament.rounds ?? []`) through
// `/api/tournaments/[id]/update` — a transparent proxy. Railway writes
// the array as given and has no per-record merge (Layer 3 never
// built). So a tab open for an hour, a phone entering scores in the
// meantime, and one round-name edit silently overwrites those scores.
// That is the 2026-06-21 Scarecrow Cup R1 shape.
//
// On 2026-10-02 I built exactly this guard for the NEW pairings and
// competitions routes and never audited the page that already had the
// bug. The guard existed; it just was not in front of the oldest and
// busiest writer.
//
// HOW IT IS SAFE
//
// The browser still sends the rounds it edited — rewriting both
// editors to send deltas would be a much larger change — but this
// handler never trusts that array as the thing to store. It:
//
//   1. re-reads the tournament fresh, server-side, in this request;
//   2. for each incoming round, takes the FRESH round by id as the
//      base and overlays only the client's NON-SCORE keys;
//   3. restores the score keys from the fresh read unconditionally, so
//      scores cannot be carried over from the snapshot even if the
//      client sends them;
//   4. runs `assertNoScoreLoss` before anything leaves;
//   5. PATCHes through Railway as the signed-in user.
//
// Step 3 is what makes this structurally safe rather than carefully
// safe: the client's score values are discarded, not validated.

export const POST: APIRoute = async (ctx) => {
  const id = ctx.params.id;
  if (typeof id !== 'string' || id.length === 0) {
    return json({ error: 'Missing tournament id.' }, 400);
  }

  const locals = ctx.locals as App.Locals;
  if (!locals.user?.id) return json({ error: 'Sign in to edit rounds.' }, 401);

  let raw: Record<string, unknown>;
  try {
    raw = (await ctx.request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'Request body must be valid JSON.' }, 400);
  }
  if (!Array.isArray(raw.rounds)) {
    return json({ error: '`rounds` must be an array.' }, 400);
  }

  try {
    const supabase = createSupabaseClient({
      request: ctx.request,
      cookies: ctx.cookies,
      locals,
    });
    const fresh = await getPublicTournament(supabase, id);
    if (!fresh) return json({ error: 'Tournament not found.' }, 404);
    if (fresh.user_id !== locals.user.id) {
      // Editing rounds is a director action. Railway would accept any
      // roster member; this page is owner-gated, so the route should
      // be too.
      return json({ error: 'Only the tournament host can edit rounds.' }, 403);
    }

    const freshRounds = (fresh.rounds ?? []) as unknown as Record<string, unknown>[];
    const merged = rebaseRoundsOntoFresh(
      freshRounds,
      raw.rounds as Record<string, unknown>[],
    );

    // Any round the client omitted entirely: the guard decides. It
    // refuses an omission, which is what we want — removing a round is
    // not something either editor does.
    assertNoScoreLoss(freshRounds, merged);

    const body: Record<string, unknown> = { rounds: merged };
    // Pass through the other fields these editors legitimately send.
    for (const k of ['total_holes', 'teams', 'flights']) {
      if (k in raw) body[k] = raw[k];
    }

    await callRailway(ctx, {
      method: 'PATCH',
      path: `/api/tournaments/${encodeURIComponent(id)}`,
      body,
    });
    return json({
      ok: true,
      rounds: merged.length,
      scoresPreserved: merged.reduce((n, r) => n + scoredCellCount(r), 0),
    }, 200);
  } catch (err) {
    if (err instanceof ScoreLossError) {
      console.error('[api/tournaments/rounds] score-loss guard', {
        tournament: id, round: err.roundId, before: err.before, after: err.after,
      });
      return json({ error: err.message, guard: 'score_loss' }, 409);
    }
    if (err instanceof RailwayApiError) {
      return json({ error: err.message }, err.status);
    }
    console.error('[api/tournaments/rounds] unexpected', err);
    return json({ error: 'Could not save the rounds.' }, 500);
  }
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
