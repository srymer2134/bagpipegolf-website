// ============================================================
// Reading rounds from the SPINE, because the website was reading
// a column that stopped being written seven weeks ago
// ============================================================
//
// Item 2.6 of Patrick's 2026-10-04 audit. The website's three round
// surfaces — Home recent, /app/history, /app/round/[id] — all read
// `public.rounds` directly through Supabase. Verified against dev on
// 2026-10-04, that store is dead:
//
//   public.rounds        149 rows, last created 2026-09-10,
//                        last row WITH hole_scores 2026-08-16
//   bagpipe.rounds       354 rows, last created 2026-10-03
//   bagpipe.hole_scores  21,756 rows, last created 2026-10-04
//
// So what a user actually sees on the website today, of 258 scored
// spine rounds:
//
//   149  invisible — no `legacy_round_id`, so no `public.rounds` row
//                    to list or open at all
//     5  listed, but the detail page redirects to ?missing=
//     9  listed, and the scorecard renders BLANK
//
// 163 of 258 (63%), across 17 of 38 users with scored rounds. The
// audit scoped 2.6 as "the detail page reads a dead column". It is
// three surfaces, and the dominant failure is not a blank scorecard
// but a round that never appears.
//
// ── Spine-first, legacy fallback, and why not spine-only ──
//
// Of 97 legacy rounds that DO have scores, 95 have a spine twin. Two
// do not. A spine-only read would therefore fix 163 rounds and break
// 2 — so every read here tries the spine and falls back to
// `public.rounds` on a 404. Nothing that renders today stops
// rendering.
//
// ── The trap in the projection ──
//
// `bagpipe_get_round` returns EVERY `round_players` row, and some
// rounds carry guest twins: the 2026-09-19 Inverness round has seven
// player rows for four humans, with duplicate `guest_name` entries
// all sitting at `order_index: 0` alongside the real profile-linked
// ones. Taking `players[0]` is exactly the bug that shipped to the
// app (api #123 / flutter #1274 — the Round Detail "wrong player").
//
// `pickViewerPlayer` below therefore matches on `profile_id` and
// NEVER falls back to an index when it has a viewer to match. The
// Railway route also applies `callerFirstPlayers`, but relying on
// that would mean relying on the server having reordered — the
// website matches by identity so the twin ordering cannot matter.

import type { APIContext } from 'astro';

import { callRailway, RailwayApiError } from './railway';
import {
  getRound as legacyGetRound,
  listRounds as legacyListRounds,
  type RoundRow,
} from './queries';

/// One hole as the spine projection carries it.
export type SpineHole = {
  hole_number: number;
  strokes?: number | null;
  putts?: number | null;
  fir?: boolean | null;
  gir?: boolean | null;
};

/// One `bagpipe.round_players` row plus its holes. `profile_id` is
/// absent on a guest row; `guest_name` is absent on a real one.
export type SpinePlayer = {
  round_player_id: string;
  profile_id?: string | null;
  guest_name?: string | null;
  order_index?: number | null;
  tee?: string | null;
  playing_handicap?: number | null;
  is_team_card?: boolean | null;
  holes?: SpineHole[] | null;
};

export type SpineRoundHead = {
  round_id: string;
  status?: string | null;
  played_on?: string | null;
  course_name?: string | null;
  hole_count?: number | null;
  hole_pars?: number[] | null;
  hole_stroke_index?: number[] | null;
  course_rating?: number | null;
  slope_rating?: number | null;
  tee?: string | null;
  scoring_mode?: string | null;
  created_by?: string | null;
};

export type SpineRoundProjection = {
  round: SpineRoundHead;
  players?: SpinePlayer[] | null;
  games?: unknown[] | null;
};

/// One row of `GET /api/spine/rounds`.
export type SpineRoundListItem = {
  round_id: string;
  played_on?: string | null;
  status?: string | null;
  course_name?: string | null;
  hole_count?: number | null;
  gross?: number | null;
  thru?: number | null;
  event_id?: string | null;
  round_player_id?: string | null;
};

// ───── Pure helpers (the tested part) ─────

