// The launch offer, and the one place every "Buy" button gets its link.
//
// THE CODE (Sam, 2026-11-04/05): `Bagpipe50` — 50% off the FIRST payment of
// any plan, redeemable until 2026-12-31 23:59 Mountain. It lives in LIVE
// Stripe as coupon BAGPIPE50 + promotion code `Bagpipe50` (duration once,
// unscoped). The API applies it at checkout (`createCheckoutWithCode`), and
// Stripe's own code box opens when it is missing — so this file never decides
// a price. Every figure here is DISPLAY copy; the charge is whatever Stripe
// computes, and the pages say "plus applicable sales tax".
//
// HOW THE CODE TRAVELS: every buy link carries `?promo=Bagpipe50`. The
// middleware stores any well-formed `?promo=` in the `bp_promo` cookie
// (lib/promoCode.ts), and both checkout proxies hand it to the API. So a
// visitor who clicks "Buy" on /pricing, signs up, creates a league, and only
// then reaches checkout still gets the code applied without typing it.
//
// AFTER THE DEADLINE `offerActive()` turns false: the bar, the struck-through
// prices and the `?promo=` disappear on their own. Stripe stops honouring
// the code at the same moment, so the site never advertises a dead code.

export const PROMO_CODE = 'Bagpipe50';
export const PROMO_PERCENT = 50;
/** 2026-12-31 23:59:59 America/Denver (MST, UTC-7) — Stripe's redeem_by. */
export const PROMO_ENDS_AT = new Date('2027-01-01T06:59:59Z');
export const PROMO_ENDS_COPY = 'December 31';

export type PlanKey = 'event' | 'league' | 'club';

export type Plan = {
  key: PlanKey;
  name: string;
  /** Whole dollars. Display only — the price lives in the API's env. */
  price: number;
  per: string;
  /** What "first payment" means for this plan, in the offer line. */
  firstPayment: string;
};

export const PLANS: Record<PlanKey, Plan> = {
  event: { key: 'event', name: 'Single event', price: 240, per: 'per event', firstPayment: 'your first event' },
  league: { key: 'league', name: 'League', price: 2140, per: 'year per league', firstPayment: 'your first year' },
  club: { key: 'club', name: 'Club', price: 2970, per: 'year', firstPayment: 'your first year' },
};

export function offerActive(now: Date = new Date()): boolean {
  return now.getTime() <= PROMO_ENDS_AT.getTime();
}

/** $2,140 → "$2,140". Whole dollars only; the plans have no cents. */
export function dollars(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

/** The first-payment price with the code. 50% of $2,140 is $1,070. */
export function offerPrice(plan: Plan): number {
  return Math.round((plan.price * (100 - PROMO_PERCENT)) / 100);
}

/**
 * The link behind a plan's Buy button: `/buy/<plan>`, which sends the
 * visitor through sign-up and setup to checkout. Carries the code while the
 * offer runs.
 */
export function buyHref(plan: PlanKey, now: Date = new Date()): string {
  return offerActive(now) ? `/buy/${plan}?promo=${PROMO_CODE}` : `/buy/${plan}`;
}

/**
 * "Have a different code?" under each plan: the same buy flow with the saved
 * code forgotten (`?promo=none`, lib/promoCode.ts), so Stripe Checkout opens
 * with its code box instead of applying {@link PROMO_CODE}. Stripe shows no
 * box once a code is applied (Sam, 2026-11-06).
 */
export function differentCodeBuyHref(plan: PlanKey): string {
  return `/buy/${plan}?promo=none`;
}

export function isPlanKey(v: unknown): v is PlanKey {
  return v === 'event' || v === 'league' || v === 'club';
}

/** `/buy/league?promo=…` → 'league'. Anything else → null. */
export function planFromNext(next: unknown): PlanKey | null {
  if (typeof next !== 'string') return null;
  const m = /^\/buy\/([a-z]+)(?:[/?#]|$)/.exec(next);
  return m && isPlanKey(m[1]) ? m[1] : null;
}
