import type { APIRoute } from 'astro';
import { callRailway, RailwayApiError } from '../../../lib/railway';
import { isStripeUrl, redirect, withQuery } from '../../../lib/paymentsRoutes';

// POST /api/billing/tournament-checkout — the "Get tournament pass" button.
//
// Same rules as /api/billing/checkout-session, for the same reasons:
//   * NOT A TRANSPARENT PROXY. The upstream body is rebuilt from one
//     validated field, `tournament_id`. The caller can name no price or
//     amount — the Price id lives only in the API's env
//     (STRIPE_PRICE_TOURNAMENT_PASS).
//   * Success → 303 to the Stripe-hosted Checkout URL, checked to BE one.
//   * Refusal → 303 back to /app/billing with `?billing=<code>`. The
//     back-link is a constant, so this cannot be an open redirect.
// The API is the one gate (billing_disabled, owner, league, already-paid).
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

  const raw = form.get('tournament_id');
  const tournamentId = typeof raw === 'string' ? raw.trim() : '';
  if (!tournamentId || tournamentId.length > 128) {
    return redirect(withQuery(back, { billing: 'tournament_id_required' }));
  }

  let data: { checkout_url?: unknown };
  try {
    data = await callRailway<{ checkout_url?: unknown }>(ctx, {
      method: 'POST',
      path: '/api/billing/tournament-checkout',
      body: { tournament_id: tournamentId },
    });
  } catch (err) {
    const code =
      err instanceof RailwayApiError &&
      err.body &&
      typeof err.body === 'object' &&
      typeof (err.body as { code?: unknown }).code === 'string'
        ? (err.body as { code: string }).code
        : 'error';
    return redirect(withQuery(back, { billing: code, tournament_id: tournamentId }));
  }

  if (!isStripeUrl(data.checkout_url, 'checkout')) {
    return redirect(withQuery(back, { billing: 'error', tournament_id: tournamentId }));
  }
  return redirect(data.checkout_url as string);
};
