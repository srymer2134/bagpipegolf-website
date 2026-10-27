// Rail 1 on the website — the league subscription ($2,000/yr).
//
// Plan: LEAGUE_SUBSCRIPTION_AND_PLAN_GATING_PLAN.md §3.9 (flutter repo).
// API: api #173 — POST /api/billing/checkout-session, POST
// /api/billing/portal-session, GET /api/billing/entitlements.
//
// WHICH DIRECTION THE MONEY GOES, because /app/payments and /pay/* run the
// other way: those are Connect, moving a member's dues to the HOST's
// connected account. This charges a league DIRECTOR on Bagpipe's own
// platform account, through Stripe Billing, and that money is revenue.
// Nothing is shared between the two beyond the proxy shape.
//
// THE SERVER DECIDES VISIBILITY, NOT THIS FILE. Every route answers 503
// `billing_disabled` unless the caller is admitted (BILLING_ENABLED, or the
// caller is in billing.config.gate_profiles — the four-person allowlist on
// dev). `/pricing` still says the product is free, so a page that rendered a
// Subscribe button for everyone would be telling two different stories.
// `billing_available` in the entitlements response is how we know.
//
// The pure functions here are separated out because a server-rendered
// .astro cannot be unit-tested; the pages and API routes stay thin.

/** One league's billing state, as GET /api/billing/entitlements returns it. */
export type BillingLeagueRow = {
  league_id: string;
  entitled: boolean;
  pays: boolean;
  // 'trial' = the comp that is the director's one free trial (api 20261115)
  source: 'stripe' | 'comp' | 'trial' | null;
  period_end: string | null;
  cancel_at_period_end: boolean;
};

/**
 * The director's one free trial — 30 days, no card (Sam 2026-10-26). One per
 * director, not per league. `available` is false once any trial has started.
 */
export type TrialInfo = {
  trial_days: number;
  used: boolean;
  available: boolean;
  league_id: string | null;
  ends_at: string | null;
  active: boolean;
};

export type BillingListResponse = {
  billing_available: boolean;
  gate: 'off' | 'allowlist' | 'on';
  /** Is the gate refusing anything for this director yet? */
  enforced?: boolean;
  trial?: TrialInfo;
  leagues: BillingLeagueRow[];
};

/** What a row's badge should say. */
export type BillingRowState =
  | 'subscribe' // never paid, and nothing covers it
  | 'active' // a live subscription, renewing
  | 'ending' // live, but cancel_at_period_end
  | 'comped' // covered by a comp, not a card
  | 'trial'; // the free trial, no card

/**
 * The state for one league.
 *
 * `entitled` is the only thing that decides covered-vs-not — NOT the presence
 * of a subscription row. A `past_due` card still entitles, because Stripe's
 * Smart Retries run 14 days before it cancels and a card that failed this
 * morning must not read as "unpaid" on the page.
 */
export function rowState(row: BillingLeagueRow): BillingRowState {
  if (!row.entitled) return 'subscribe';
  if (row.source === 'trial') return 'trial';
  if (row.source === 'comp') return 'comped';
  return row.cancel_at_period_end ? 'ending' : 'active';
}

/** The human sentence under a row. Never shows a raw status string. */
export function rowDetail(row: BillingLeagueRow, today = new Date()): string {
  const when = formatPeriodEnd(row.period_end);
  switch (rowState(row)) {
    case 'active':
      return when ? `Renews ${when}.` : 'Active.';
    case 'ending':
      return when ? `Ends ${when} — it will not renew.` : 'Ends at the period end.';
    case 'comped':
      return when ? `Covered at no charge until ${when}.` : 'Covered at no charge.';
    case 'trial':
      return when
        ? `Free trial until ${when}. Subscribe before then to keep the season going — the first payment is taken when the trial ends.`
        : 'Free trial. Subscribe before it ends to keep the season going.';
    case 'subscribe':
      return daysUntil(row.period_end, today) !== null
        ? 'The previous term has ended.'
        : 'Not subscribed.';
  }
}

/**
 * `2027-10-22T…` → `22 October 2027`. Null/garbage → null, never
 * "Invalid Date".
 *
 * FORMATTED IN UTC, DELIBERATELY. Stripe's period ends land on UTC midnight,
 * and `toLocaleDateString` without a timeZone renders in whatever zone the
 * runtime is in — so the same subscription read "22 October" in a Cloudflare
 * Worker and "21 October" on a laptop in Denver. A director being told their
 * season ends a day before Stripe thinks it does is a support ticket, and it
 * would have shipped: the test for this failed on exactly that.
 */
export function formatPeriodEnd(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-GB', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** Whole days from `today` to `iso`; negative when past. Null when unusable. */
export function daysUntil(iso: string | null, today = new Date()): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - today.getTime()) / 86_400_000);
}

/**
 * The human sentence for a refusal code from the API.
 *
 * Unknown codes get a generic line rather than the raw code — the codes are
 * an API contract, not copy.
 */
