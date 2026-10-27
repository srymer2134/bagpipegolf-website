import type { APIRoute } from 'astro';
import { callRailway, RailwayApiError } from '../../../lib/railway';
import { redirect, withQuery } from '../../../lib/paymentsRoutes';

// POST /api/billing/trial — the "Start free trial" button on /app/billing.
//
// The director's ONE free trial: 30 days, no card (Sam 2026-10-26; API
// 20261115). The API decides everything — one per director, owner only,
// refused while nothing is enforced — and this route only forwards the one
// validated field, `league_id`, exactly as /api/billing/checkout-session does.
//
// Success and refusal both 303 back to /app/billing with `?billing=<code>`,
// which the page turns into a sentence. The back-link is a constant, so this
// cannot be an open redirect. No Stripe call is made: a trial takes no card.
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

  try {
    await callRailway(ctx, {
      method: 'POST',
      path: '/api/billing/trial',
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

  return redirect(withQuery(back, { billing: 'trial_started', league_id: leagueId }));
};
