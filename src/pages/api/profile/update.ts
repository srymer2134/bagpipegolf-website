import type { APIRoute } from 'astro';
import { callRailway, RailwayApiError } from '../../../lib/railway';
import {
  buildProfilePatch,
  validateProfile,
  type ProfileValues,
} from '../../../lib/profileFields';

// POST /api/profile/update
//
// Partial profile write. Proxies `PUT /api/profile` on Railway with
// the signed-in user's token — the same route and the same authz the
// app hits, so nothing new is invented here.
//
// 🚨 PARTIAL IS THE WHOLE POINT. The app carries a CI ratchet about
// this (`test/codebase/name_only_profile_writes_test.dart`) guarding
// the 2026-09-26 signup handicap race: a full-profile PUT sent
// `handicap: 18.0` — the model's default — and overwrote what the user
// had just typed. A web form is the same hazard with a wider mouth,
// because it renders every field and so a naive save sends every
// field.
//
// So the browser sends BOTH the values it loaded and the values it now
// shows, and this handler diffs them. Only genuinely changed fields
// reach Railway. A field the user never touched is absent from the
// body, which is what stops a tab open for ten minutes writing back a
// handicap from ten minutes ago.
//
// It also drops nulls for every field except `phone`, because the
// route's bare `.optional()` validators 400 on a null. See
// `lib/profileFields.ts` for the full reasoning.

export const POST: APIRoute = async (ctx) => {
  const locals = ctx.locals as App.Locals;
  if (!locals.user?.id) return json({ error: 'Sign in to edit your profile.' }, 401);

  let raw: { current?: unknown; next?: unknown };
  try {
    raw = (await ctx.request.json()) as typeof raw;
  } catch {
    return json({ error: 'Request body must be valid JSON.' }, 400);
  }

  const current = (raw.current ?? {}) as ProfileValues;
  const next = (raw.next ?? {}) as ProfileValues;

  const problems = validateProfile(next);
  if (problems.length > 0) {
    return json({ error: problems[0].message, problems }, 400);
  }

  const body = buildProfilePatch(current, next);
  if (Object.keys(body).length === 0) {
    // Not an error — the user pressed Save without changing anything.
    return json({ ok: true, changed: [] }, 200);
  }

  try {
    await callRailway(ctx, {
      method: 'PUT',
      path: '/api/profile',
      body,
    });
    return json({ ok: true, changed: Object.keys(body) }, 200);
  } catch (err) {
    if (err instanceof RailwayApiError) {
      return json({ error: err.message }, err.status);
    }
    console.error('[api/profile/update] unexpected', err);
    return json({ error: 'Could not save your profile.' }, 500);
  }
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
