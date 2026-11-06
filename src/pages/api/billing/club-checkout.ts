import type { APIRoute } from 'astro';
import { callRailway, RailwayApiError } from '../../../lib/railway';
import { isStripeUrl, redirect, withQuery } from '../../../lib/paymentsRoutes';
import { rememberedPromo } from '../../../lib/promoCode';

// POST /api/billing/club-checkout — the "Buy Club" button on /buy/club.
// $2,970/yr, sold now and set up by hand (api #196, billing-club.ts): after
// checkout the team switches on each of the buyer's leagues.
//
// Same rule as ./checkout-session.ts: NOT a transparent proxy. The upstream
// body is only the code remembered from a Buy link (lib/promoCode.ts) — no
// price, no plan, nothing the caller names. Success: 303 to Stripe-hosted
// Checkout. Refusal: 303 back to /buy/club?billing=<code>, a constant path.
export const POST: APIRoute = async (ctx) => {
  const locals = ctx.locals as App.Locals;
  const back = '/buy/club';
  if (!locals.user) return redirect(`/signup?next=${encodeURIComponent(back)}`);

  const promo = rememberedPromo(ctx.cookies);
  let data: { checkout_url?: unknown };
  try {
    data = await callRailway<{ checkout_url?: unknown }>(ctx, {
      method: 'POST',
      path: '/api/billing/club-checkout',
      body: promo ? { promo_code: promo } : {},
    });
  } catch (err) {
    const code =
      err instanceof RailwayApiError &&
      err.body &&
      typeof err.body === 'object' &&
      typeof (err.body as { code?: unknown }).code === 'string'
        ? (err.body as { code: string }).code
        : 'error';
    return redirect(withQuery(back, { billing: code }));
  }

  if (!isStripeUrl(data.checkout_url, 'checkout')) {
    return redirect(withQuery(back, { billing: 'error' }));
  }
  return redirect(data.checkout_url as string);
};
