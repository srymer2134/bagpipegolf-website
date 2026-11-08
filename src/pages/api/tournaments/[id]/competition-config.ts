import type { APIRoute } from 'astro';
import { callRailway, RailwayApiError } from '../../../../lib/railway';
import { createSupabaseClient } from '../../../../lib/supabase';
import {
  getPublicTournament,
  holeCountForRound,
  type TournamentRound,
  type TournamentRow,
} from '../../../../lib/tournamentQueries';
import {
  buildCompetitionPatch,
  fieldGenderOf,
  mergePools,
  nextRoundCompetitionFields,
  parseCompetitionConfig,
  readCompetitionConfig,
} from '../../../../lib/competitionConfig';
import { cleanHoleList, par5Holes } from '../../../../lib/fieldCompetitions';
import { ScoreLossError, withFreshRoundsAll } from '../../../../lib/tournamentWrite';
import {
  syncPools,
  syncRoundDecisions,
  type SpineCall,
  type SpineSyncResult,
} from '../../../../lib/spineCompetitions';

// POST /api/tournaments/[id]/competition-config
//
// CONFIGURE which field-wide competitions a tournament runs, their
// buy-ins, and which holes carry closest-to-pin on a given round.
// W4b config side — the counterpart to `competitions.ts`, which
// records WINNERS.
//
// Deliberately a separate route from winner-recording. They are
// different actions with different blast radii: a config change
// alters what prizes exist for the whole field, while recording a
// winner is one observation. Sharing one endpoint would mean a typo
// in a buy-in could block a director from entering a CTP.
//
// TWO WRITES, AND WHY BOTH
//
// 1. Tournament-level. A competition's existence is stored TWICE —
//    the v1 flags and the v2 `pools` array — and `fromJson` prefers
//    `pools` while `resolveCtpHolesFor` reads the v1 flag. Writing
//    one without the other leaves CTP pickers with no CTP pool, or a
//    pool with no way to record a winner. `buildCompetitionPatch`
//    emits both, rebuilt together, with Dart's deterministic ids.
//    See `lib/competitionConfig.ts`.
//
// 2. Round-level `ctp_holes` + `longest_drive_holes`, for every round
//    the director touched, plus the app's toggle rules (CTP off ->
//    explicit lists become `[]`; CTP back on -> `[]` resets to "all
//    par 3s"; LD on -> par 5s suggested). Goes through
//    `withFreshRoundsAll` + the score-loss guard like every other
//    rounds write here, because Railway writes that array wholesale.
//
// 3. Spine. Pools and each bridged round's decision-game config are
//    mirrored through the Railway spine routes, as the app does.

const ALLOWED_KEYS = [
  'skins_competitions',
  'track_ctp_on_par3s',
  'track_longest_drive',
  'longest_drive_genders',
  'pools',
];

type RoundInput = { roundId?: unknown; ctpHoles?: unknown; ldHoles?: unknown };

