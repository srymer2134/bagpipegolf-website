import type { APIRoute } from 'astro';
import { callRailway, RailwayApiError } from '../../../../lib/railway';
import { createSupabaseFromApi } from '../../../../lib/supabase';

// /api/leagues/[id]/invites
//
// The league half of the invite surface — mirrors
// /api/tournaments/[id]/invites, which has shipped since roadmap #5.
//
//   * POST — proxies to Railway `POST /api/leagues/:id/invites`
//            (fairwayiq-api routes/leagues.ts). Body `{ emails: [...] }`
//            → `{ invites: [{ email, token, sent, error? }] }`.
//            Idempotent upstream: the unique index on
//            (league_id, lower(email)) means re-POSTing an address
//            reuses its token and re-arms a revoked/expired row back
//            to `pending`, so a director who double-clicks Import
//            does not get two invites.
//
//   * GET  — lists this league's non-accepted invites. A direct
//            Supabase SELECT, because `league_invites` already carries
//            an owner-scoped read policy ("owner reads own league
//            invites", 20260812_league_invites.sql) and Railway
//            exposes no list endpoint.
//
// NO DELETE, DELIBERATELY. Revoking an invite is a WRITE, and the
// locked decision for this surface (plan D2) is that every membership
// write goes through the Railway API so one layer owns the validation.
// Railway has no revoke endpoint for leagues — `routes/leagues.ts` is
// POST-only (invites, notify, sub-accept). The RLS to do it
// Supabase-direct does exist (20260812_league_invites_client_writes.sql,
// and the tournament route uses exactly that), so this is a one-line
// change the day either D2 is relaxed or
// `DELETE /api/leagues/:id/invites/:inviteId` lands. Until then the
// panel says revoking is done in the app rather than offering a button
// that bypasses the rule.
//
// WHY PROXY THE POST RATHER THAN INSERT DIRECTLY. The SendGrid
// dispatch lives Railway-side. A client-side INSERT would create the
// row and send nothing — the exact failure the API router's own header
// comment was written to prevent.

/** One request's worth of invites.
 *
 *  Railway loops over the array serially, with two or three queries
 *  plus a SendGrid call per address, so a 200-row CSV in a single
 *  request is a request that runs for a minute and times out at some
 *  edge we do not control. The browser chunks instead; this cap is the
 *  server's half of that agreement, and it is generous enough that
 *  hand-typed invites never meet it. */
const MAX_EMAILS_PER_REQUEST = 50;

export const POST: APIRoute = async (ctx) => {
  const id = ctx.params.id;
  if (typeof id !== 'string' || id.length === 0) {
    return json({ error: 'Missing league id.' }, 400);
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
  const body = raw as Record<string, unknown>;
  const rawEmails = Array.isArray(body.emails) ? body.emails : null;
  if (!rawEmails || rawEmails.length === 0) {
    return json({ error: 'Body must include a non-empty `emails` array.' }, 400);
  }

  // `emails` is the ONLY thing a caller may choose. Everything that
  // decides what the invite is or who sent it — the league, the
  // inviter, the token, the status — is the server's, and the ownership
  // check that gates the whole thing happens on Railway against the
  // forwarded JWT. Sanitising here as well means a shape-only mistake
  // never leaves the edge.
  const emails = Array.from(
    new Set(
      rawEmails
        .map((e) => String(e).trim().toLowerCase())
        .filter((e) => e.length > 0 && e.includes('@')),
    ),
  );
  if (emails.length === 0) {
    return json({ error: 'No valid email addresses.' }, 400);
  }
  if (emails.length > MAX_EMAILS_PER_REQUEST) {
    return json(
      { error: `Send at most ${MAX_EMAILS_PER_REQUEST} invites per request.` },
      400,
    );
  }

  try {
    const result = await callRailway<{
      invites: Array<{ email: string; token?: string; sent: boolean; error?: string }>;
    }>(ctx, {
      method: 'POST',
      path: `/api/leagues/${encodeURIComponent(id)}/invites`,
      body: { emails },
    });
    return json(result, 201);
  } catch (err) {
    if (err instanceof RailwayApiError) {
      return json({ error: err.message }, err.status);
    }
    console.error('[api/leagues/[id]/invites] unexpected POST error', err);
    return json({ error: 'Could not create those invites.' }, 500);
  }
};

export const GET: APIRoute = async (ctx) => {
  const id = ctx.params.id;
  if (typeof id !== 'string' || id.length === 0) {
    return json({ error: 'Missing league id.' }, 400);
  }
  const user = (ctx.locals as App.Locals).user;
  if (!user) {
    return json({ error: 'Not authenticated.' }, 401);
  }

  const supabase = createSupabaseFromApi(ctx);
  // Accepted invites are deliberately excluded: that person is on the
  // roster now, and the roster table above is where they belong. What
  // this list is for is the people who are NOT yet members.
  const { data, error } = await supabase
    .from('league_invites')
    .select('id, league_id, email, status, created_at, updated_at')
    .eq('league_id', id)
    .neq('status', 'accepted')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[api/leagues/[id]/invites] GET error', error);
    return json({ error: error.message ?? 'Failed to load invites.' }, 500);
  }

  // `token` is NOT selected. It is the capability — anyone holding it
  // can join the league — and the panel has no use for it, so it does
  // not travel to a browser.
  return json({ invites: data ?? [] }, 200);
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
