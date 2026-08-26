import type { APIRoute } from 'astro';
import { callRailway, RailwayApiError } from '../../../../lib/railway';

// POST /api/tournaments/[id]/delete
//
// Proxy to Railway `DELETE /api/tournaments/:id` for the Manage
// page's Danger-zone delete action (Slice A3). Server-side proxy
// keeps the JWT out of the browser + gives us a place to layer any
// pre-delete audit logging later (calcutta refund, sponsor
// notifications, etc — none of that today, but the seam is here).
//
// Uses POST rather than DELETE so the client-side fetch is simple
// and consistent with the other write proxies on the site
// (create.ts, update.ts). Railway sees a real DELETE.
//
// Auth chain: middleware requires sign-in for /api/*; Railway's
// DELETE handler further enforces `user_id = req.userId` — same
// owner-only rule the mobile delete flow uses. A non-director
// caller gets a Railway 204 back but zero rows would have been
// affected — indistinguishable from success at the HTTP layer,
// which is fine because the Manage page has already
// director-gated the button placement.

export const POST: APIRoute = async (ctx) => {
  const id = ctx.params.id;
  if (typeof id !== 'string' || id.length === 0) {
    return json({ error: 'Missing tournament id.' }, 400);
  }
  try {
    await callRailway(ctx, {
      method: 'DELETE',
      path: `/api/tournaments/${encodeURIComponent(id)}`,
    });
    return json({ ok: true }, 200);
  } catch (err) {
    if (err instanceof RailwayApiError) {
      return json({ error: err.message }, err.status);
    }
    console.error('[api/tournaments/[id]/delete] unexpected error', err);
    return json({ error: 'Delete failed.' }, 500);
  }
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
