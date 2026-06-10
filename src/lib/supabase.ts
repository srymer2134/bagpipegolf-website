import { createServerClient, parseCookieHeader, serializeCookieHeader } from '@supabase/ssr';
import type { APIContext, AstroCookies } from 'astro';
import type { SupabaseClient } from '@supabase/supabase-js';

type SupaCtx = {
  request: Request;
  cookies: AstroCookies;
  locals: App.Locals;
};

export function createSupabaseClient(ctx: SupaCtx): SupabaseClient {
  const env = ctx.locals.runtime?.env;
  const url = env?.SUPABASE_URL;
  const anon = env?.SUPABASE_ANON_KEY;

  if (!url || !anon) {
    throw new Error(
      'SUPABASE_URL / SUPABASE_ANON_KEY missing from runtime env. ' +
        'Set them in .dev.vars (local) or via wrangler secret / Cloudflare dashboard (prod).',
    );
  }

  return createServerClient(url, anon, {
    cookies: {
      getAll() {
        return parseCookieHeader(ctx.request.headers.get('Cookie') ?? '');
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          ctx.cookies.set(name, value, {
            path: '/',
            sameSite: 'lax',
            secure: import.meta.env.PROD,
            httpOnly: true,
            ...options,
          });
        });
      },
    },
  });
}

export function createSupabaseFromApi(ctx: APIContext): SupabaseClient {
  return createSupabaseClient({
    request: ctx.request,
    cookies: ctx.cookies,
    locals: ctx.locals as App.Locals,
  });
}
