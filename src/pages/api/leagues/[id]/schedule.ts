import type { APIRoute } from 'astro';
import { createSupabaseClient } from '../../../../lib/supabase';
import type { LeagueSchedule } from '../../../../lib/leaguePortal';

// POST /api/leagues/[id]/schedule
//
// Sets the season seed on `leagues.schedule` — the same write the app's
// `showLeagueScheduleDialog` performs via `updateLeague(schedule: …)`.
// Supabase-direct for the same reason league create is: leagues are
// Supabase-direct by design, and a second path would need a second set
// of validation.
//
// AUTHORISATION IS RLS. `leagues` has `Owner manages own leagues` with
// `using (user_id = auth.uid())`, so a non-owner's UPDATE matches zero
// rows rather than erroring. We ask for the updated row back and treat
// "no row" as 403 — otherwise a non-director would get a cheerful 200
// and no change.

const MAX_SLOTS = 104; // mirrors LeagueSchedule.slotDates' 2-year ceiling

export const POST: APIRoute = async (ctx) => {
  const locals = ctx.locals as App.Locals;
  const user = locals.user;
  const id = ctx.params.id;
  if (!user?.id) return json({ error: 'Sign in first.' }, 401);
  if (!id) return json({ error: 'Missing league.' }, 400);

  let body: {
    startDate?: string;
    intervalDays?: number;
    eventCount?: number;
    clear?: boolean;
  };
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

  // Read the current seed first. `bindings` (slot → tournament) and
  // `formats` (slot → week format) live in this same jsonb, and the
  // app's dialog is explicit that an edit must preserve them. Writing
  // a fresh object would silently unbind every tournament attached to
  // the season.
  const { data: existing, error: readErr } = await supabase
    .from('leagues')
    .select('schedule, user_id')
    .eq('id', id)
    .maybeSingle();
  if (readErr) {
    console.error('[api/leagues/schedule:read]', readErr);
    return json({ error: 'Could not load the league.' }, 500);
  }
  if (!existing) return json({ error: 'League not found.' }, 404);
  if ((existing as { user_id?: string }).user_id !== user.id) {
    return json({ error: 'Only the league director can set the schedule.' }, 403);
  }

  const prev = ((existing as { schedule?: LeagueSchedule | null }).schedule ?? null);

  if (body.clear) {
    const { data, error } = await supabase
      .from('leagues')
      .update({ schedule: null })
      .eq('id', id)
      .select('id')
      .maybeSingle();
    if (error) {
      console.error('[api/leagues/schedule:clear]', error);
      return json({ error: 'Could not clear the schedule.' }, 500);
    }
    if (!data) return json({ error: 'Only the league director can set the schedule.' }, 403);
    return json({ ok: true, cleared: true });
  }

  const startDate = (body.startDate ?? '').trim();
  const intervalDays = Number(body.intervalDays);
  const eventCount = Number(body.eventCount);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    return json({ error: 'Pick a first event date.' }, 400);
  }
  // Same bounds the app's stepper enforces (league_schedule_dialog.dart),
  // so a season created here can be edited there without surprise.
  if (!Number.isInteger(eventCount) || eventCount < 2 || eventCount > 52) {
    return json({ error: 'Between 2 and 52 events.' }, 400);
  }
  if (!Number.isInteger(intervalDays) || intervalDays < 1 || intervalDays > 30) {
    return json({ error: 'Between 1 and 30 days apart.' }, 400);
  }
  if (eventCount > MAX_SLOTS) {
    return json({ error: 'Too many events.' }, 400);
  }

  const schedule: LeagueSchedule = {
    startDate,
    intervalDays,
    eventCount,
    bindings: prev?.bindings ?? {},
    formats: prev?.formats ?? {},
  };

  const { data, error } = await supabase
    .from('leagues')
    .update({ schedule })
    .eq('id', id)
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('[api/leagues/schedule:write]', error);
    return json({ error: 'Could not save the schedule.' }, 500);
  }
  if (!data) return json({ error: 'Only the league director can set the schedule.' }, 403);

  // Tell the caller how many bindings survived, so a director who had
  // tournaments attached can see nothing was lost.
  return json({
    ok: true,
    eventCount,
    bindingsKept: Object.keys(schedule.bindings ?? {}).length,
  });
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
