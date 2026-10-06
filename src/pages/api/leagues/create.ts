import type { APIRoute } from 'astro';
import { createSupabaseClient } from '../../../lib/supabase';
import {
  buildLeagueRow, validateCreateLeague, type CreateLeagueInput,
} from '../../../lib/leagueCreate';
import { weekRowsFor } from '../../../lib/leagueSeasonDates';

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

    // The season's dates, as `league_weeks` rows — the authority for
    // slot → date, per that table's own comment. Only dated slots get
    // a row (`week_of` is NOT NULL), so an undecided event is simply
    // added later.
    //
    // A failure here does NOT fail the request: the league exists, and
    // telling the director "could not create the league" about a row
    // they can add from the schedule page would be a lie. It is
    // reported instead, so the page can say what happened.
    let weeks = 0;
    let weeksError: string | null = null;
    if (input.scheduleEnabled && data?.id) {
      const rows = weekRowsFor(data.id, input.dates ?? []);
      if (rows.length) {
        const { error: wErr } = await supabase.from('league_weeks').insert(rows);
        if (wErr) {
          console.error('[api/leagues/create:weeks]', wErr);
          weeksError = wErr.code === '23505'
            ? 'Two events share a date, so the schedule was not saved. '
              + 'Set the dates on the schedule page.'
            : 'The league was created, but its dates were not saved. '
              + 'Set them on the schedule page.';
        } else {
          weeks = rows.length;
        }
      }
    }

    return json({ ok: true, id: data?.id, name: data?.name, weeks, weeksError }, 201);
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
