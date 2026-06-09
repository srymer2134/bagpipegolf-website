// Supabase reads for the /app/* surfaces. Every query uses the
// per-request server client (cookie-bound to the signed-in user),
// so RLS automatically scopes to that user — owner-only on rounds,
// owner-or-participant on bets.

import type { SupabaseClient } from '@supabase/supabase-js';

export type RoundRow = {
  id: string;
  user_id: string;
  course_id: string | null;
  course_name: string | null;
  tee_color: string | null;
  date_played: string | null;
  total_score: number | null;
  total_putts: number | null;
  fairways_hit: number | null;
  greens_in_reg: number | null;
  weather_data: Record<string, unknown> | null;
  ai_summary: string | null;
  completed: boolean | null;
  created_at: string | null;
  course_lat: number | null;
  course_lng: number | null;
  course_rating: number | null;
  slope_rating: number | null;
  par_total: number | null;
  score_differential: number | null;
  hole_scores: number[] | Record<string, number> | null;
  hole_pars: number[] | null;
};

export type BetPlayer = {
  id?: string;
  name?: string;
  handicapIndex?: number;
  [k: string]: unknown;
};

export type BetRow = {
  id: string;
  user_id: string;
  created_at: string | null;
  completed_at: string | null;
  course_id: string | null;
  course_name: string | null;
  game_types: string[] | null;
  players: BetPlayer[] | null;
  unit_value: number | null;
  total_holes: number | null;
  pars: number[] | null;
  scores: Record<string, number[]> | null;
  current_hole: number | null;
  completed: boolean | null;
  linked_round_id: string | null;
  linked_group_id: string | null;
  round_confirmed: boolean | null;
  press_config: string | null;
};

const ROUND_LIST_COLS =
  'id, course_name, tee_color, date_played, total_score, par_total, ' +
  'total_putts, fairways_hit, greens_in_reg, course_rating, slope_rating, ' +
  'score_differential, completed, created_at';

const ROUND_DETAIL_COLS = '*';

const BET_LIST_COLS =
  'id, course_name, created_at, completed_at, completed, game_types, players, ' +
  'unit_value, total_holes, current_hole, linked_round_id';

const BET_DETAIL_COLS = '*';

export async function listRounds(
  supabase: SupabaseClient,
  opts: { limit?: number; completedOnly?: boolean } = {},
): Promise<RoundRow[]> {
  let q = supabase
    .from('rounds')
    .select(ROUND_LIST_COLS)
    .order('date_played', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });
  if (opts.completedOnly) q = q.eq('completed', true);
  if (opts.limit) q = q.limit(opts.limit);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as RoundRow[];
}

export async function getRound(
  supabase: SupabaseClient,
  id: string,
): Promise<RoundRow | null> {
  const { data, error } = await supabase
    .from('rounds')
    .select(ROUND_DETAIL_COLS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as RoundRow | null;
}

export async function listBets(
  supabase: SupabaseClient,
  opts: { limit?: number; activeOnly?: boolean } = {},
): Promise<BetRow[]> {
  let q = supabase
    .from('bets')
    .select(BET_LIST_COLS)
    .order('created_at', { ascending: false });
  if (opts.activeOnly) q = q.eq('completed', false);
  if (opts.limit) q = q.limit(opts.limit);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as BetRow[];
}

export async function getBet(
  supabase: SupabaseClient,
  id: string,
): Promise<BetRow | null> {
  const { data, error } = await supabase
    .from('bets')
    .select(BET_DETAIL_COLS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as BetRow | null;
}

// ───── Display helpers ─────

export function holeScoresAsArray(
  raw: RoundRow['hole_scores'],
  totalHoles = 18,
): number[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') {
    const arr = Array(totalHoles).fill(0);
    for (const [k, v] of Object.entries(raw)) {
      const idx = Number(k) - 1;
      if (idx >= 0 && idx < totalHoles && typeof v === 'number') arr[idx] = v;
    }
    return arr;
  }
  return Array(totalHoles).fill(0);
}

export function formatVsPar(score: number | null, par: number | null): string {
  if (score == null || par == null) return '—';
  const diff = score - par;
  if (diff === 0) return 'E';
  if (diff > 0) return `+${diff}`;
  return `${diff}`;
}

export function scoreNotation(score: number, par: number): {
  label: string;
  className: string;
} {
  if (!score || !par) return { label: '', className: '' };
  const diff = score - par;
  if (diff <= -2) return { label: 'eagle+', className: 'sc--eagle' };
  if (diff === -1) return { label: 'birdie', className: 'sc--birdie' };
  if (diff === 0) return { label: 'par', className: 'sc--par' };
  if (diff === 1) return { label: 'bogey', className: 'sc--bogey' };
  return { label: 'double+', className: 'sc--double' };
}
