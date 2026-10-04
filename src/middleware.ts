import { defineMiddleware } from 'astro:middleware';
import { createSupabaseClient } from './lib/supabase';
import { handleWellKnownRequest } from './lib/wellKnown';
import { ensureSentryInit, captureServerError } from './lib/sentryServer';

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
//
// 2026-08-25: tightened the id capture from `[^/]+` to
// `tourney_[^/]+` so `/app/tournaments/new` (the wizard route
// added the same day) doesn't fall through the public gate.
// Every tournament id — mobile-created + web-created — is
// generated client-side with the `tourney_<ts>` prefix, so the
// stricter capture is safe. Adding a new tournament-id shape in
// the future = update this regex + the `newTournamentId()`
// helper in `src/lib/tournamentCreate.ts` together.
const PUBLIC_APP_PATTERNS: RegExp[] = [
  /^\/app\/tournaments\/tourney_[^/]+\/?$/,
  /^\/app\/tournaments\/tourney_[^/]+\/(leaderboard|scorecard|calcutta|payouts)\/?$/,
];

// Routes a signed-in user should be bounced AWAY from (login pages,
// etc.). Sends them to /app instead.
const SIGNED_IN_BOUNCE = ['/login', '/signup', '/forgot-password'];

export const onRequest = defineMiddleware(async (ctx, next) => {
  const { pathname } = new URL(ctx.request.url);
  const locals = ctx.locals as App.Locals;

  // Lazy Sentry init (idempotent per Worker isolate). Runs before the
  // .well-known short-circuit so a bug in the well-known handler still
  // captures. Reads `SENTRY_DSN` + `SENTRY_ENVIRONMENT` from the
  // Cloudflare env binding; silent no-op when unset (matches the app's
  // guard).
  ensureSentryInit({
    dsn: locals.env?.SENTRY_DSN,
    environment: locals.env?.SENTRY_ENVIRONMENT,
  });

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
      locals,
    });
    const { data } = await supabase.auth.getUser();
    user = data.user ?? null;
    if (user) {
      const { data: sessionData } = await supabase.auth.getSession();
      session = sessionData.session ?? null;
    }
  } catch (err) {
    console.error('[middleware] supabase init failed', err);
    // Non-fatal — Supabase init failure means unauthenticated view of
    // the site, which is the intended fallback. Still worth capturing
    // so a Cloudflare-side or upstream Supabase incident shows up in
    // Sentry instead of just Worker logs.
    captureServerError(err, {
      path: pathname,
      tags: { stage: 'middleware.supabase_init' },
    });
  }

  locals.session = session;
  locals.user = user;

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

  // Wrap the downstream chain (page renders, API routes) in a
  // try/catch so an uncaught exception surfaces to Sentry with the
  // path + user context. Rethrow so Astro's own error boundary still
  // renders the standard 500 page — we're only tapping the wire, not
  // altering it.
  try {
    const res = await next();
    return withSecurityHeaders(res);
  } catch (err) {
    captureServerError(err, {
      path: pathname,
      userId: user?.id ?? null,
      tags: { stage: 'page_render' },
    });
    throw err;
  }
});

// ── Security headers (PA-S6) ───────────────────────────────────────
//
// The site shipped with none. A CSP is the one that matters here:
// the auth cookie is now httpOnly, so the remaining XSS prize is
// acting as the user in-page, and a script-src allow-list is what
// takes that away.
//
// 🚨 THE ALLOW-LIST IS NOT DECORATIVE — it is derived from what the
// site actually loads, and getting it wrong breaks the site silently
// for visitors while looking fine in dev:
//
//   * `'unsafe-inline'` for script-src is REQUIRED. Astro's
//     `is:inline` scripts are how every interactive page works
//     (pairings, competitions, profile, league sign-up, the nav),
//     and they carry no nonce. Removing it is a real improvement but
//     it is a refactor of every page, not a header change.
//   * fonts.googleapis.com / fonts.gstatic.com — the webfonts.
//   * Sentry needs `connect-src` to its ingest host once a DSN is
//     set (#90 merged 10-02); `https:` on connect-src covers it
//     without hard-coding an org id.
//
// Report-only would be the cautious first step, but the three
// directives below are narrow enough to enforce, and a
// report-only CSP with nobody reading the reports is theatre.
function withSecurityHeaders(res: Response): Response {
  // Never rewrite a redirect or a response already streaming — the
  // body is consumed by then and re-wrapping can drop the Location.
  const h = new Headers(res.headers);

  h.set('Content-Security-Policy', [
    "default-src 'self'",
    // See the note above on 'unsafe-inline'.
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    'font-src https://fonts.gstatic.com data:',
    "img-src 'self' data: https:",
    // Supabase + Railway + Sentry ingest.
    "connect-src 'self' https:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; '));

  h.set('X-Content-Type-Options', 'nosniff');
  h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Belt to CSP's frame-ancestors braces, for older browsers.
  h.set('X-Frame-Options', 'DENY');

  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: h,
  });
}
