import type { APIContext } from 'astro';
import { callRailway, RailwayApiError } from './railway';
import { createSupabaseFromApi } from './supabase';

// Add the signed-in user to a tournament's field. Shared by
// `POST /api/tournaments/[id]/join` and the league RSVP route, which adds
// a player who says "I'm in" to the week's tournament the same way the
// app's `LeagueSignupsNotifier._addToTournament` does.
//
// Name + handicap come from the profile, never from the request body, so
// nobody can register under someone else's name. Proxies to Railway
// `POST /api/tournaments/:id/add-player` (the `tournament_add_player`
// RPC, caller uid stamped). Idempotent upstream (`alreadyJoined`).

export type JoinResult =
  | {
      ok: true;
      tournamentId: string;
      alreadyJoined: boolean;
      handicapUsed: number;
      handicapDefaulted: boolean;
    }
  | { ok: false; status: number; error: string; code?: string };

export async function joinTournamentAsSelf(
  ctx: APIContext,
  tournamentId: string,
  userId: string,
): Promise<JoinResult> {
  let displayName = '';
  let handicap: number | null = null;
  try {
    const supabase = createSupabaseFromApi(ctx);
    const { data } = await supabase
      .from('profiles')
      .select('display_name, handicap')
      .eq('id', userId)
      .maybeSingle();
    const row = data as { display_name?: string | null; handicap?: number | null } | null;
    displayName = (row?.display_name ?? '').trim();
    handicap = typeof row?.handicap === 'number' ? row.handicap : null;
  } catch (err) {
    console.error('[tournamentJoin] profile read failed', err);
  }

  if (!displayName) {
    return {
      ok: false,
      status: 409,
      error: 'Set your display name in Profile first, then try again.',
      code: 'no_name',
    };
  }
  // Same default the app's profile model carries when no handicap is set.
  const handicapIndex = handicap ?? 18.0;

  try {
    const result = await callRailway<{
      tournament?: { id?: string; name?: string };
      addedPlayer?: { id?: string };
      alreadyJoined?: boolean;
    }>(ctx, {
      method: 'POST',
      path: `/api/tournaments/${encodeURIComponent(tournamentId)}/add-player`,
      body: { name: displayName, handicap_index: handicapIndex },
    });
    return {
      ok: true,
      tournamentId: result?.tournament?.id ?? tournamentId,
      alreadyJoined: Boolean(result?.alreadyJoined),
      handicapUsed: handicapIndex,
      handicapDefaulted: handicap === null,
    };
  } catch (err) {
    if (err instanceof RailwayApiError) {
      return { ok: false, status: err.status, error: err.message };
    }
    console.error('[tournamentJoin] unexpected error', err);
    return { ok: false, status: 500, error: 'Join failed.' };
  }
}
