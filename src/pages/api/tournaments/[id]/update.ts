import type { APIRoute } from 'astro';
import { callRailway, RailwayApiError } from '../../../../lib/railway';

// POST /api/tournaments/[id]/update
//
// Thin proxy to Railway `PATCH /api/tournaments/:id` for the Manage
// page (Slice A1 — roster editor). The Railway handler filters the
// body against `TOURNAMENT_PATCH_ALLOWED` and enforces that the
// caller owns the row (or is on the roster) — same authz surface the
// mobile app hits, so we're not inventing anything new here.
//
// Body shape: a partial tournament update. Today the Manage page
// only sends `{players: [...]}`; later slices (A2 per-round settings,
// A3 delete/duplicate) will add more fields. Each addition needs
// nothing on the server — Railway already accepts every field in
// the PATCH allowlist.
//
// Why POST here instead of PATCH — Astro API routes accept whichever
// method the file exports; the client uses POST for consistency
// with `/api/tournaments/create`, and this file proxies through as
// PATCH to Railway. Same-origin fetch from the browser, no CORS.

export const POST: APIRoute = async (ctx) => {
  const id = ctx.params.id;
  if (typeof id !== 'string' || id.length === 0) {
    return json({ error: 'Missing tournament id.' }, 400);
  }

  let raw: unknown;
  try {
    raw = await ctx.request.json();
  } catch {
    return json({ error: 'Request body must be valid JSON.' }, 400);
  }

  if (!raw || typeof raw !== 'object') {
    return json({ error: 'Body must be an object.' }, 400);
  }

  try {
    const result = await callRailway<{ tournament: { id: string } }>(ctx, {
      method: 'PATCH',
      path: `/api/tournaments/${encodeURIComponent(id)}`,
      body: raw,
    });
    return json({ id: result?.tournament?.id ?? id }, 200);
  } catch (err) {
    if (err instanceof RailwayApiError) {
      return json({ error: err.message }, err.status);
    }
    console.error('[api/tournaments/[id]/update] unexpected error', err);
    return json({ error: 'Update failed.' }, 500);
  }
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