export function billingErrorMessage(code: string | null | undefined): string | null {
  switch (code) {
    case null:
    case undefined:
    case '':
      return null;
    case 'cancelled':
      return 'Checkout was cancelled. Nothing was charged.';
    case 'already_subscribed':
      return 'That league already has an active subscription.';
    case 'not_league_owner':
      return 'Only the league owner can subscribe.';
    case 'league_not_found':
      return 'That league could not be found.';
    case 'no_customer':
      return 'There is nothing to manage yet — subscribe first.';
    case 'price_not_configured':
    case 'not_configured':
    case 'billing_disabled':
      return 'Subscriptions are not switched on yet. Nothing was charged.';
    case 'stripe_error':
      return 'The payment provider did not answer. Nothing was charged — try again.';
    case 'comped':
      return 'That league is covered at no charge — there is nothing to buy yet.';
    // Season moves (api #177). Nothing is charged by a move.
    case 'moved':
      return 'Done — your plan now covers the new season. The renewal date has not changed.';
    case 'move_already_this_term':
      return 'This plan has already moved once this year. It can move again after it renews.';
    case 'move_target_covered':
    case 'league_already_subscribed':
      return 'That season already has a plan. Nothing was moved.';
    case 'move_not_newer':
      return 'A plan can only move to a newer season. Nothing was moved.';
    case 'move_not_owner':
      return 'You need to own both leagues to move a plan.';
    case 'move_nothing_to_move':
      return 'That league has no plan to move.';
    case 'move_same_league':
      return 'Pick a different season to move to.';
    // The free trial (api 20261115). No card is taken by a trial.
    case 'trial_started':
      return 'Your free trial has started. No card needed — subscribe any time before it ends to keep going.';
    case 'trial_already_used':
      return 'You have already used your free trial. Subscribe to keep going.';
    case 'trial_league_covered':
      return 'That league is already covered — there is no need for a trial.';
    case 'trial_not_needed':
      return 'Nothing is locked yet, so your free trial is saved for later.';
    case 'trial_unavailable':
      return 'Free trials are not available right now.';
    case 'trial_not_owner':
      return 'Only the league owner can start the free trial.';
    default:
      return 'Something went wrong. Nothing was charged — try again.';
  }
}

/**
 * Should the page offer a Manage (portal) button?
 *
 * Only when something has actually been bought with a card. A comp has no
 * Stripe customer behind it, so the portal would 409 `no_customer` — offering
 * it would be a button that always fails.
 */
export function offersPortal(leagues: BillingLeagueRow[]): boolean {
  return leagues.some((l) => l.source === 'stripe');
}

/**
 * Should this row offer "Start free trial"?
 *
 * Only for an uncovered league, while the gate is refusing something for this
 * director, and only while their one trial is unused. The API refuses every
 * other case anyway; this keeps the page from offering a button that fails.
 */
export function offersTrial(state: Pick<BillingListResponse, 'enforced' | 'trial'> | null, row: BillingLeagueRow): boolean {
  return !!state && state.enforced === true && state.trial?.available === true && rowState(row) === 'subscribe';
}

/** "Start your 30-day free trial", from the server's own length. */
export function trialButtonCopy(trial: TrialInfo | undefined): string {
  const days = trial && Number.isInteger(trial.trial_days) && trial.trial_days > 0 ? trial.trial_days : null;
  return days ? `Start ${days}-day free trial` : 'Start free trial';
}

/** The price, as copy. One plan, so this is not fetched from Stripe. */
export const LEAGUE_DIRECTOR_PRICE_COPY = '$2,000 / year';

/** What `moveTargets` needs from each league the director owns. */
export type OwnedLeague = {
  id: string;
  name: string;
  created_at: string | null;
  completed_at: string | null;
};

/**
 * Where a league's plan can move: "Move to next season" (plan §3.1, §3.9).
 *
 * Offered only for a COMPLETED league whose plan is live (a card or a comp),
 * and only to a NEWER league the director owns that has no plan of its own.
 * The API is the authority — it also enforces one move per term — so this is
 * only what the page offers, never what it allows.
 */
export function moveTargets(
  row: BillingLeagueRow,
  owned: readonly OwnedLeague[],
  rows: readonly BillingLeagueRow[],
): OwnedLeague[] {
  if (rowState(row) === 'subscribe') return [];
  const from = owned.find((l) => l.id === row.league_id);
  if (!from || !from.completed_at || !from.created_at) return [];
  const fromAt = Date.parse(from.created_at);
  if (Number.isNaN(fromAt)) return [];
  const covered = new Set(rows.filter((r) => r.entitled).map((r) => r.league_id));
  return owned
    .filter((l) => l.id !== from.id && !covered.has(l.id))
    .filter((l) => {
      const at = l.created_at ? Date.parse(l.created_at) : NaN;
      return !Number.isNaN(at) && at > fromAt;
    })
    .sort((a, b) => Date.parse(b.created_at as string) - Date.parse(a.created_at as string));
}
