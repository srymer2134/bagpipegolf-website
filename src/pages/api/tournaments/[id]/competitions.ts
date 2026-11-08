import type { APIRoute } from 'astro';
import { callRailway, RailwayApiError } from '../../../../lib/railway';
import { createSupabaseClient } from '../../../../lib/supabase';
import { getPublicTournament } from '../../../../lib/tournamentQueries';
import { mergeCtpWinners, resolveCtpHoles } from '../../../../lib/ctpHoles';
import { ScoreLossError, withFreshRounds } from '../../../../lib/tournamentWrite';
import { acceptWinnerValue } from '../../../../lib/competitionWinner';
import { syncRoundDecisions, type SpineCall } from '../../../../lib/spineCompetitions';
import type { TournamentRound, TournamentRow } from '../../../../lib/tournamentQueries';

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
  } & Record<string, unknown>;
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
    if (fresh.user_id !== locals.user.id) {
      // The competitions page is owner-gated, so the route is too.
      // Railway alone would accept any roster member's PATCH.
      return json({ error: 'Only the tournament host can record winners.' }, 403);
    }

    const round = (fresh.rounds ?? []).find((r) => r.id === roundId);
    if (!round) {
      return json({ error: 'That round is no longer on this tournament.' }, 404);
    }

    // Only players actually on the roster can win anything. A stale
    // tab could otherwise name someone who has since been removed.
    const rosterIds = new Set((fresh.players ?? []).map((p) => p.id));

    // CTP winners MERGE onto the stored map; they do not replace it.
    // The editor only renders pickers for holes this round currently
    // tracks, so replacing would silently delete a winner recorded on
    // a hole that is no longer tracked — and delete every winner when
    // a client posts longest drive with no `closestToPin` key at all.
    //
    // The app never does that: `setClosestToPin` copies the existing
    // map and edits one hole, and the sync layer's
    // `_mergeClosestToPin` exists specifically so "if the server
    // dropped one hole's CTP entry on the round-trip, the
    // locally-correct entry survives." Dropping an entry is a failure
    // mode the app defends against; this writer must not reintroduce
    // it. Pure + unit-tested in `ctpHoles.test.ts`.
    const storedCtp = ((round as Record<string, unknown>).closest_to_pin_by_hole
      ?? (round as Record<string, unknown>).closestToPinByHole
      ?? {}) as Record<string, unknown>;
    const { winners: ctp, rejected } = mergeCtpWinners(
      storedCtp,
      (raw.closestToPin ?? {}) as Record<string, unknown>,
      {
        // Accepted only on holes the round actually tracks, per the
        // SAME resolver the app uses — otherwise a client could record
        // a winner where there is no prize and the leaderboard would
        // show it.
        tracked: new Set(resolveCtpHoles(fresh, round)),
        roster: rosterIds,
      },
    );
    if (rejected.length > 0) {
      return json({
        error: `Could not record: ${rejected.join(', ')}. Reload and try again.`,
      }, 400);
    }

    // Longest drive: a roster id, a clear, or the value already stored
    // re-submitted untouched (a legacy typed name the picker shows with
    // a "re-pick" hint — see `acceptWinnerValue`). A key the client did
    // not send at all leaves that winner alone.
    const roundRow = round as Record<string, unknown>;
    const ldValue = (
      key: 'longestDriveMaleId' | 'longestDriveFemaleId',
      storedKeys: [string, string],
    ): { ok: true; value: string | null } | { ok: false } => {
      const stored = roundRow[storedKeys[0]] ?? roundRow[storedKeys[1]];
      if (!(key in raw)) {
        return { ok: true, value: typeof stored === 'string' && stored.length > 0 ? stored : null };
      }
      return acceptWinnerValue(raw[key], stored, rosterIds);
    };
    const male = ldValue('longestDriveMaleId',
      ['longest_drive_male_id', 'longestDriveMaleId']);
    const female = ldValue('longestDriveFemaleId',
      ['longest_drive_female_id', 'longestDriveFemaleId']);
    if (!male.ok) {
      return json({ error: "The men's longest-drive winner is not on the roster." }, 400);
    }
    if (!female.ok) {
      return json({ error: "The women's longest-drive winner is not on the roster." }, 400);
    }
    const ldMale = male.value;
    const ldFemale = female.value;

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

    // Spine dual-write, after the legacy write has landed — the same
    // reconcile the app runs from `setClosestToPin` / LD setters. Only
    // a bridged round (`spine_round_id`) is touched; failure is logged
    // and never fails the save.
    const written = rounds.find((r) => r.id === roundId) as unknown as TournamentRound;
    const call: SpineCall = (init) => callRailway(ctx, init);
    const spine = await syncRoundDecisions(
      call,
      { ...fresh, rounds: rounds as unknown as TournamentRound[] } as TournamentRow,
      written,
    );
    if (spine.outcome === 'failed' || spine.unresolved.length > 0) {
      console.warn('[api/tournaments/competitions] spine', {
        tournament: id, round: roundId, outcome: spine.outcome,
        error: spine.error, unresolved: spine.unresolved,
      });
    }
    return json({
      ok: true,
      roundId,
      ctpRecorded: Object.keys(ctp).length,
      spine: spine.outcome,
    }, 200);
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
