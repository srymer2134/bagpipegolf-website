import type { APIRoute } from 'astro';
import { callRailway, RailwayApiError } from '../../../lib/railway';

// GET /api/billing/entitlements?league_id= — read-only, same-origin.
//
// Exists so /app/billing/success can POLL from the browser. Stripe redirects
// the director back the instant Checkout completes, which is usually BEFORE
// the webhook has landed — so the page has to ask again rather than claim
// success or failure from the redirect alone.
//
// Same-origin and server-proxied for the reason in lib/railway.ts: the
// Supabase JWT never reaches client-visible network traffic.
//
// Read-only. It mints nothing and charges nothing, so unlike the other two
// /api/billing routes a GET here is safe for a bot to follow.
export const GET: APIRoute = async (ctx) => {
  const locals = ctx.locals as App.Locals;
  if (!locals.user) {
    return new Response(JSON.stringify({ error: 'not_signed_in' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }

  const raw = ctx.url.searchParams.get('league_id');
  const leagueId = typeof raw === 'string' ? raw.trim() : '';
  // A tournament pass is polled by tournament id (success page, api #182).
  const rawT = ctx.url.searchParams.get('tournament_id');
  const tournamentId = typeof rawT === 'string' ? rawT.trim() : '';
  if (leagueId.length > 128 || tournamentId.length > 128) {
    return new Response(JSON.stringify({ error: 'league_id_required' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  try {
    const data = await callRailway<unknown>(ctx, {
      method: 'GET',
      path: '/api/billing/entitlements',
      query: leagueId
        ? { league_id: leagueId }
        : tournamentId
          ? { tournament_id: tournamentId }
          : undefined,
    });
    return new Response(JSON.stringify(data), {
      status: 200,
      // Never cached: the whole point is that the answer changes when the
      // webhook lands.
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  } catch (err) {
    const status = err instanceof RailwayApiError ? err.status : 502;
    const body =
      err instanceof RailwayApiError && err.body && typeof err.body === 'object'
        ? err.body
        : { error: 'upstream_error' };
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }
};
