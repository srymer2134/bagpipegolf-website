import type { APIRoute } from 'astro';
import { createSupabaseClient } from '../../../../lib/supabase';
import { leagueDetail } from '../../../../lib/leaguePortal';
import { loadOwnMembership } from '../../../../lib/leagueParticipation';
import { parseRsvpBody, planRsvp } from '../../../../lib/leagueRsvp';
import { joinTournamentAsSelf } from '../../../../lib/tournamentJoin';

// POST /api/leagues/[id]/rsvp
//
// The signed-in player's answer for one league event, from the event
// sign-up page. Body: `{ slot: number, status: 'in' | 'out' }`.
//
// Supabase-direct with the user's session, like the app
// (`LeagueSignupsNotifier.setRsvp`): it upserts the caller's own
// `league_signups` row and nothing else; RLS is the second lock. The
// rules live in `lib/leagueRsvp.ts` so they are unit-tested.
//
// "In" on an event already bound to a tournament also adds the player to
// that field via `joinTournamentAsSelf` — the app does the same. The RSVP
// is saved first; a failed field add is reported, not rolled back,
// because the app treats it as best-effort too.

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export const POST: APIRoute = async (ctx) => {
  const locals = ctx.locals as App.Locals;
  const user = locals.user;
  const id = ctx.params.id;
  if (!user?.id) return json({ error: 'Sign in first.' }, 401);
  if (!id) return json({ error: 'Missing league.' }, 400);

  let raw: unknown;
  try {
    raw = await ctx.request.json();
  } catch {
    return json({ error: 'Malformed request.' }, 400);
  }
  const body = parseRsvpBody(raw);
  if (!body) return json({ error: 'Malformed request.' }, 400);

  const supabase = createSupabaseClient({
    request: ctx.request,
    cookies: ctx.cookies,
    locals,
  });

  let plan;
  try {
    const [detail, own] = await Promise.all([
      leagueDetail(supabase, id, user.id),
      loadOwnMembership(supabase, id, user.id),
    ]);
    const event = detail?.events.find((e) => e.slot_index === body.slot) ?? null;
    const bound = detail?.schedule?.bindings?.[String(body.slot)] ?? null;
    plan = planRsvp({
      member: own.row,
      event,
      status: body.status,
      boundTournamentId: typeof bound === 'string' && bound ? bound : null,
    });
  } catch (err) {
    console.error('[api/leagues/[id]/rsvp] load failed', err);
    return json({ error: 'Could not load the league. Try again.' }, 500);
  }
  if (!plan.ok) return json({ error: plan.error }, plan.httpStatus);

  const { error } = await supabase
    .from('league_signups')
    .upsert(
      {
        league_id: id,
        user_id: user.id,
        slot_index: plan.slot,
        status: plan.status,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'league_id,user_id,slot_index' },
    );
  if (error) {
    console.error('[api/leagues/[id]/rsvp] upsert failed', error);
    return json({ error: 'Could not save your answer. Try again.' }, 500);
  }

  let fieldError: string | null = null;
  if (plan.addToTournament) {
    const joined = await joinTournamentAsSelf(ctx, plan.addToTournament, user.id);
    if (!joined.ok) fieldError = joined.error;
  }

  return json({ ok: true, status: plan.status, field_error: fieldError });
};
