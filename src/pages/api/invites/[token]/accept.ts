import type { APIRoute } from 'astro';
import { callRailway, RailwayApiError } from '../../../../lib/railway';
import { isInviteToken } from '../../../../lib/inviteTokenShape';
import { isPassRequiredError, playerRefusal } from '../../../../lib/tournamentPass';

// POST /api/invites/[token]/accept
//
// Web half of email-to-join. Proxies the signed-in visitor's Supabase
// JWT to Railway `POST /api/invites/:token/accept`, which appends them
// to the tournament roster through the `tournament_add_player`
// SECURITY DEFINER RPC and flips the invite to accepted. Idempotent
// upstream — a second click returns 200 without a duplicate row.
//
// Same-origin fetch from `/join/[code]` when the parameter is an invite
// token (32-hex as minted today, or a legacy UUID). Signed-out visitors
// never reach this route: the page sends them through
// /login?next=/join/<token> first.
export const POST: APIRoute = async (ctx) => {
  const token = ctx.params.token;
  // Shared with /join/[code] via isInviteToken, deliberately. This gate
  // used to be its own `/^[0-9a-fA-F-]{36}$/` — a UUID length — while
  // the API mints `randomBytes(16).toString('hex')`, 32 characters.
  // #163 widened the PAGE and left this behind, so the invite rendered
  // perfectly and Accept answered "Missing or malformed invite token".
  // One predicate now, so the two cannot drift again.
  if (!isInviteToken(token)) {
    return json({ error: 'Missing or malformed invite token.' }, 400);
  }

  try {
    const result = await callRailway<{
      tournament?: { id?: string; name?: string };
      tournament_id?: string;
      // Railway's league accept returns `{ kind: 'league', league: <row>,
      // alreadyJoined }` — the whole leagues row, so `league.id` is here.
      // This proxy used to drop it entirely and return only
      // `tournament_id`, which meant a league invite accepted from an
      // EMAILED token had no id to redirect with: the page fell back to
      // the bare `/app/leagues` list, and any fix keyed on
      // `body.league_id` was a silent no-op.
      league?: { id?: string };
      league_id?: string;
      alreadyAccepted?: boolean;
      alreadyJoined?: boolean;
      already_accepted?: boolean;
    }>(ctx, {
      method: 'POST',
      path: `/api/invites/${encodeURIComponent(token)}/accept`,
    });
    const tournamentId = result?.tournament?.id ?? result?.tournament_id ?? null;
    const leagueId = result?.league?.id ?? result?.league_id ?? null;
    return json(
      {
        ok: true,
        tournament_id: tournamentId,
        league_id: leagueId,
        already_accepted: Boolean(
          result?.alreadyAccepted ??
            result?.alreadyJoined ??
            result?.already_accepted,
        ),
      },
      200,
    );
  } catch (err) {
    // Field-size gate (api #182): the tournament is past its free limit
    // with no pass. A PLAYER can't buy one, so: full, ask the organizer —
    // no price, no billing link (lib/tournamentPass.ts).
    if (isPassRequiredError(err)) {
      const r = playerRefusal();
      return json(r.body, r.status);
    }
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