/// The viewer's own player row out of a projection.
///
/// Matches on `profile_id`. When [viewerProfileId] is given and no row
/// matches it, this returns `null` rather than guessing — a round the
/// viewer did not play has no "their" scorecard, and showing someone
/// else's card is worse than showing none. Only when no viewer id is
/// available at all does it fall back to the lowest `order_index`,
/// preferring a profile-linked row over a guest twin.
export function pickViewerPlayer(
  players: SpinePlayer[] | null | undefined,
  viewerProfileId: string | null | undefined,
): SpinePlayer | null {
  const rows = (players ?? []).filter((p) => p && !p.is_team_card);
  if (rows.length === 0) return null;

  if (viewerProfileId) {
    const mine = rows.filter((p) => p.profile_id === viewerProfileId);
    if (mine.length === 0) return null;
    // A viewer can legitimately hold more than one row (a twin of
    // their own). Prefer the one with the most holes scored — the
    // twin is the empty one.
    return mine.reduce((best, p) =>
      scoredHoleCount(p) > scoredHoleCount(best) ? p : best,
    );
  }

  // No viewer to match. Prefer a real profile row over a guest twin,
  // then the lowest order_index, then the fullest card.
  const linked = rows.filter((p) => p.profile_id != null);
  const pool = linked.length > 0 ? linked : rows;
  return pool.reduce((best, p) => {
    const a = p.order_index ?? Number.MAX_SAFE_INTEGER;
    const b = best.order_index ?? Number.MAX_SAFE_INTEGER;
    if (a !== b) return a < b ? p : best;
    return scoredHoleCount(p) > scoredHoleCount(best) ? p : best;
  });
}

/// How many holes of a spine player row carry a stroke.
export function scoredHoleCount(player: SpinePlayer | null | undefined): number {
  let n = 0;
  for (const h of player?.holes ?? []) {
    if (typeof h?.strokes === 'number' && h.strokes > 0) n += 1;
  }
  return n;
}

/// Spine holes -> the dense, 1-indexed-by-position array the
/// `ScoreGrid` component already renders.
///
/// Unscored holes are 0, matching `holeScoresAsArray`'s contract, so
/// the grid's existing empty-cell handling keeps working. Hole numbers
/// outside the round's length are dropped rather than stretching the
/// array — a 9-hole round with a stray hole 12 row must not render as
/// 12 holes.
export function holesToScoreArray(
  holes: SpineHole[] | null | undefined,
  totalHoles: number,
): number[] {
  const out = Array(Math.max(0, totalHoles)).fill(0);
  for (const h of holes ?? []) {
    const idx = Number(h?.hole_number) - 1;
    if (!Number.isInteger(idx) || idx < 0 || idx >= out.length) continue;
    if (typeof h.strokes === 'number' && h.strokes > 0) out[idx] = h.strokes;
  }
  return out;
}

/// Sum a player's strokes. Returns null when nothing is scored, so a
/// fresh round shows "—" rather than a 0 that reads like a real score.
export function spineGross(player: SpinePlayer | null | undefined): number | null {
  let total = 0;
  let any = false;
  for (const h of player?.holes ?? []) {
    if (typeof h?.strokes === 'number' && h.strokes > 0) {
      total += h.strokes;
      any = true;
    }
  }
  return any ? total : null;
}

/// Adapt a spine projection to the `RoundRow` the existing pages and
/// `ScoreGrid` already consume, so this swap does not fan out into a
/// rewrite of every round surface.
///
/// Deliberately lossy: `RoundRow` has no concept of multiple players,
/// and these surfaces are single-card views. The multi-player card is
/// its own slice, not something to smuggle in behind a read swap.
export function spineRoundToRoundRow(
  projection: SpineRoundProjection,
  viewerProfileId: string | null | undefined,
): RoundRow {
  const r = projection.round;
  const me = pickViewerPlayer(projection.players, viewerProfileId);
  const totalHoles = r.hole_count ?? r.hole_pars?.length ?? 18;
  const pars = r.hole_pars ?? null;
  const scores = holesToScoreArray(me?.holes, totalHoles);
  const gross = spineGross(me);

  let putts: number | null = null;
  let fir = 0;
  let gir = 0;
  let sawPutts = false;
  for (const h of me?.holes ?? []) {
    if (typeof h?.putts === 'number') {
      putts = (putts ?? 0) + h.putts;
      sawPutts = true;
    }
    if (h?.fir === true) fir += 1;
    if (h?.gir === true) gir += 1;
  }
  if (!sawPutts) putts = null;

  return {
    id: r.round_id,
    user_id: r.created_by ?? '',
    course_id: null,
    course_name: r.course_name ?? null,
    tee_color: me?.tee ?? r.tee ?? null,
    date_played: r.played_on ?? null,
    total_score: gross,
    total_putts: putts,
    fairways_hit: fir,
    greens_in_reg: gir,
    weather_data: null,
    ai_summary: null,
    completed: r.status === 'completed',
    created_at: r.played_on ?? null,
    course_lat: null,
    course_lng: null,
    course_rating: r.course_rating ?? null,
    slope_rating: r.slope_rating ?? null,
    par_total: pars ? pars.reduce((s, p) => s + (Number(p) || 0), 0) : null,
    score_differential: null,
    hole_scores: scores,
    hole_pars: pars,
  };
}

