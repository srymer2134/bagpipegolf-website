import type { APIRoute } from 'astro';
import { callRailway, RailwayApiError } from '../../../lib/railway';
import { isStripeUrl, redirect, withQuery } from '../../../lib/paymentsRoutes';

// POST /api/billing/portal-session — "Manage subscription" on /app/billing.
//
// Sends the director to Stripe's hosted Billing Portal, which owns card
// updates, invoices and cancel-at-period-end. We deliberately build none of
// that: a self-made cancel button would be a second place the truth lives.
//
// No body. The subscription is found from the signed-in user's Stripe
// Customer, server-side — there is nothing for a caller to name, so there is
// nothing for a caller to tamper with.
//
// Minted on POST only, never on a page render: portal links are short-lived
// and a link-preview bot following a GET would spend one. Same reason
// /app/payments/setup does not mint an Account Link while rendering.
export const POST: APIRoute = async (ctx) => {
  const locals = ctx.locals as App.Locals;
  const back = '/app/billing';

  if (!locals.user) return redirect(`/login?next=${encodeURIComponent(back)}`);

  let data: { portal_url?: unknown };
  try {
    data = await callRailway<{ portal_url?: unknown }>(ctx, {
      method: 'POST',
      path: '/api/billing/portal-session',
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

  if (!isStripeUrl(data.portal_url, 'billing')) {
    return redirect(withQuery(back, { billing: 'error' }));
  }
  return redirect(data.portal_url as string);
};
