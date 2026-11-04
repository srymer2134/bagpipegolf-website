import type { APIRoute } from 'astro';
import { callRailway, RailwayApiError } from '../../../lib/railway';
import { isStripeUrl, redirect, withQuery } from '../../../lib/paymentsRoutes';
import { rememberedPromo } from '../../../lib/promoCode';
import { parseTournamentId } from '../../../lib/tournamentPass';

// POST /api/billing/tournament-checkout — the "Buy tournament pass" button on
// /app/billing?tournament_id=. One-time, $240, for a standalone field of 37+.
//
// Same shape and the same rule as ./checkout-session.ts: NOT a transparent
// proxy. The upstream body is rebuilt from `tournament_id` plus the code
// remembered from an email link — never a price. The API checks the caller
// is the director, refuses a league event, and refuses a second pass.
//
// Success: 303 to Stripe-hosted Checkout. Refusal: 303 back to this
// tournament's billing view with `?billing=<code>`; the back-link is built
// from the validated id only, so it cannot be an open redirect.
export const POST: APIRoute = async (ctx) => {
  const locals = ctx.locals as App.Locals;

  let form: FormData;
  try {
    form = await ctx.request.formData();
  } catch {
    return new Response('Bad request', { status: 400 });
  }

  const tournamentId = parseTournamentId(form.get('tournament_id'));
  const back = tournamentId ? withQuery('/app/billing', { tournament_id: tournamentId }) : '/app/billing';
  if (!locals.user) return redirect(`/login?next=${encodeURIComponent(back)}`);
  if (!tournamentId) return redirect(withQuery(back, { billing: 'tournament_id_required' }));

  const promo = rememberedPromo(ctx.cookies);
  let data: { checkout_url?: unknown };
  try {
    data = await callRailway<{ checkout_url?: unknown }>(ctx, {
      method: 'POST',
      path: '/api/billing/tournament-checkout',
      body: { tournament_id: tournamentId, ...(promo ? { promo_code: promo } : {}) },
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
