import type { APIRoute } from 'astro';
import { createSupabaseClient } from '../../../../lib/supabase';
import type { LeagueSchedule } from '../../../../lib/leaguePortal';
import { WEEK_FORMATS } from '../../../../lib/leagueEvents';

// POST /api/leagues/[id]/events
//
// One event of a season: which tournament IS it, and what format is it
// played in. Both live in `leagues.schedule` — `bindings[slot]` and
// `formats[slot]` — the same jsonb the app's schedule dialog writes.
//
// WHY THIS IS SEPARATE FROM /schedule. That route owns the season's
// SHAPE: how many events, and when. This one owns a SINGLE event, and a
// director editing week 4 must not have to resubmit all sixteen dates
// to do it — a whole-schedule write is also the one operation a DB
// trigger can refuse (a played week is immutable), so attaching a
// per-event edit to it would make binding a tournament fail for
// unrelated reasons.
//
// AUTHORISATION IS RLS, twice over:
//   • `leagues` carries `Owner manages own leagues` ALL with
//     `using (user_id = auth.uid())`, so a non-owner's UPDATE matches
//     zero rows. We ask for the row back and treat "no row" as 403,
//     because otherwise a member gets a cheerful 200 and no change.
//   • The tournament being bound must be one the actor OWNS.
//     `tournaments` UPDATE is `user_id = auth.uid()` while SELECT is
//     public, so binding a tournament you can only read would create an
//     event in your own league that you cannot run. Refuse it here
//     rather than ship a Manage button that 302s away.

const MAX_SLOT = 51; // mirrors the 2..52 event bound on /schedule

const KNOWN_FORMATS = new Set(WEEK_FORMATS.map((f) => f.wire));

export const POST: APIRoute = async (ctx) => {
  const locals = ctx.locals as App.Locals;
  const user = locals.user;
  const id = ctx.params.id;
  if (!user?.id) return json({ error: 'Sign in first.' }, 401);
  if (!id) return json({ error: 'Missing league.' }, 400);

  let body: {
    slot?: number;
    /** A tournament id to bind, '' or null to unbind, undefined to
     *  leave the binding exactly as it is. */
    tournamentId?: string | null;
    /** A week format, '' or null to clear, undefined to leave alone. */
    format?: string | null;
  };
  try {
    body = await ctx.request.json();
  } catch {
    return json({ error: 'Malformed request.' }, 400);
  }

  const slot = Number(body.slot);
  if (!Number.isInteger(slot) || slot < 0 || slot > MAX_SLOT) {
    return json({ error: 'That is not an event in this season.' }, 400);
  }

  const touchesBinding = 'tournamentId' in body;
  const touchesFormat = 'format' in body;
  if (!touchesBinding && !touchesFormat) {
    return json({ error: 'Nothing to change.' }, 400);
  }

  const rawFormat = typeof body.format === 'string' ? body.format.trim() : '';
  if (touchesFormat && rawFormat !== '' && !KNOWN_FORMATS.has(rawFormat as never)) {
    return json({ error: 'That is not a format we know.' }, 400);
  }

  const rawTid = typeof body.tournamentId === 'string'
    ? body.tournamentId.trim()
    : '';

  const supabase = createSupabaseClient({
    request: ctx.request,
    cookies: ctx.cookies,
    locals,
  });

  const { data: existing, error: readErr } = await supabase
    .from('leagues')
    .select('schedule, user_id')
    .eq('id', id)
    .maybeSingle();
  if (readErr) {
    console.error('[api/leagues/events:read]', readErr);
    return json({ error: 'Could not load the league.' }, 500);
  }
  if (!existing) return json({ error: 'League not found.' }, 404);
  if ((existing as { user_id?: string }).user_id !== user.id) {
    return json({ error: 'Only the league director can change an event.' }, 403);
  }

  const prev = (existing as { schedule?: LeagueSchedule | null }).schedule ?? null;
  if (!prev) {
    return json({ error: 'Set up the season before editing an event.' }, 400);
  }
  if (slot >= (Number(prev.eventCount) || 0)) {
    return json({ error: 'That event is not in this season.' }, 400);
  }

  const bindings: Record<string, string> = { ...(prev.bindings ?? {}) };
  const formats: Record<string, string> = { ...(prev.formats ?? {}) };
  const key = String(slot);

  if (touchesBinding) {
    if (rawTid === '') {
      delete bindings[key];
    } else {
      // A tournament is ONE event. Binding it to a second slot would
      // make the same leaderboard count twice in the standings.
      const clash = Object.entries(bindings)
        .find(([k, v]) => v === rawTid && k !== key);
      if (clash) {
        return json({
          error: `That tournament is already event ${Number(clash[0]) + 1} of this season.`,
        }, 409);
      }
      // Ownership, not just existence. See the header.
      const { data: t, error: tErr } = await supabase
        .from('tournaments')
        .select('id, user_id, name')
        .eq('id', rawTid)
        .maybeSingle();
      if (tErr) {
        console.error('[api/leagues/events:tournament]', tErr);
        return json({ error: 'Could not check that tournament.' }, 500);
      }
      if (!t) return json({ error: 'That tournament no longer exists.' }, 404);
      if ((t as { user_id?: string }).user_id !== user.id) {
        return json({
          error: 'You can only attach a tournament you created — otherwise '
            + 'nobody in this league could run it.',
        }, 403);
      }
      bindings[key] = rawTid;
    }
  }

  if (touchesFormat) {
    if (rawFormat === '') delete formats[key];
    else formats[key] = rawFormat;
  }

  // Everything else in the seed is carried through untouched. Writing a
  // fresh object here would drop `names`, which the web owns, and the
  // dates' interval hint.
  const schedule: LeagueSchedule = { ...prev, bindings, formats };

  const { data, error } = await supabase
    .from('leagues')
    .update({ schedule })
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (error) {
    console.error('[api/leagues/events:write]', error);
    return json({ error: 'Could not save this event.' }, 500);
  }
  if (!data) {
    return json({ error: 'Only the league director can change an event.' }, 403);
  }

  return json({
    ok: true,
    slot,
    tournamentId: bindings[key] ?? null,
    format: formats[key] ?? null,
  });
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
