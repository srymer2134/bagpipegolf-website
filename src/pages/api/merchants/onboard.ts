import type { APIRoute } from 'astro';
import { parseEntityId, parseScope } from '../../../lib/payments';
import { modeFor, notFound } from '../../../lib/paymentsServer';
import { startOnboarding, type RouteCtx } from '../../../lib/paymentsRoutes';

// POST /api/merchants/onboard — W1's "Set up card payments" and the
// return page's "Continue setup". Form fields: exactly `scope`, `id`.
//
// Mints the Account Link HERE, on the click, and 303s the browser to
// it. Never on a page render: the link is single-use and expires in
// minutes, and a link-preview bot that fetched a page carrying one
// would burn it (plan R8).
//
// `owner_email` (F5) is the signed-in user's own address, read from
// the session — not a form field — and the owner check runs before
// Railway is called. Off (404) unless PAYMENTS_ENABLED.
export const POST: APIRoute = async (ctx) => {
  if (modeFor(ctx.locals as App.Locals) === 'off') return notFound();

  let form: FormData;
  try {
    form = await ctx.request.formData();
  } catch {
    return new Response('Bad request', { status: 400 });
  }
  const keys = [...form.keys()].sort().join(',');
  const scope = parseScope(form.get('scope'));
  const id = parseEntityId(form.get('id'));
  if (keys !== 'id,scope' || !scope || !id) {
    return new Response('Bad request', { status: 400 });
  }
  return startOnboarding(ctx as unknown as RouteCtx, scope, id);
};
