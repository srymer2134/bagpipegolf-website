// What the saved promo code does to the price on this page (Sam, 2026-11-06:
// applying a code must change the price here, not only on Stripe).
//
// Only Stripe knows a code's discount and which plans it covers, so the page
// asks the API (GET /api/billing-public/promo-preview). The answer is display
// only: checkout looks the code up again and Stripe does the sum it charges.
// When the API cannot answer, the launch code still shows its known price and
// any other code says it will be applied, which is what the page said before
// this existed.
import { callRailwayPublic } from './railway';
import { PLANS, PROMO_CODE, offerActive, offerPrice, type PlanKey } from './offer';

export type PromoView =
  | { kind: 'none' }
  | { kind: 'applied'; code: string; firstCents: number; listCents: number }
  | { kind: 'not_for_plan' | 'unknown' | 'unchecked'; code: string };

type Preview =
  | { valid: true; code: string; list_cents: number; first_payment_cents: number }
  | { valid: false; reason: 'unknown' | 'not_for_plan'; list_cents: number };

/** The view for an API answer, or for no answer at all (`null`). */
export function promoViewFrom(
  plan: PlanKey,
  code: string | null,
  preview: Preview | null,
  now: Date = new Date(),
): PromoView {
  if (!code) return { kind: 'none' };
  if (preview) {
    if (preview.valid) {
      return {
        kind: 'applied',
        code: preview.code,
        firstCents: preview.first_payment_cents,
        listCents: preview.list_cents,
      };
    }
    return { kind: preview.reason === 'not_for_plan' ? 'not_for_plan' : 'unknown', code };
  }
  if (offerActive(now) && code.toLowerCase() === PROMO_CODE.toLowerCase()) {
    return {
      kind: 'applied',
      code: PROMO_CODE,
      firstCents: offerPrice(PLANS[plan]) * 100,
      listCents: PLANS[plan].price * 100,
    };
  }
  return { kind: 'unchecked', code };
}

export async function loadPromoView(
  ctx: Parameters<typeof callRailwayPublic>[0],
  plan: PlanKey,
  code: string | null,
): Promise<PromoView> {
  if (!code) return { kind: 'none' };
  let preview: Preview | null = null;
  try {
    preview = await callRailwayPublic<Preview>(ctx, {
      method: 'GET',
      path: '/api/billing-public/promo-preview',
      query: { plan, code },
    });
  } catch {
    // Display only: never block a checkout page on this.
  }
  return promoViewFrom(plan, code, preview);
}

/** 100 → "$1", 148500 → "$1,485", 1250 → "$12.50". */
export function moneyFromCents(cents: number): string {
  const whole = cents % 100 === 0;
  return `$${(cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  })}`;
}

/** The price a Buy/Subscribe button quotes: the first payment while a code applies. */
export function buttonPrice(view: PromoView, plan: PlanKey, regular: string): string {
  if (view.kind !== 'applied') return regular;
  const first = moneyFromCents(view.firstCents);
  return plan === 'event' ? first : `${first} first year`;
}