/// A dedupe key for "the same round, seen through two stores".
///
/// `bagpipe_list_rounds` does NOT return `legacy_round_id`, so there is
/// no exact key available to the website. Measured against dev on
/// 2026-10-04, across all 25 users who have a scored legacy round:
///
///   301 spine list rows, 44 with no course name
///     4 legacy rounds would show as a DUPLICATE
///     0 legacy rounds would be WRONGLY HIDDEN
///
/// Those four are backfilled twins whose spine `played_on` is the
/// backfill date (2026-09-06) rather than the date played, so no
/// date-based key can match them. Relaxing the key to tolerate a
/// missing spine course name was measured too: still 4, and it opens
/// the door to hiding. So the strict key stays.
///
/// The asymmetry is the point. A false negative shows one round twice
/// — visible, cosmetic, and obviously wrong to the user. A false
/// positive HIDES a round, which reads as lost data. The key is chosen
/// so the failure can only be the former, and the test suite pins that
/// direction.
///
/// The exact fix is one field: `legacy_round_id` in the list RPC. It
/// deletes this function. Filed for Patrick (§62).
function sameRoundKey(row: Pick<RoundRow, 'date_played' | 'course_name'>): string | null {
  const date = row.date_played;
  const course = (row.course_name ?? '').trim().toLowerCase();
  if (!date || course === '') return null;
  return date + '|' + course;
}

/// Merge the spine list with the legacy list for the history surface.
///
/// Spine rows win. A legacy row is kept only when the spine has no
/// round for it — which is how Sam's two legacy-only rounds (Lake
/// Merced 2026-05-05 and Ballyneal 2026-08-01, both real completed
/// 18-hole cards) survive the read swap. They are the entire reason
/// this is a merge rather than a replacement.
///
/// Coverage is decided by, in order: the spine round's own id, any
/// `legacy_round_id` the caller could supply, then `sameRoundKey`.
export function mergeRoundLists(
  spineRows: RoundRow[],
  legacyRows: RoundRow[],
  spineLegacyIds: Iterable<string> = [],
): RoundRow[] {
  const coveredIds = new Set<string>(spineRows.map((r) => r.id));
  for (const id of spineLegacyIds) coveredIds.add(id);

  const coveredKeys = new Set<string>();
  for (const r of spineRows) {
    const k = sameRoundKey(r);
    if (k !== null) coveredKeys.add(k);
  }

  const merged = [...spineRows];
  for (const row of legacyRows) {
    if (coveredIds.has(row.id)) continue;
    const k = sameRoundKey(row);
    if (k !== null && coveredKeys.has(k)) continue;
    merged.push(row);
  }
  return merged.sort((a, b) => {
    const ad = a.date_played ?? a.created_at ?? '';
    const bd = b.date_played ?? b.created_at ?? '';
    if (ad !== bd) return ad < bd ? 1 : -1;
    return 0;
  });
}

/// A list row -> `RoundRow`, for the history/home surfaces. The list
/// RPC carries no per-hole data, so `hole_scores` stays null and the
/// card shows the gross it was given.
export function spineListItemToRoundRow(item: SpineRoundListItem): RoundRow {
  return {
    id: item.round_id,
    user_id: '',
    course_id: null,
    course_name: item.course_name ?? null,
    tee_color: null,
    date_played: item.played_on ?? null,
    total_score: item.gross ?? null,
    total_putts: null,
    fairways_hit: null,
    greens_in_reg: null,
    weather_data: null,
    ai_summary: null,
    completed: item.status === 'completed',
    created_at: item.played_on ?? null,
    course_lat: null,
    course_lng: null,
    course_rating: null,
    slope_rating: null,
    par_total: null,
    score_differential: null,
    hole_scores: null,
    hole_pars: null,
  };
}

