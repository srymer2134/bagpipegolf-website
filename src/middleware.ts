import { defineMiddleware } from 'astro:middleware';
import { createSupabaseClient } from './lib/supabase';
import { handleWellKnownRequest } from './lib/wellKnown';

// Routes that require an authenticated Supabase session. If a request
// to one of these comes in without a session, we redirect to /login
// with a `?next=` so the user comes back to where they started.
const PROTECTED_PREFIXES = ['/app'];

// Sub-routes under a PROTECTED_PREFIXES path that are PUBLIC and
// bypass the auth gate. Ballyneal Brigade 2026-08-02 — Sam
// expanded the public surface so non-player spectators can view
// the whole tournament (overview, scorecard, calcutta, payouts,
// leaderboard) with just the tourney id, no signin required.
// Only `/manage` (TD-only admin surface) stays gated.
// RLS on `public.tournaments` grants `anon` a SELECT policy so
// the SSR fetches work with just the anon key (see the flutter
// repo migration
// `20260727_public_read_tournaments_for_web_leaderboard.sql`).
const PUBLIC_APP_PATTERNS: RegExp[] = [
  /^\/app\/tournaments\/[^/]+\/?$/,
  /^\/app\/tournaments\/[^/]+\/(leaderboard|scorecard|calcutta|payouts)\/?$/,
];

// Routes a signed-in user should be bounced AWAY from (login pages,
// etc.). Sends them to /app instead.
const SIGNED_IN_BOUNCE = ['/login', '/signup', '/forgot-password'];

export const onRequest = defineMiddleware(async (ctx, next) => {
  const { pathname } = new URL(ctx.request.url);

  // Short-circuit .well-known/* before Supabase init. The
  // apple-app-site-association + assetlinks.json paths are polled by
  // iOS / Android during install-time verification and should never
  // pay the auth cost. The handler returns null for paths it doesn't
  // claim, falling through to the rest of the middleware.
  const wellKnown = handleWellKnownRequest(pathname);
  if (wellKnown !== null) return wellKnown;

  let session: App.Locals['session'] = null;
  let user: App.Locals['user'] = null;

  try {
    const supabase = createSupabaseClient({
      request: ctx.request,
      cookies: ctx.cookies,
      locals: ctx.locals as App.Locals,
    });
    const { data } = await supabase.auth.getUser();
    user = data.user ?? null;
    if (user) {
      const { data: sessionData } = await supabase.auth.getSession();
      session = sessionData.session ?? null;
    }
  } catch (err) {
    console.error('[middleware] supabase init failed', err);
  }

  (ctx.locals as App.Locals).session = session;
  (ctx.locals as App.Locals).user = user;

  const isProtected = PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'));
  const isPublicApp = PUBLIC_APP_PATTERNS.some((r) => r.test(pathname));
  if (isProtected && !isPublicApp && !user) {
    const next = encodeURIComponent(pathname + (new URL(ctx.request.url).search || ''));
    return ctx.redirect(`/login?next=${next}`, 302);
  }

  const shouldBounceSignedIn = SIGNED_IN_BOUNCE.includes(pathname);
  if (shouldBounceSignedIn && user) {
    return ctx.redirect('/app', 302);
  }

  return next();
});
