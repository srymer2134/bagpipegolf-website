import type { APIRoute } from 'astro';
import { createSupabaseFromApi } from '../../../../lib/supabase';
import { callRailway, RailwayApiError } from '../../../../lib/railway';
import { getPublicTournament } from '../../../../lib/tournamentQueries';
import { newTournamentId } from '../../../../lib/tournamentCreate';

// POST /api/tournaments/[id]/duplicate
//
// "Same event, next season" — server-side reads the source
// tournament (RLS gates to owner + spectators via the public-read
// policy), scrubs everything time/score/completion related, mints
// a fresh id, and posts the new payload to Railway
// `POST /api/tournaments`. Returns the new tournament id so the
// client can redirect to its Manage page.
//
// Body: none (source id is in the URL). Optional `name` override
// could be added later; for now the server appends "(copy)" to
// disambiguate the roster list.
//
// Kept server-side (rather than client-side fetch + rebuild) so
// the JWT stays out of the browser AND so the payload shape is
// enforced by our TypeScript build — a wire-shape drift in the
// client can't accidentally produce a broken tournament row.

export const POST: APIRoute = async (ctx) => {
  const id = ctx.params.id;
  if (typeof id !== 'string' || id.length === 0) {
    return json({ error: 'Missing tournament id.' }, 400);
  }

  const supabase = createSupabaseFromApi(ctx);
  const source = await getPublicTournament(supabase, id);
  if (!source) {
    return json({ error: 'Source tournament not found.' }, 404);
  }

  // Rebuild the create payload from the source. Keep everything
  // structural (course, roster, rounds, formats, tee catalog) and
  // wipe everything about state (scores, completion, timestamps,
  // published-at flags).
  const newId = newTournamentId();
  const payload: Record<string, unknown> = {
    id: newId,
    name: `${source.name} (copy)`,
    course_name: source.course_name ?? undefined,
    field_gender: (source as Record<string, unknown>).field_gender ?? 'male',
    scoring_mode: source.scoring_mode ?? 'strokeAggregate',
    use_net_scoring: source.use_net_scoring ?? true,
    use_group_scoring: false,
    total_holes: source.total_holes,
    par_total: source.par_total ?? null,
    course_rating: (source as Record<string, unknown>).course_rating ?? null,
    slope_rating: (source as Record<string, unknown>).slope_rating ?? null,
    tee_boxes: source.tee_boxes ?? [],
    // Roster carries through with the same handicaps + user
    // linkages. Stable ids are re-minted so the new tournament
    // has fresh player IDs (avoids any cross-tournament cache
    // collisions).
    players: (source.players ?? []).map((p, i) => ({
      id: `p_${newId}_${i}`,
      name: p.name,
      handicap: (p as { handicapIndex?: number }).handicapIndex ?? 18,
      userId: p.userId ?? null,
    })),
    // Rounds carry structure (tee/format/holes) but wipe scores +
    // completion state so the new event starts empty. Re-mint
    // round ids to match the new tournament id convention.
    rounds: (source.rounds ?? []).map((r, i) => {
      const rec = r as Record<string, unknown>;
      return {
        id: `r_${newId}_${Date.now()}_${i}`,
        index: i,
        teeBoxName: rec.teeBoxName ?? rec.teeName ?? 'White',
        totalHoles: rec.totalHoles ?? 18,
        format: rec.format ?? 'stroke',
        playerHoleScores: {},
        playerStrokes: {},
        completed: false,
      };
    }),
    // Empty everything else — director can rebuild flights /
    // sponsors / side games in the new tournament if desired.
    // Copying them adds complexity around ID remapping that isn't
    // worth it for the "same event next week" pattern.
    teams: [],
    flights: [],
    skins_competitions: [],
    pools: [],
    sponsors: [],
    captain_user_ids: [],
    track_ctp_on_par3s: false,
    track_longest_drive: false,
  };

  try {
    const result = await callRailway<{ tournament: { id: string } }>(ctx, {
      method: 'POST',
      path: '/api/tournaments',
      body: payload,
    });
    const newTournamentIdReturned = result?.tournament?.id;
    if (typeof newTournamentIdReturned !== 'string') {
      return json(
        { error: 'Railway responded without a tournament id.' },
        502,
      );
    }
    return json({ id: newTournamentIdReturned }, 200);
  } catch (err) {
    if (err instanceof RailwayApiError) {
      return json({ error: err.message }, err.status);
    }
    console.error('[api/tournaments/[id]/duplicate] unexpected error', err);
    return json({ error: 'Duplicate failed.' }, 500);
  }
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
