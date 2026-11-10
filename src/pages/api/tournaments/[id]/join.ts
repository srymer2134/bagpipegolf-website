import type { APIRoute } from 'astro';
import { joinTournamentAsSelf } from '../../../../lib/tournamentJoin';

// POST /api/tournaments/[id]/join
//
// Web "Join as player" — the public-registration half of the join
// flow. Mirrors the app's Join Tournament screen. The work lives in
// `lib/tournamentJoin.ts`, shared with the league RSVP route.
//
// Reached from `/join/[code]` (6-char code resolved to a tournament) and
// from the public tournament page's "Join this tournament" card.
export const POST: APIRoute = async (ctx) => {
  const id = ctx.params.id;
  if (typeof id !== 'string' || id.length === 0) {
    return json({ error: 'Missing tournament id.' }, 400);
  }

  const user = (ctx.locals as App.Locals).user;
  if (!user) {
    return json({ error: 'Sign in to join.' }, 401);
  }

  const r = await joinTournamentAsSelf(ctx, id, user.id);
  if (!r.ok) {
    return json(r.code ? { error: r.error, code: r.code } : { error: r.error }, r.status);
  }
  return json(
    {
      ok: true,
      tournament_id: r.tournamentId,
      already_joined: r.alreadyJoined,
      handicap_used: r.handicapUsed,
      handicap_defaulted: r.handicapDefaulted,
    },
    200,
  );
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
