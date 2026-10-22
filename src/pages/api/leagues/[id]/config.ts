import type { APIRoute } from 'astro';
import { createSupabaseClient } from '../../../../lib/supabase';
import { saveLeagueConfig } from '../../../../lib/leagueConfigSave';

// POST /api/leagues/[id]/config
//
// Edits a league's configuration from the director portal — W2b of the
// parity plan, which the plan already described as "a UI task with no
// research in front of it".
//
// WHY THIS IS NOT A SECOND WRITER. The manage page used to say "this
// page reads; the app writes", on the grounds that a second editor
// means two sets of validation. That was true on 2026-09-30 and was
// retired the next day: W2 made the schema GENERATED from the
// migrations, so the form, the allowed values and the cross-field
// rules all come from the same place Postgres gets them. There is one
// definition; two surfaces render it. Sam's L5 ("parity means the
// desk") names managing a season as web work.
//
// SUPABASE-DIRECT, like league create and the schedule route: leagues
// are Supabase-direct on both clients (parity plan L3), and routing
// this through Railway would reintroduce the very split it avoids.
//
// AUTHORISATION IS RLS. `leagues` carries `Owner manages own leagues`
// ALL with `using (user_id = auth.uid())`, so a non-owner's UPDATE
// matches zero rows rather than erroring. We ask for the row back and
// treat "no row" as 403 — otherwise a non-director gets a cheerful 200
// and no change. (Verified live 2026-10-05.)
//
// SEASON DUES (`dues_cents`, `dues_due_date`) are two of the generated
// columns, so the form's "Season dues" section saves here too — the
// web half of the app's "Set season dues…" sheet (Sam, 2026-10-22).
// They get their own server check (`validateDuesPatch`), because their
// CHECK is not among the generated cross-field rules.
//
// The owner check is explicit too (`leagues.user_id`), ahead of
// validation; RLS stays the second lock.
//
// All of the logic is in `saveLeagueConfig` (lib/leagueConfigSave.ts)
// so it is unit-tested; this file only wires it.
//
// THE AMOUNT OF TRUST PLACED IN THE CLIENT IS ZERO. Only generated
// column names are accepted, values are coerced by type, the patch is
// diffed against the CURRENT row server-side, and the merged result is
// run through the database's own cross-field rules before the write.

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

  const supabase = createSupabaseClient({
    request: ctx.request,
    cookies: ctx.cookies,
    locals,
  });
  try {
    const res = await saveLeagueConfig(supabase, id, user.id, body);
    return json(res.body, res.status);
  } catch (err) {
    console.error('[api/leagues/config]', err);
    return json({ error: 'Could not save these settings.' }, 500);
  }
};
