import type { APIRoute } from 'astro';
import { createSupabaseClient } from '../../../lib/supabase';
import {
  buildLeagueRow, validateCreateLeague, type CreateLeagueInput,
} from '../../../lib/leagueCreate';

// POST /api/leagues/create
//
// Supabase-direct, as the signed-in user, mirroring the app's
// `LeagueNotifier.createLeague`. See `lib/leagueCreate.ts` for why this
// does not go through Railway the way tournament create does.
//
// The insert is authorised by RLS, not by this handler: `leagues` has
// `Owner manages own leagues` with `with_check (user_id = auth.uid())`,
// so a forged `user_id` in the payload is rejected by Postgres rather
// than trusted here. We still set it from the session so the common
// path never trips that check.
export const POST: APIRoute = async (ctx) => {
  const locals = ctx.locals as App.Locals;
  const user = locals.user;
  if (!user?.id) return json({ error: 'Sign in to create a league.' }, 401);

  let input: CreateLeagueInput;
  try {
    input = (await ctx.request.json()) as CreateLeagueInput;
  } catch {
    return json({ error: 'Malformed request.' }, 400);
  }

  const problems = validateCreateLeague(input);
  if (problems.length) return json({ error: problems[0].message, problems }, 400);

  const row = buildLeagueRow(input, user.id);

  try {
    const supabase = createSupabaseClient({
      request: ctx.request,
      cookies: ctx.cookies,
      locals,
    });
    const { data, error } = await supabase
      .from('leagues')
      .insert(row)
      .select('id, name')
      .single();

    if (error) {
      console.error('[api/leagues/create]', error);
      // 23505 = unique violation. The id is epoch-ms scoped to one
      // creator, so this realistically means a double-submit.
      if (error.code === '23505') {
        return json({ error: 'That league was already created.' }, 409);
      }
      if (error.code === '42501') {
        return json({ error: 'Not allowed to create a league for another user.' }, 403);
      }
      return json({ error: 'Could not create the league.' }, 500);
    }

    return json({ ok: true, id: data?.id, name: data?.name }, 201);
  } catch (err) {
    console.error('[api/leagues/create] unexpected', err);
    return json({ error: 'Could not create the league.' }, 500);
  }
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
