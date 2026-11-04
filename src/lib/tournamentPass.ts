// The tournament pass ($240, one time) on the website.
//
// Sam, 2026-10-25: a STANDALONE tournament is free up to 36 players; a field
// of 37 or more needs one pass. Postgres enforces it (`tournaments_field_gate`,
// flutter 20261114), and the API sells it (POST /api/billing/tournament-checkout).
// Until 2026-11-04 nothing on the website or in the app called that route,
// so a director who hit the limit was sent to /app/billing and found nothing
// to buy there.
//
// A league event is never sold a pass: the league's plan covers it, and the
// API refuses with `league_tournament`.
//
// Pure functions only, for the same reason as lib/billing.ts — a server-
// rendered .astro cannot be unit-tested.

/** `field` in GET /api/billing/entitlements?tournament_id= for a standalone tournament. */
export type TournamentField = {
  enforced: boolean;
  /** True only when a pass exists (a paid one, or a comp). */
  entitled: boolean;
  field_size: number;
  free_max: number;
  pass: { source: string; created_at: string; livemode: boolean | null } | null;
};

export type TournamentEntitlement = {
  billing_available: boolean;
  /** Present and true only for a tournament outside any league. */
  standalone?: boolean;
  field?: TournamentField | null;
};

export type PassState = 'league' | 'covered' | 'needed' | 'optional' | 'unknown';

export const TOURNAMENT_PASS_PRICE_COPY = '$240';

/** A tournament id as the routes accept it: non-empty, at most 128 chars. */
export function parseTournamentId(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s.length > 0 && s.length <= 128 ? s : null;
}

/**
 * What the page should say about one tournament's pass.
 *
 * `needed` once the field has reached the free limit — the next player is
 * refused — and `optional` below it, so a director expecting a big field can
 * buy ahead of the sign-ups instead of finding out at player 37.
 */
export function passState(e: TournamentEntitlement | null | undefined): PassState {
  if (!e) return 'unknown';
  if (e.standalone !== true) return 'league';
  const f = e.field;
  if (!f) return 'unknown';
  if (f.entitled) return 'covered';
  return f.field_size >= f.free_max ? 'needed' : 'optional';
}

/** One sentence under the tournament's name. */
export function passDetail(state: PassState, f: TournamentField | null | undefined): string {
  const max = f && Number.isInteger(f.free_max) ? f.free_max : 36;
  const size = f && Number.isInteger(f.field_size) ? f.field_size : 0;
  switch (state) {
    case 'covered':
      return 'Pass active — no limit on the field.';
    case 'needed':
      return `${size} players — the free limit is ${max}. A pass lets more join.`;
    case 'optional':
      return `${size} of ${max} free spots used. Buy a pass now if your field will grow past ${max}.`;
    case 'league':
      return "Part of a league — the league's plan covers it.";
    default:
      return 'We couldn’t check this tournament’s pass just now.';
  }
}

/** Offer the Buy button? Only for a standalone tournament with no pass. */
export function offersPass(state: PassState): boolean {
  return state === 'needed' || state === 'optional';
}
