import type { APIRoute } from 'astro';
import { parseEntityId, parseScope } from '../../../lib/payments';
import { modeFor, notFound } from '../../../lib/paymentsServer';
import { startOnboarding, type RouteCtx } from '../../../lib/paymentsRoutes';

// GET /app/payments/refresh?scope=&id= — W2. Stripe's Account Link
// `refresh_url`.
//
// Stripe sends the browser here when an onboarding link has expired,
// was already used, or was opened by something else first (a
// messaging app's link preview — plan R8). Stripe's own guidance is
// that this URL mints a fresh link and redirects, so — unlike every
// other payments surface — it mints on a GET. That is safe here and
// nowhere else: it sits under /app (signed-in only, the middleware
// bounces anyone else to /login) and `startOnboarding` refuses anyone
// but the league's or tournament's owner.
//
// The API must put `scope` and `id` on the refresh_url it gives
// Stripe — the contract does not say so yet (see the PR body).
//
// Off (404) unless PAYMENTS_ENABLED.
export const GET: APIRoute = async (ctx) => {
  if (modeFor(ctx.locals as App.Locals) === 'off') return notFound();
  const scope = parseScope(ctx.url.searchParams.get('scope'));
  const id = parseEntityId(ctx.url.searchParams.get('id'));
  if (!scope || !id) return new Response('Bad request', { status: 400 });
  return startOnboarding(ctx as unknown as RouteCtx, scope, id);
};
