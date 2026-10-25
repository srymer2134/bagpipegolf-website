// The league plan gate, as the website sees it (billing Phase 1c).
//
// Plan: LEAGUE_SUBSCRIPTION_AND_PLAN_GATING_PLAN.md §3.3, §3.7, §3.9
// (flutter repo). The database refuses three kinds of write for a league
// with no plan: turning a season on, adding events, and attaching a new
// tournament. It answers with SQLSTATE `PT402`, which PostgREST turns into
// HTTP 402. The API's money-in routes answer 402 `league_subscription_required`.
// This file turns both into one paywall answer, and decides when a league
// page should show anything locked at all.
//
// THE ONE PROPERTY THAT MATTERS MOST. A control is locked only when the
// league is `enforced && !entitled`. Until the gate is switched on, and for
// every owner it does not cover, nobody is enforced — so every director
// must see exactly the page they saw before. Anything missing, malformed or
// unreadable counts as UNLOCKED: the server is the one that decides, and a
// client that guessed "locked" would hide controls the server still allows.
//
// Pure, so it is unit-tested; the pages and routes stay thin.

/** The wire code for "this league needs a plan" — the DB message and the API code. */
export const PLAN_GATE_CODE = 'league_subscription_required';

/** Where a director goes to subscribe. Same-origin path; never built from input. */
export const BILLING_PATH = '/app/billing';

/** The one sentence, wherever the paywall is shown. */
export const PAYWALL_MESSAGE =
  'This league needs an active plan to set up a season, add events or attach tournaments.';

/**
 * Is this error the plan gate?
 *
 * Accepts a PostgREST error from supabase-js (`code: 'PT402'`, `message:
 * 'league_subscription_required'`) and an API error body (`code:
 * 'league_subscription_required'`). Anything else — including a plain 402
 * with no code — is not, so an unrelated refusal is never dressed up as
 * a paywall.
 */
export function isPlanGateError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: unknown; message?: unknown };
  return e.code === 'PT402' || e.code === PLAN_GATE_CODE || e.message === PLAN_GATE_CODE;
}

/** The billing link for one league. */
export function billingUrlFor(leagueId: string | null | undefined): string {
  return leagueId ? `${BILLING_PATH}?league_id=${encodeURIComponent(leagueId)}` : BILLING_PATH;
}

/** The JSON body an API route returns, with HTTP 402. */
export function paywallBody(leagueId: string | null | undefined): {
  error: string;
  code: typeof PLAN_GATE_CODE;
  billing_url: string;
} {
  return { error: PAYWALL_MESSAGE, code: PLAN_GATE_CODE, billing_url: billingUrlFor(leagueId) };
}

/** What GET /api/billing/entitlements?league_id= returns, loosely. */
export type LeagueEntitlement = {
  enforced?: unknown;
  entitled?: unknown;
};

/**
 * Should this league's page show locked controls?
 *
 * True ONLY for `enforced === true && entitled === false`. Every other
 * shape — null, an error body, a missing field, a string "true" — is
 * unlocked. See the header for why that direction.
 */
export function isLocked(ent: LeagueEntitlement | null | undefined): boolean {
  return !!ent && ent.enforced === true && ent.entitled === false;
}

/**
 * The tournaments a director may pick in an empty event's Attach picker.
 *
 * Unlocked: their own tournaments, exactly as before.
 * Locked: only tournaments the league ALREADY has and that are not on a
 * slot — the database refuses anything new, so offering it would be a
 * button that always fails. `known` supplies names for ids the director
 * does not own (an event attached from the app may belong to someone else).
 */
export function attachChoices(opts: {
  locked: boolean;
  mine: Array<{ id: string; name: string; completed_at: string | null }>;
  /** The league's `event_tournament_ids`. */
  eventIds: readonly string[] | null | undefined;
  /** The league's `schedule.bindings`. */
  bindings: Record<string, string> | null | undefined;
  /** Names for ids the director may not own. */
  known: Map<string, { name: string; completed_at: string | null }>;
}): Array<{ id: string; name: string; completed_at: string | null }> {
  if (!opts.locked) return opts.mine;
  const bound = new Set(Object.values(opts.bindings ?? {}).filter(Boolean));
  const out: Array<{ id: string; name: string; completed_at: string | null }> = [];
  for (const id of new Set(opts.eventIds ?? [])) {
    if (!id || bound.has(id)) continue;
    const mine = opts.mine.find((t) => t.id === id);
    const k = opts.known.get(id);
    out.push({
      id,
      name: mine?.name ?? k?.name ?? 'Tournament',
      completed_at: mine?.completed_at ?? k?.completed_at ?? null,
    });
  }
  return out;
}
