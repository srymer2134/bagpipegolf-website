import type { APIRoute } from 'astro';
import { callRailway, RailwayApiError } from '../../../../../lib/railway';

// POST /api/invites/code/[code]/accept
//
// Web half of join-by-code. Proxies the signed-in visitor's Supabase
// JWT to Railway `POST /api/invites/code/:code/accept`, which resolves
// the code to a shared tournament or a league and appends the caller
// through `tournament_add_player` / `league_add_member` — both
// SECURITY DEFINER and both deduped on the caller's user id, so a
// second click returns 200 without a duplicate roster row.
//
// A code is a bearer capability rather than an invite: there is no
// invite row to consume, so nothing is marked accepted.
//
// Same-origin fetch from `/join/[code]` when the code is 6 chars.
// Signed-out visitors never reach this route — the page sends them
// through /login?next=/join/<CODE> first.
export const POST: APIRoute = async (ctx) => {
  const raw = ctx.params.code;
  const code = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
  if (!/^[A-Z0-9]{6}$/.test(code)) {
    return json({ error: 'A join code is 6 letters or digits.' }, 400);
  }

  try {
    const result = await callRailway<{
      kind?: 'tournament' | 'league';
      id?: string;
      tournament?: { id?: string };
      league?: { id?: string };
      alreadyJoined?: boolean;
    }>(ctx, {
      method: 'POST',
      path: `/api/invites/code/${encodeURIComponent(code)}/accept`,
    });

    const kind = result?.kind ?? null;
    const id =
      result?.id ?? result?.tournament?.id ?? result?.league?.id ?? null;

    return json(
      {
        ok: true,
        kind,
        // `tournament_id` is kept for the existing client script, which
        // reads it to retarget the "Open the tournament" link.
        tournament_id: kind === 'tournament' ? id : null,
        league_id: kind === 'league' ? id : null,
        already_joined: Boolean(result?.alreadyJoined),
      },
      200,
    );
  } catch (err) {
    if (err instanceof RailwayApiError) {
      return json({ error: err.message }, err.status);
    }
    console.error('[api/invites/code/[code]/accept] unexpected error', err);
    return json({ error: 'Join failed.' }, 500);
  }
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
