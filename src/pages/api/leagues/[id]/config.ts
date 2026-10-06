import type { APIRoute } from 'astro';
import { createSupabaseClient } from '../../../../lib/supabase';
import {
  LEAGUE_CONFIG_FIELDS,
  validateLeagueConfigRow,
  type CreateLeagueProblem,
} from '../../../../lib/leagueCreate';
import { buildConfigPatch } from '../../../../lib/leagueConfigForm';

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
// THE AMOUNT OF TRUST PLACED IN THE CLIENT IS ZERO. Only generated
// column names are accepted, values are coerced by type, the patch is
// diffed against the CURRENT row server-side, and the merged result is
// run through the database's own cross-field rules before the write.

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

/** Every column this route will ever write. Anything else in the body
 *  is ignored — not rejected, because a future client sending a field
 *  this deploy does not know about should not fail the whole save. */
const WRITABLE = new Set(LEAGUE_CONFIG_FIELDS.map((f) => f.name));

export const POST: APIRoute = async (ctx) => {
  const locals = ctx.locals as App.Locals;
  const user = locals.user;
  const id = ctx.params.id;
  if (!user?.id) return json({ error: 'Sign in first.' }, 401);
  if (!id) return json({ error: 'Missing league.' }, 400);

  let body: Record<string, unknown>;
  try {
    body = (await ctx.request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'Malformed request.' }, 400);
  }
  if (!body || typeof body !== 'object') {
    return json({ error: 'Malformed request.' }, 400);
  }

  const submitted: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (WRITABLE.has(k)) submitted[k] = v;
  }
  if (Object.keys(submitted).length === 0) {
    return json({ error: 'Nothing to save.' }, 400);
  }

  const supabase = createSupabaseClient({
    request: ctx.request,
    cookies: ctx.cookies,
    locals,
  });

  // Read the current row first. Two reasons, both load-bearing: the
  // patch is a DIFF (so a save never rewrites a column the director
  // did not touch), and the cross-field rules have to be checked
  // against the MERGED row — `absent_rule` alone is legal or illegal
  // only in the company of `week_format`.
  const cols = [...WRITABLE].join(', ');
  const { data: current, error: readErr } = await supabase
    .from('leagues')
    .select(cols)
    .eq('id', id)
    .maybeSingle();
  if (readErr) {
    console.error('[api/leagues/config:read]', readErr);
    return json({ error: 'Could not read this league.' }, 500);
  }
  if (!current) return json({ error: 'League not found.' }, 404);

  const currentRow = current as unknown as Record<string, unknown>;
  const patch = buildConfigPatch(submitted, currentRow);
  if (Object.keys(patch).length === 0) {
    return json({ ok: true, changed: [], message: 'No changes.' });
  }

  const problems: CreateLeagueProblem[] = validateLeagueConfigRow({
    ...currentRow,
    ...patch,
  });
  if (problems.length) {
    return json({ error: problems[0].message, problems }, 400);
  }

  const { data, error } = await supabase
    .from('leagues')
    .update(patch)
    .eq('id', id)
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('[api/leagues/config:write]', error);
    // 23514 = a CHECK we did not mirror. It should be unreachable —
    // validateLeagueConfigRow implements the same constraints — so it
    // means the generated schema is behind the database. Say that,
    // rather than "something went wrong".
    if (error.code === '23514') {
      return json({
        error:
          'The database rejected these settings. The web form may be out of ' +
          'date with the league rules — please set this in the app and tell us.',
      }, 400);
    }
    if (error.code === '23502') {
      return json({ error: 'A required setting cannot be blank.' }, 400);
    }
    return json({ error: 'Could not save these settings.' }, 500);
  }
  if (!data) {
    return json({ error: 'Only the league commissioner can change settings.' }, 403);
  }

  return json({ ok: true, changed: Object.keys(patch).sort() });
};
