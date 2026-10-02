import type { APIRoute } from 'astro';
import { callRailway, RailwayApiError } from '../../../../lib/railway';
import { createSupabaseClient } from '../../../../lib/supabase';
import { getPublicTournament } from '../../../../lib/tournamentQueries';
import { resolveCtpHoles } from '../../../../lib/ctpHoles';
import { ScoreLossError, withFreshRounds } from '../../../../lib/tournamentWrite';

// POST /api/tournaments/[id]/competitions
//
// Record the tournament-wide competition winners for ONE round:
// closest-to-pin per hole, and longest drive per gender bracket.
// W4b of the parity plan — Sam required these editable "on the
// website as well as the app".
//
// These are the competitions a human MUST enter. Skins are computed
// from scores (`skinsPool.ts` already does it); nobody can derive who
// hit it closest from a scorecard. Until now that could only be done
// in the app, which meant a director at a clubhouse desk had to pick
// up a phone.
//
// WRITE SAFETY — same contract as the pairings route, same reason.
// Railway's PATCH writes `rounds` wholesale with no server-side merge
// (Layer 3 of DATA_DROP_PREVENTION was never built). So the browser
// never sends `rounds`: it sends one round's winners, and this
// handler re-reads fresh, rebuilds via `withFreshRounds`, runs the
// score-loss guard, then PATCHes. See `lib/tournamentWrite.ts`.

const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;

export const POST: APIRoute = async (ctx) => {
  const id = ctx.params.id;
  if (typeof id !== 'string' || id.length === 0) {
    return json({ error: 'Missing tournament id.' }, 400);
  }

  const locals = ctx.locals as App.Locals;
  if (!locals.user?.id) {
    return json({ error: 'Sign in to record competition winners.' }, 401);
  }

  let raw: {
    roundId?: unknown;
    closestToPin?: unknown;
    longestDriveMaleId?: unknown;
    longestDriveFemaleId?: unknown;
  };
  try {
    raw = (await ctx.request.json()) as typeof raw;
  } catch {
    return json({ error: 'Request body must be valid JSON.' }, 400);
  }

  const roundId = str(raw?.roundId);
  if (!roundId) return json({ error: 'Which round? `roundId` is required.' }, 400);

  try {
    const supabase = createSupabaseClient({
      request: ctx.request,
      cookies: ctx.cookies,
      locals,
    });
    const fresh = await getPublicTournament(supabase, id);
    if (!fresh) return json({ error: 'Tournament not found.' }, 404);

    const round = (fresh.rounds ?? []).find((r) => r.id === roundId);
    if (!round) {
      return json({ error: 'That round is no longer on this tournament.' }, 404);
    }

    // Only players actually on the roster can win anything. A stale
    // tab could otherwise name someone who has since been removed.
    const rosterIds = new Set((fresh.players ?? []).map((p) => p.id));

    // CTP is only accepted on holes this round actually tracks, per
    // the SAME resolver the app uses (ported + fixture-pinned in
    // `ctpHoles.ts`). Without this a client could record a winner on
    // a hole with no prize, and the leaderboard would show it.
    const tracked = new Set(resolveCtpHoles(fresh, round));
    const ctpIn = (raw.closestToPin ?? {}) as Record<string, unknown>;
    const ctp: Record<string, string> = {};
    const rejected: string[] = [];
    for (const [holeKey, pid] of Object.entries(ctpIn)) {
      const hole = Number(holeKey);
      const winner = str(pid);
      if (!Number.isFinite(hole)) continue;
      // An empty value is how the UI clears a hole — skip it so the
      // key is simply absent from the map.
      if (winner === null) continue;
      if (!tracked.has(hole)) { rejected.push(`hole ${hole} (no CTP)`); continue; }
      if (!rosterIds.has(winner)) { rejected.push(`hole ${hole} (not on roster)`); continue; }
      // Wire keys are strings — the app stringifies hole numbers and
      // parses them back (see `Tournament.toApiJson`).
      ctp[String(hole)] = winner;
    }
    if (rejected.length > 0) {
      return json({
        error: `Could not record: ${rejected.join(', ')}. Reload and try again.`,
      }, 400);
    }

    const ldMale = str(raw.longestDriveMaleId);
    const ldFemale = str(raw.longestDriveFemaleId);
    for (const [label, v] of [['male', ldMale], ['female', ldFemale]] as const) {
      if (v !== null && !rosterIds.has(v)) {
        return json({
          error: `The ${label} longest-drive winner is not on the roster.`,
        }, 400);
      }
    }

    const rounds = withFreshRounds(fresh, roundId, (r) => {
      const next: Record<string, unknown> = {
        ...r,
        // Emitted unconditionally: an empty map is meaningful and
        // means "no CTP winners recorded", matching the app's
        // `toApiJson`.
        closest_to_pin_by_hole: ctp,
      };
      // The app omits these keys when null rather than writing null,
      // so clearing a winner DELETES the key — keeping the round's
      // JSON byte-identical to what the app would have written.
      if (ldMale) next.longest_drive_male_id = ldMale;
      else {
        delete next.longest_drive_male_id;
        delete (next as Record<string, unknown>).longestDriveMaleId;
      }
      if (ldFemale) next.longest_drive_female_id = ldFemale;
      else {
        delete next.longest_drive_female_id;
        delete (next as Record<string, unknown>).longestDriveFemaleId;
      }
      // Drop the camelCase twin of the CTP map too, or a round
      // carrying both spellings would read back the stale one.
      delete (next as Record<string, unknown>).closestToPinByHole;
      return next as never;
    });

    await callRailway<{ tournament: { id: string } }>(ctx, {
      method: 'PATCH',
      path: `/api/tournaments/${encodeURIComponent(id)}`,
      body: { rounds },
    });
    return json({ ok: true, roundId, ctpRecorded: Object.keys(ctp).length }, 200);
  } catch (err) {
    if (err instanceof ScoreLossError) {
      console.error('[api/tournaments/competitions] score-loss guard', {
        tournament: id, round: err.roundId, before: err.before, after: err.after,
      });
      return json({ error: err.message, guard: 'score_loss' }, 409);
    }
    if (err instanceof RailwayApiError) {
      return json({ error: err.message }, err.status);
    }
    console.error('[api/tournaments/competitions] unexpected', err);
    return json({ error: 'Could not save the winners.' }, 500);
  }
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
