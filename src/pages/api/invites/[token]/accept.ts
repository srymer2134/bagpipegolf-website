import type { APIRoute } from 'astro';
import { callRailway, RailwayApiError } from '../../../../lib/railway';

// POST /api/invites/[token]/accept
//
// Web half of email-to-join. Proxies the signed-in visitor's Supabase
// JWT to Railway `POST /api/invites/:token/accept`, which appends them
// to the tournament roster through the `tournament_add_player`
// SECURITY DEFINER RPC and flips the invite to accepted. Idempotent
// upstream — a second click returns 200 without a duplicate row.
//
// Same-origin fetch from `/join/[code]` when the code is a UUID invite
// token. Signed-out visitors never reach this route: the page sends
// them through /login?next=/join/<token> first.
export const POST: APIRoute = async (ctx) => {
  const token = ctx.params.token;
  if (typeof token !== 'string' || !/^[0-9a-fA-F-]{36}$/.test(token)) {
    return json({ error: 'Missing or malformed invite token.' }, 400);
  }

  try {
    const result = await callRailway<{
      tournament?: { id?: string; name?: string };
      tournament_id?: string;
      alreadyAccepted?: boolean;
      already_accepted?: boolean;
    }>(ctx, {
      method: 'POST',
      path: `/api/invites/${encodeURIComponent(token)}/accept`,
    });
    const tournamentId = result?.tournament?.id ?? result?.tournament_id ?? null;
    return json(
      {
        ok: true,
        tournament_id: tournamentId,
        already_accepted: Boolean(result?.alreadyAccepted ?? result?.already_accepted),
      },
      200,
    );
  } catch (err) {
    if (err instanceof RailwayApiError) {
      return json({ error: err.message }, err.status);
    }
    console.error('[api/invites/[token]/accept] unexpected error', err);
    return json({ error: 'Accept failed.' }, 500);
  }
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
