import type { APIRoute } from 'astro';
import { callRailway, RailwayApiError } from '../../../../lib/railway';
import { createSupabaseFromApi } from '../../../../lib/supabase';

// /api/tournaments/[id]/invites
//
// Roadmap item #5 — email invites on the wizard + Manage page.
// Backed by Patrick's §14 endpoints (routes/tournaments.ts +
// routes/invites.ts on the Railway API repo).
//
// Endpoints exposed on the website (all director-scoped by RLS +
// Railway ownership check):
//   * POST   — Send one or more invites. Proxies to Railway
//              `POST /api/tournaments/:id/invites`; body:
//              `{ emails: string[] }` → returns
//              `{ invites: [{ email, token, sent, error? }] }`.
//              Idempotent server-side: re-POSTing an email reuses
//              its token + re-arms revoked/expired/accepted rows
//              back to `pending`.
//   * GET    — List existing invites (all non-accepted rows). Uses
//              direct Supabase SELECT — the owner-read RLS policy
//              from `20260612_tournament_invites.sql` scopes it to
//              the tournament creator. Mirrors the mobile app's
//              `TournamentInvitesNotifier._fetch`.
//   * DELETE — Revoke a pending invite. Uses direct Supabase UPDATE
//              (Patrick didn't ship a revoke endpoint; the mobile
//              app writes `status='revoked'` directly, covered by
//              `20260612_tournament_invites_client_writes.sql`).
//              Requires `?inviteId=<uuid>` in the query.

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
  const body = raw as Record<string, unknown>;
  const rawEmails = Array.isArray(body.emails) ? body.emails : null;
  if (!rawEmails || rawEmails.length === 0) {
    return json({ error: 'Body must include a non-empty `emails` array.' }, 400);
  }

  // Client-side sanitize before we hit Railway. Railway re-sanitizes
  // (lowercase, trim, `@` presence, dedup), but doing it here means
  // shape-only failures never leave the edge.
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

  try {
    const result = await callRailway<{
      invites: Array<{ email: string; token?: string; sent: boolean; error?: string }>;
    }>(ctx, {
      method: 'POST',
      path: `/api/tournaments/${encodeURIComponent(id)}/invites`,
      body: { emails },
    });
    return json(result, 201);
  } catch (err) {
    if (err instanceof RailwayApiError) {
      return json({ error: err.message }, err.status);
    }
    console.error('[api/tournaments/[id]/invites] unexpected POST error', err);
    return json({ error: 'Invite send failed.' }, 500);
  }
};

export const GET: APIRoute = async (ctx) => {
  const id = ctx.params.id;
  if (typeof id !== 'string' || id.length === 0) {
    return json({ error: 'Missing tournament id.' }, 400);
  }
  const user = (ctx.locals as App.Locals).user;
  if (!user) {
    return json({ error: 'Not authenticated.' }, 401);
  }

  const supabase = createSupabaseFromApi(ctx);
  const { data, error } = await supabase
    .from('tournament_invites')
    .select('id, tournament_id, email, token, status, invited_by, created_at, updated_at, accepted_at, accepted_by')
    .eq('tournament_id', id)
    .neq('status', 'accepted')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[api/tournaments/[id]/invites] GET error', error);
    return json({ error: error.message ?? 'Failed to load invites.' }, 500);
  }

  return json({ invites: data ?? [] }, 200);
};

export const DELETE: APIRoute = async (ctx) => {
  const id = ctx.params.id;
  if (typeof id !== 'string' || id.length === 0) {
    return json({ error: 'Missing tournament id.' }, 400);
  }
  const user = (ctx.locals as App.Locals).user;
  if (!user) {
    return json({ error: 'Not authenticated.' }, 401);
  }

  const url = new URL(ctx.request.url);
  const inviteId = url.searchParams.get('inviteId');
  if (!inviteId) {
    return json({ error: 'Missing ?inviteId= query param.' }, 400);
  }

  const supabase = createSupabaseFromApi(ctx);
  // Soft delete via status flip — preserves the audit trail. The
  // owner-scoped UPDATE policy (client-writes migration) blocks a
  // non-director from mutating the row.
  const { error } = await supabase
    .from('tournament_invites')
    .update({
      status: 'revoked',
      updated_at: new Date().toISOString(),
    })
    .eq('id', inviteId)
    .eq('tournament_id', id);

  if (error) {
    console.error('[api/tournaments/[id]/invites] DELETE error', error);
    return json({ error: error.message ?? 'Failed to revoke invite.' }, 500);
  }

  return json({ ok: true }, 200);
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
