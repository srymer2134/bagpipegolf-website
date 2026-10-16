import type { APIRoute } from 'astro';
import { createSupabaseClient } from '../../../../lib/supabase';
import { saveOwnParticipation } from '../../../../lib/leagueParticipation';

// POST /api/leagues/[id]/participation
//
// The league OWNER's own participation: playing or only organizing,
// and their own dues override — fairwayiq-flutter
// `docs/plans/LEAGUE_OWNER_PARTICIPATION_PLAN.md` §2 (D3, D4, D5).
//
// Same shape as `config.ts` beside it: Supabase-direct with the user's
// session (leagues are Supabase-direct on both clients), JSON in, JSON
// out, and zero trust in the client. All of the logic — field
// validation, the owner check, update-else-insert — is in
// `saveOwnParticipation` so it is unit-tested; this file only wires it.
//
// Body: `{ role: 'player' | 'organizer', dues_cents: number | null }`.
// Writes ONLY the caller's own `league_members` row. The DB's
// owner-only trigger on `dues_cents`/`role` is the second lock.

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

  let body: unknown;
  try {
    body = await ctx.request.json();
  } catch {
    return json({ error: 'Malformed request.' }, 400);
  }

  const supabase = createSupabaseClient({ request: ctx.request, cookies: ctx.cookies, locals });
  try {
    const res = await saveOwnParticipation(supabase, id, user.id, body);
    return json(res.body, res.status);
  } catch (err) {
    console.error('[api/leagues/participation]', err);
    return json({ error: 'Could not save.' }, 500);
  }
};
