import type { APIRoute } from 'astro';
import { eventPath, isKindAllowed, parseCheckoutRequest } from '../../../lib/payments';
import { createCheckout, fixtureParam, modeFor, notFound } from '../../../lib/paymentsServer';
import { isStripeUrl, redirect, withQuery } from '../../../lib/paymentsRoutes';

// POST /api/payments/checkout-session — W3's Pay button.
//
// 🚨 NOT A TRANSPARENT PROXY. The body is EXACTLY `{scope, id, kind}`
// (form fields) and anything else — an `amount`, a `price`, a stray
// field — is a 400, not something quietly dropped. The Railway body is
// rebuilt from the three validated values, so there is no path by
// which a caller names a price (contract §0 rule 1; PATRICK_BACKLOG
// §58 is what happens otherwise).
//
// On success: 303 to the Stripe-hosted Checkout URL (K5 — no
// Stripe.js, no card fields on our page). On a refusal: 303 back to
// the event page with `?pay=<code>`, which renders the human sentence
// for that code. The back-link is built from (scope, id), never from a
// caller-supplied URL.
//
// Off (404) unless PAYMENTS_ENABLED.
export const POST: APIRoute = async (ctx) => {
  const locals = ctx.locals as App.Locals;
  const mode = modeFor(locals);
  if (mode === 'off') return notFound();

  let form: FormData;
  try {
    form = await ctx.request.formData();
  } catch {
    return new Response('Bad request', { status: 400 });
  }
  const parsed = parseCheckoutRequest(form.entries());
  if (!parsed.ok) return new Response(`Bad request: ${parsed.reason}`, { status: 400 });
  const req = parsed.value;
  const back = eventPath(req.scope, req.id);

  if (!locals.user) return redirect(`/login?next=${encodeURIComponent(back)}`);
  if (!isKindAllowed(req.scope, req.kind)) {
    return redirect(withQuery(back, { pay: 'kind_not_allowed' }) + '#pay');
  }

  const fixture = fixtureParam(mode, ctx.url);
  const res = await createCheckout({ locals }, mode, req, fixture);
  if (!res.ok) {
    return redirect(withQuery(back, { pay: res.code, fixture }) + '#pay');
  }

  if (mode === 'fixtures') {
    // Stand-in for Stripe's success redirect, so the poll is walkable
    // locally. Never reached in a built Worker.
    return redirect(
      withQuery('/pay/success', {
        payment_id: res.data.payment_id,
        scope: req.scope,
        id: req.id,
        fixture: 'payments_succeeded',
      }),
    );
  }
  if (!isStripeUrl(res.data.checkout_url, 'checkout')) {
    return redirect(withQuery(back, { pay: 'error' }) + '#pay');
  }
  return redirect(res.data.checkout_url);
};
