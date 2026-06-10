import { defineMiddleware } from 'astro:middleware';
import { createSupabaseClient } from './lib/supabase';

// Routes that require an authenticated Supabase session. If a request
// to one of these comes in without a session, we redirect to /login
// with a `?next=` so the user comes back to where they started.
const PROTECTED_PREFIXES = ['/app'];

// Routes a signed-in user should be bounced AWAY from (login pages,
// etc.). Sends them to /app instead.
const SIGNED_IN_BOUNCE = ['/login', '/signup', '/forgot-password'];

export const onRequest = defineMiddleware(async (ctx, next) => {
  const { pathname } = new URL(ctx.request.url);

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
  if (isProtected && !user) {
    const next = encodeURIComponent(pathname + (new URL(ctx.request.url).search || ''));
    return ctx.redirect(`/login?next=${next}`, 302);
  }

  const shouldBounceSignedIn = SIGNED_IN_BOUNCE.includes(pathname);
  if (shouldBounceSignedIn && user) {
    return ctx.redirect('/app', 302);
  }

  return next();
});
