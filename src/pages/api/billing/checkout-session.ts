import type { APIRoute } from 'astro';
import { callRailway, RailwayApiError } from '../../../lib/railway';
import { isStripeUrl, redirect, withQuery } from '../../../lib/paymentsRoutes';

// POST /api/billing/checkout-session — the Subscribe button on /app/billing.
//
// 🚨 NOT A TRANSPARENT PROXY. The body sent upstream is rebuilt from exactly
// one validated field, `league_id`. There is no path by which a caller names
// a price, an amount, a quantity or a trial — the Price id lives only in the
// API's own env (STRIPE_PRICE_LEAGUE_DIRECTOR_ANNUAL). This is the same rule
// as /api/payments/checkout-session, and for the same reason: PATRICK_BACKLOG
// §58 is what happens when a client gets to name a price.
//
// On success: 303 to the Stripe-hosted Checkout URL. No Stripe.js and no card
// fields on our page, ever.
//
// On a refusal: 303 back to /app/billing with `?billing=<code>`, which the
// page turns into a human sentence. The back-link is a constant — never built
// from anything the caller sent — so this cannot be an open redirect.
//
// There is no PAYMENTS_ENABLED-style gate here on purpose. The API is the one
// gate (503 `billing_disabled` unless the caller is allow-listed), and
// duplicating it on the website would mean two switches that can disagree.
// A caller who is not admitted gets the refusal path, same as any other.
export const POST: APIRoute = async (ctx) => {
  const locals = ctx.locals as App.Locals;
  const back = '/app/billing';

  if (!locals.user) return redirect(`/login?next=${encodeURIComponent(back)}`);

  let form: FormData;
  try {
    form = await ctx.request.formData();
  } catch {
    return new Response('Bad request', { status: 400 });
  }

  const raw = form.get('league_id');
  const leagueId = typeof raw === 'string' ? raw.trim() : '';
  if (!leagueId || leagueId.length > 128) {
    return redirect(withQuery(back, { billing: 'league_id_required' }));
  }

  let data: { checkout_url?: unknown };
  try {
    data = await callRailway<{ checkout_url?: unknown }>(ctx, {
      method: 'POST',
      path: '/api/billing/checkout-session',
      body: { league_id: leagueId },
    });
  } catch (err) {
    const code =
      err instanceof RailwayApiError &&
      err.body &&
      typeof err.body === 'object' &&
      typeof (err.body as { code?: unknown }).code === 'string'
        ? (err.body as { code: string }).code
        : 'error';
    return redirect(withQuery(back, { billing: code, league_id: leagueId }));
  }

  if (!isStripeUrl(data.checkout_url, 'checkout')) {
    return redirect(withQuery(back, { billing: 'error', league_id: leagueId }));
  }
  return redirect(data.checkout_url as string);
};
