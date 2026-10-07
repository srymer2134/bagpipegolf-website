import type { APIRoute } from 'astro';
import { parseEntityId, parseScope } from '../../../lib/payments';
import { fixtureParam, listPayments, modeFor, notFound } from '../../../lib/paymentsServer';

// GET /api/payments?scope=&id= — what /pay/success polls (W4).
//
// Read-only. Takes a scope and an id and nothing else, and returns
// what Railway returns for the signed-in caller — RLS there decides
// the rows (a player sees only their own). The page decides what to
// SAY from that, by matching its exact `payment_id`; this route never
// interprets a status.
//
// Off (404) unless PAYMENTS_ENABLED.
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

export const GET: APIRoute = async (ctx) => {
  const locals = ctx.locals as App.Locals;
  const mode = modeFor(locals);
  if (mode === 'off') return notFound();

  const scope = parseScope(ctx.url.searchParams.get('scope'));
  const id = parseEntityId(ctx.url.searchParams.get('id'));
  if (!scope || !id) return json({ error: 'scope and id are required.', code: 'bad_request' }, 400);
  if (!locals.user && mode !== 'fixtures') {
    return json({ error: 'Sign in to see your payments.', code: 'unauthenticated' }, 401);
  }

  const res = await listPayments({ locals }, mode, scope, id, fixtureParam(mode, ctx.url));
  if (!res.ok) return json({ error: res.error, code: res.code }, res.status >= 400 ? res.status : 502);
  const rows = Array.isArray(res.data?.payments) ? res.data.payments : [];
  return json({ payments: rows });
};