// ───── Network reads ─────

/// `GET /api/spine/rounds` for the signed-in user. Returns `[]` rather
/// than throwing when the spine is unreachable, so a dead backend
/// degrades to the legacy list instead of a 500 page.
export async function listSpineRounds(
  ctx: Pick<APIContext, 'locals'>,
  opts: { limit?: number } = {},
): Promise<SpineRoundListItem[]> {
  try {
    const res = await callRailway<{ rounds?: SpineRoundListItem[] }>(
      ctx as APIContext,
      { method: 'GET', path: '/api/spine/rounds', query: { limit: opts.limit ?? 100 } },
    );
    return res?.rounds ?? [];
  } catch (err) {
    if (err instanceof RailwayApiError && err.status === 401) return [];
    console.error('[spineRounds] list failed, falling back to legacy', err);
    return [];
  }
}

/// `GET /api/spine/legacy/rounds/:id`.
///
/// That route resolves BOTH id shapes — a `public.rounds` id via
/// `bagpipe_get_round_by_legacy_id`, and a spine-native id via a
/// `bagpipe_get_round` fallback — so one call serves a link from the
/// legacy list and a link from the spine list alike. `null` on 404,
/// which is the caller's signal to try `public.rounds`.
export async function getSpineRound(
  ctx: Pick<APIContext, 'locals'>,
  id: string,
): Promise<SpineRoundProjection | null> {
  try {
    const res = await callRailway<SpineRoundProjection>(ctx as APIContext, {
      method: 'GET',
      path: `/api/spine/legacy/rounds/${encodeURIComponent(id)}`,
    });
    return res?.round ? res : null;
  } catch (err) {
    if (err instanceof RailwayApiError && (err.status === 404 || err.status === 401)) {
      return null;
    }
    console.error('[spineRounds] detail failed, falling back to legacy', err);
    return null;
  }
}

// ───── The two functions the pages actually call ─────

/// Every round to show the signed-in user, spine first.
///
/// Reads the spine list and the legacy table, then merges. The legacy
/// read is NOT a fallback-only path: it runs every time, because the
/// two legacy-only rounds have to appear alongside the spine's. A
/// failure on either side degrades to the other rather than erroring
/// the page.
export async function loadRoundsForDisplay(
  ctx: Pick<APIContext, 'locals'>,
  supabase: Parameters<typeof legacyListRounds>[0],
  opts: { limit?: number } = {},
): Promise<{ rows: RoundRow[]; spineUsed: boolean; legacyError: string | null }> {
  const [spineItems, legacy] = await Promise.all([
    listSpineRounds(ctx, { limit: opts.limit ?? 100 }),
    legacyListRounds(supabase, { limit: opts.limit ?? 100 })
      .then((rows) => ({ rows, error: null as string | null }))
      .catch((err: unknown) => ({
        rows: [] as RoundRow[],
        error: err instanceof Error ? err.message : 'Could not load rounds.',
      })),
  ]);

  const spineRows = spineItems.map(spineListItemToRoundRow);
  const rows = mergeRoundLists(spineRows, legacy.rows);
  return {
    rows: opts.limit ? rows.slice(0, opts.limit) : rows,
    spineUsed: spineRows.length > 0,
    // Only surface a legacy error when the spine gave us nothing
    // either — otherwise the page has rounds to show and an error
    // banner would be noise.
    legacyError: spineRows.length === 0 ? legacy.error : null,
  };
}

/// One round for the detail page, spine first, legacy on a 404.
///
/// [id] may be either a `public.rounds` id (an old link or a legacy
/// list row) or a `bagpipe.rounds` id (a spine list row). The Railway
/// route resolves both, so this does not need to know which it has.
export async function loadRoundForDisplay(
  ctx: Pick<APIContext, 'locals'>,
  supabase: Parameters<typeof legacyGetRound>[0],
  id: string,
  viewerProfileId: string | null | undefined,
): Promise<{ round: RoundRow | null; source: 'spine' | 'legacy' | null }> {
  const projection = await getSpineRound(ctx, id);
  if (projection) {
    return { round: spineRoundToRoundRow(projection, viewerProfileId), source: 'spine' };
  }
  const legacy = await legacyGetRound(supabase, id);
  return { round: legacy, source: legacy ? 'legacy' : null };
}
