import type { APIRoute } from 'astro';
import { callRailway, RailwayApiError } from '../../../lib/railway';
import { createSupabaseFromApi } from '../../../lib/supabase';
import { confirmMatches, DELETED_LANDING } from '../../../lib/accountDelete';

// POST /api/account/delete
//
// Proxies `DELETE /api/users/me` on Railway with the signed-in user's
// token — the same route, authz and deletion order as the app's
// Profile → Delete Account. Railway hard-codes the caller's own id, so a
// body can never name someone else. See `lib/accountDelete.ts`.
//
// Then signs the browser out locally: the auth user no longer exists, so
// the cookie session is dead weight and the next page would 401.

export const POST: APIRoute = async (ctx) => {
  const locals = ctx.locals as App.Locals;
  if (!locals.user?.id) return json({ error: 'Sign in to delete your account.' }, 401);

  let raw: { confirm?: unknown };
  try {
    raw = (await ctx.request.json()) as typeof raw;
  } catch {
    return json({ error: 'Request body must be valid JSON.' }, 400);
  }
  if (!confirmMatches(raw.confirm)) {
    return json({ error: 'Type DELETE in capitals to confirm.' }, 400);
  }

  try {
    await callRailway(ctx, { method: 'DELETE', path: '/api/users/me' });
  } catch (err) {
    if (err instanceof RailwayApiError) {
      return json({ error: err.message }, err.status >= 400 ? err.status : 502);
    }
    return json({ error: 'Could not reach the server. Nothing was deleted.' }, 502);
  }

  try {
    await createSupabaseFromApi(ctx).auth.signOut({ scope: 'local' });
  } catch {
    // The account is already gone; a failed cookie clear is cosmetic.
  }
  return json({ ok: true, next: DELETED_LANDING }, 200);
};

export const GET: APIRoute = () =>
  new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } });

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
