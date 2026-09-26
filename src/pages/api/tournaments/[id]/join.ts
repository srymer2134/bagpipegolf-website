import type { APIRoute } from 'astro';
import { callRailway, RailwayApiError } from '../../../../lib/railway';
import { createSupabaseFromApi } from '../../../../lib/supabase';

// POST /api/tournaments/[id]/join
//
// Web "Join as player" — the public-registration half of the join
// flow. Mirrors the app's Join Tournament screen: read the signed-in
// visitor's display name + handicap from `profiles`, then proxy to
// Railway `POST /api/tournaments/:id/add-player`, which appends them
// through the `tournament_add_player` RPC with the caller's auth uid
// stamped as `userId`. Idempotent upstream (`alreadyJoined: true` on a
// re-join).
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

  // Name + handicap come from the profile, never from the request body,
  // so a joiner can't register under someone else's name.
  let displayName = '';
  let handicap: number | null = null;
  try {
    const supabase = createSupabaseFromApi(ctx);
    const { data } = await supabase
      .from('profiles')
      .select('display_name, handicap')
      .eq('id', user.id)
      .maybeSingle();
    const row = data as { display_name?: string | null; handicap?: number | null } | null;
    displayName = (row?.display_name ?? '').trim();
    handicap = typeof row?.handicap === 'number' ? row.handicap : null;
  } catch (err) {
    console.error('[api/tournaments/[id]/join] profile read failed', err);
  }

  if (!displayName) {
    return json(
      { error: 'Set your display name in Profile first, then try again.', code: 'no_name' },
      409,
    );
  }
  // Same default the app's profile model carries when no handicap has
  // been set yet. The page tells the joiner which number was used.
  const handicapIndex = handicap ?? 18.0;

  try {
    const result = await callRailway<{
      tournament?: { id?: string; name?: string };
      addedPlayer?: { id?: string };
      alreadyJoined?: boolean;
    }>(ctx, {
      method: 'POST',
      path: `/api/tournaments/${encodeURIComponent(id)}/add-player`,
      body: { name: displayName, handicap_index: handicapIndex },
    });
    return json(
      {
        ok: true,
        tournament_id: result?.tournament?.id ?? id,
        already_joined: Boolean(result?.alreadyJoined),
        handicap_used: handicapIndex,
        handicap_defaulted: handicap === null,
      },
      200,
    );
  } catch (err) {
    if (err instanceof RailwayApiError) {
      return json({ error: err.message }, err.status);
    }
    console.error('[api/tournaments/[id]/join] unexpected error', err);
    return json({ error: 'Join failed.' }, 500);
  }
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
