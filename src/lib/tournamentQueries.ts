// Public-tournament reads for the web leaderboard page.
//
// Uses the site's shared anon-key Supabase client. RLS on
// `public.tournaments` grants `anon` a SELECT policy
// (`web_leaderboard_public_read_tournaments`, added
// 2026-07-27 in the Flutter repo migration), so any tournament
// id is fetchable — Sam's "fully public per tournament id"
// choice for Ballyneal Brigade kiosk viewing.
//
// Only reads. No writes. No auth required.

import type { SupabaseClient } from '@supabase/supabase-js';

export type TournamentPlayer = {
  id: string;
  name: string;
  handicapIndex?: number;
  userId?: string | null;
  isCurrentUser?: boolean;
  selectedTee?: string | null;
  [k: string]: unknown;
};

export type TournamentPlayerHoleScore = {
  playerId: string;
  holeScores: (number | null)[];
};

export type TournamentRoundTeam = {
  id: string;
  name: string;
  player_ids?: string[];
  playerIds?: string[];
};

export type TournamentTeeBox = {
  teeName: string;
  pars?: number[];
  parTotal?: number;
  slopeRating?: number;
  courseRating?: number;
  [k: string]: unknown;
};

export type TournamentRound = {
  id: string;
  name: string;
  format: string;
  player_hole_scores?: TournamentPlayerHoleScore[];
  playerHoleScores?: TournamentPlayerHoleScore[];
  team_hole_scores?: unknown[];
  teams?: TournamentRoundTeam[];
  tee_boxes?: TournamentTeeBox[];
  teeBoxes?: TournamentTeeBox[];
  [k: string]: unknown;
};

export type TournamentRow = {
  id: string;
  user_id: string;
  name: string;
  course_name: string | null;
  total_holes: number;
  par_total: number | null;
  created_at: string | null;
  updated_at: string | null;
  completed_at: string | null;
  players: TournamentPlayer[];
  rounds: TournamentRound[];
  tee_boxes: TournamentTeeBox[];
  scoring_mode?: string | null;
  use_net_scoring?: boolean | null;
};

const TOURNAMENT_COLS =
  'id, user_id, name, course_name, total_holes, par_total, ' +
  'created_at, updated_at, completed_at, players, rounds, ' +
  'tee_boxes, scoring_mode, use_net_scoring';

/// List tournaments owned by the currently-authenticated user.
/// The `tournaments` RLS "owner-only" policy on authenticated
/// users transparently filters to `user_id = auth.uid()`, so no
/// WHERE clause is needed — Supabase's anon-key SELECT (used for
/// the public leaderboard) is scoped separately and does NOT
/// apply here because the request carries an auth cookie.
///
/// Sort: newest first by created_at (matches the app's default).
export async function listMyTournaments(
  supabase: SupabaseClient,
  opts: { limit?: number } = {},
): Promise<TournamentRow[]> {
  let q = supabase
    .from('tournaments')
    .select(TOURNAMENT_COLS)
    .order('created_at', { ascending: false });
  if (opts.limit) q = q.limit(opts.limit);
  const { data, error } = await q;
  if (error) {
    console.error('[listMyTournaments]', error);
    return [];
  }
  return (data ?? []) as TournamentRow[];
}

/// True when the tournament has been marked completed by the app.
/// `completed_at` is null for in-progress + upcoming events.
export function isCompleted(t: TournamentRow): boolean {
  return t.completed_at != null;
}

/// True when the tournament has at least one round with a
/// recorded score. Used to distinguish "upcoming" (created but
/// no scores yet) from "active" (scoring underway).
export function hasAnyScores(t: TournamentRow): boolean {
  for (const round of t.rounds ?? []) {
    const rows = playerHoleScoresFor(round);
    for (const row of rows) {
      if ((row.holeScores ?? []).some((s) => s != null)) return true;
    }
  }
  return false;
}

/// Fetch a tournament by id. Returns null when not found or when
/// RLS refuses (should be always allowed post-migration, but the
/// safe fallback lets the page render a clean "Not found" state).
export async function getPublicTournament(
  supabase: SupabaseClient,
  id: string,
): Promise<TournamentRow | null> {
  const { data, error } = await supabase
    .from('tournaments')
    .select(TOURNAMENT_COLS)
    .eq('id', id)
    .maybeSingle();
  if (error) {
    console.error('[getPublicTournament]', error);
    return null;
  }
  return (data ?? null) as TournamentRow | null;
}

/// Prefer the round's per-round pars (multi-course events) over
/// the tournament-level tee-box default. Both are optional on
/// the row; returns an empty list when neither is present.
export function parsForRound(
  tournament: TournamentRow,
  round: TournamentRound,
): number[] {
  const roundTees = round.tee_boxes ?? round.teeBoxes ?? [];
  for (const tee of roundTees) {
    if (Array.isArray(tee.pars) && tee.pars.length > 0) return tee.pars;
  }
  for (const tee of tournament.tee_boxes ?? []) {
    if (Array.isArray(tee.pars) && tee.pars.length > 0) return tee.pars;
  }
  return [];
}

/// Normalise the JSONB `player_hole_scores` blob (snake or camel
/// case depending on which write path landed it) into a stable
/// shape the leaderboard aggregator can walk. Empty when the
/// round has no scores.
///
/// Normalisation runs on BOTH levels:
///   1. Round key: `player_hole_scores` (server / Flutter writes)
///      vs `playerHoleScores` (older Freezed-only writes).
///   2. Inner row keys: `{player_id, hole_scores}` vs
///      `{playerId, holeScores}`. Sam 2026-07-28: B5/Gg3/B2 all
///      persist as snake_case at the inner level (matches Flutter's
///      TournamentPlayerHoleScore.toJson via @JsonKey rename).
///      Before this normalisation, the aggregator read
///      `phs.playerId` and got undefined for every player, so
///      every row was skipped and the leaderboard showed
///      "No scores yet" for tournaments with real data.
export function playerHoleScoresFor(
  round: TournamentRound,
): TournamentPlayerHoleScore[] {
  const raw = round.player_hole_scores ?? round.playerHoleScores ?? [];
  return raw.map((row: any) => ({
    playerId:
      typeof row?.playerId === 'string'
        ? row.playerId
        : typeof row?.player_id === 'string'
          ? row.player_id
          : '',
    holeScores: Array.isArray(row?.holeScores)
      ? row.holeScores
      : Array.isArray(row?.hole_scores)
        ? row.hole_scores
        : [],
  }));
}
