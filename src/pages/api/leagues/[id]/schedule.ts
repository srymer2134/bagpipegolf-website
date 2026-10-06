import type { APIRoute } from 'astro';
import { createSupabaseClient } from '../../../../lib/supabase';
import type { LeagueSchedule } from '../../../../lib/leaguePortal';
import {
  seedFromDates, validateSeasonDates, weekRowsFor,
} from '../../../../lib/leagueSeasonDates';
import { namesToMap } from '../../../../lib/leagueEventNames';

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
    /** One `yyyy-MM-dd` per event, index = slot, '' where undecided.
     *  These become `league_weeks` rows — the authority for a date. */
    dates?: Array<string | null>;
    /** The commissioner's name per event, '' where unnamed. */
    names?: Array<string | null>;
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

  const eventCount = Number(body.eventCount);
  // Dates, not a cadence. `intervalDays` is no longer required or
  // asked for — it is inferred for the jsonb seed and is only a hint.
  // The dates themselves go to `league_weeks.week_of`, which that
  // table's own comment names as the authority for slot → date.
  const dates = body.dates ?? (body.startDate ? [body.startDate] : []);
  const first = typeof dates[0] === 'string' ? dates[0].trim() : '';

  if (!/^\d{4}-\d{2}-\d{2}$/.test(first)) {
    return json({ error: 'Pick a date for the first event.' }, 400);
  }
  // Same bounds the app's stepper enforces (league_schedule_dialog.dart),
  // so a season created here can be edited there without surprise.
  if (!Number.isInteger(eventCount) || eventCount < 2 || eventCount > 52) {
    return json({ error: 'Between 2 and 52 events.' }, 400);
  }
  if (eventCount > MAX_SLOTS) {
    return json({ error: 'Too many events.' }, 400);
  }
  const dateProblems = validateSeasonDates(dates);
  if (dateProblems.length) {
    return json({ error: dateProblems[0].message, problems: dateProblems }, 400);
  }

  const seed = seedFromDates(dates, eventCount);
  const schedule: LeagueSchedule = {
    startDate: seed?.startDate ?? first,
    intervalDays: seed?.intervalDays ?? (Number(body.intervalDays) || 7),
    eventCount,
    bindings: prev?.bindings ?? {},
    formats: prev?.formats ?? {},
    // Absent `names` in the body means "this client does not manage
    // names" — keep what is stored rather than wiping it.
    names: body.names ? namesToMap(body.names) : (prev?.names ?? {}),
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

  // The dates themselves. Upsert on (league_id, slot_index) so moving
  // one event is one changed row and the rest are untouched. A week
  // already bridged to a spine event is frozen by a DB trigger — that
  // is deliberate: you cannot retroactively move a round that was
  // played. We report it rather than pretending the save was clean.
  let weeksSaved = 0;
  let weeksError: string | null = null;
  const rows = weekRowsFor(id, dates);
  if (rows.length) {
    const { error: wErr } = await supabase
      .from('league_weeks')
      .upsert(rows, { onConflict: 'league_id,slot_index' });
    if (wErr) {
      console.error('[api/leagues/schedule:weeks]', wErr);
      weeksError = wErr.code === '23505'
        ? 'Two events would share a date. The rest of the schedule was saved.'
        : /immutable/i.test(wErr.message ?? '')
          ? 'An event that has already been played cannot be moved. '
            + 'The rest of the schedule was saved.'
          : 'The dates could not be saved.';
    } else {
      weeksSaved = rows.length;
    }
  }

  // Tell the caller how many bindings survived, so a director who had
  // tournaments attached can see nothing was lost.
  return json({
    ok: true,
    weeksSaved,
    weeksError,
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
