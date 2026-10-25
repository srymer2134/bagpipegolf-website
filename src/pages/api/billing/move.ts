import type { APIRoute } from 'astro';
import { callRailway, RailwayApiError } from '../../../lib/railway';
import { redirect, withQuery } from '../../../lib/paymentsRoutes';

// POST /api/billing/move — "Move to next season" on /app/billing.
//
// Forwards to api #177's POST /api/billing/subscriptions/move, which is the
// authority on every rule (same owner, newer league, uncovered target, one
// move per term). The body sent upstream is rebuilt from exactly two
// validated fields. Nothing is charged by a move.
//
// Always 303s back to the constant /app/billing with `?billing=<code>`
// (`moved` on success), which the page turns into a sentence — never to a
// URL built from input, so this cannot be an open redirect.
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
  const field = (k: string) => {
    const v = form.get(k);
    const t = typeof v === 'string' ? v.trim() : '';
    return t && t.length <= 128 ? t : null;
  };
  const from = field('from_league_id');
  const to = field('to_league_id');
  if (!from || !to) return redirect(withQuery(back, { billing: 'league_id_required' }));

  try {
    await callRailway(ctx, {
      method: 'POST',
      path: '/api/billing/subscriptions/move',
      body: { from_league_id: from, to_league_id: to },
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
  return redirect(withQuery(back, { billing: 'moved' }));
};