export const POST: APIRoute = async (ctx) => {
  const id = ctx.params.id;
  if (typeof id !== 'string' || id.length === 0) {
    return json({ error: 'Missing tournament id.' }, 400);
  }

  const locals = ctx.locals as App.Locals;
  if (!locals.user?.id) {
    return json({ error: 'Sign in to change competitions.' }, 401);
  }

  let raw: {
    config?: unknown;
    rounds?: unknown;
    // Single-round shape, kept for older tabs.
    roundId?: unknown;
    ctpHoles?: unknown;
  };
  try {
    raw = (await ctx.request.json()) as typeof raw;
  } catch {
    return json({ error: 'Request body must be valid JSON.' }, 400);
  }

  // Per-round hole picks, keyed by round id. `undefined` for a list the
  // director did not touch, so the round keeps (or derives) its own.
  const picks = new Map<string, { ctpHoles?: unknown; ldHoles?: unknown }>();
  if (Array.isArray(raw.rounds)) {
    for (const e of raw.rounds as RoundInput[]) {
      if (!e || typeof e !== 'object' || typeof e.roundId !== 'string') continue;
      picks.set(e.roundId, {
        ...(e.ctpHoles !== undefined ? { ctpHoles: e.ctpHoles } : {}),
        ...(e.ldHoles !== undefined ? { ldHoles: e.ldHoles } : {}),
      });
    }
  }
  if (typeof raw.roundId === 'string' && raw.ctpHoles !== undefined) {
    picks.set(raw.roundId.trim(), {
      ...(picks.get(raw.roundId.trim()) ?? {}),
      ctpHoles: raw.ctpHoles,
    });
  }

  try {
    const supabase = createSupabaseClient({
      request: ctx.request,
      cookies: ctx.cookies,
      locals,
    });
    const fresh = await getPublicTournament(supabase, id);
    if (!fresh) return json({ error: 'Tournament not found.' }, 404);
    if (fresh.user_id !== locals.user.id) {
      // Configuring prizes is a director action, and the page is
      // owner-gated. Railway alone would accept any roster member.
      return json({ error: 'Only the tournament host can change competitions.' }, 403);
    }

    for (const rid of picks.keys()) {
      if (!(fresh.rounds ?? []).some((r) => r.id === rid)) {
        return json({ error: 'That round is no longer on this tournament.' }, 404);
      }
    }

    const field = fieldGenderOf(fresh);
    const prev = readCompetitionConfig(fresh);
    const next = raw.config !== undefined ? parseCompetitionConfig(raw.config) : prev;
    const body: Record<string, unknown> = {};

    // ── Tournament-level: BOTH representations, pools MERGED ─────
    let removedPools: Record<string, unknown>[] = [];
    if (raw.config !== undefined) {
      const patch = buildCompetitionPatch(next, field);
      // Belt and braces: only competition keys leave this route.
      for (const k of ALLOWED_KEYS) body[k] = patch[k];
      // Never `buildPools` straight onto the column: that deleted every
      // greenies / deuces / stableford / quota pool, and re-minted the
      // ids of pools the app created. See `mergePools`.
      const merged = mergePools((fresh as Record<string, unknown>).pools, next, field);
      body.pools = merged.pools;
      removedPools = merged.removed;
    }

    // ── Round-level: CTP holes + LD holes, every round at once ───
    // Through `withFreshRoundsAll` + the score-loss guard, because
    // Railway writes `rounds` wholesale with no server-side merge.
    const nextRounds = withFreshRoundsAll(fresh, (r) => {
      const round = r as unknown as TournamentRound;
      const maxHole = holeCountForRound(fresh, round) || 18;
      const pick = picks.get(String(r.id));
      return nextRoundCompetitionFields(r, {
        prev,
        next,
        par5s: par5Holes(fresh, round),
        submitted: pick === undefined ? undefined : {
          ...(pick.ctpHoles !== undefined
            ? { ctpHoles: cleanHoleList(pick.ctpHoles, maxHole) } : {}),
          ...(pick.ldHoles !== undefined
            ? { ldHoles: cleanHoleList(pick.ldHoles, maxHole) } : {}),
        },
      });
    });
    const roundsChanged = JSON.stringify(nextRounds) !== JSON.stringify(fresh.rounds ?? []);
    if (roundsChanged) body.rounds = nextRounds;

    if (Object.keys(body).length === 0) {
      return json({ ok: true, changed: [] }, 200);
    }

    await callRailway<{ tournament: { id: string } }>(ctx, {
      method: 'PATCH',
      path: `/api/tournaments/${encodeURIComponent(id)}`,
      body,
    });

    // ── Spine dual-write (after the legacy write landed) ─────────
    // Pools on the bridged event, and every bridged round's decision-game
    // config (its CTP holes, LD holes and LD option ride on that game).
    // Mirrors the app's `competitionConfigSignature` re-sync. Never fatal.
    const call: SpineCall = (init) => callRailway(ctx, init);
    const after = {
      ...fresh,
      ...body,
      rounds: (body.rounds ?? fresh.rounds ?? []) as TournamentRound[],
    } as TournamentRow;
    const spine: SpineSyncResult[] = [];
    if (raw.config !== undefined) {
      spine.push(await syncPools(call, after,
        (body.pools as Record<string, unknown>[]) ?? [], removedPools));
    }
    for (const round of after.rounds ?? []) {
      spine.push(await syncRoundDecisions(call, after, round));
    }
    const failed = spine.filter((s) => s.outcome === 'failed');
    if (failed.length > 0) {
      console.warn('[api/tournaments/competition-config] spine', {
        tournament: id, failed: failed.map((f) => f.error),
      });
    }
    return json({
      ok: true,
      changed: Object.keys(body),
      spine: failed.length > 0 ? 'failed'
        : spine.some((s) => s.outcome === 'synced') ? 'synced' : 'skipped',
    }, 200);
  } catch (err) {
    if (err instanceof ScoreLossError) {
      console.error('[api/tournaments/competition-config] score-loss guard', {
        tournament: id, round: err.roundId, before: err.before, after: err.after,
      });
      return json({ error: err.message, guard: 'score_loss' }, 409);
    }
    if (err instanceof RailwayApiError) {
      return json({ error: err.message }, err.status);
    }
    console.error('[api/tournaments/competition-config] unexpected', err);
    return json({ error: 'Could not save the competition setup.' }, 500);
  }
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
