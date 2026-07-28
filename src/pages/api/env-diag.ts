// TEMP diagnostic. Reports whether the Cloudflare Worker's env
// bindings surface through Astro's `locals.runtime.env`. Delete
// after we resolve the "SUPABASE_URL missing from runtime env"
// production incident (2026-07-28).
//
// The endpoint never exposes secret VALUES — only presence + type.
// Read-only, no side effects.

import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ locals }) => {
  const runtime = (locals as any)?.runtime;
  const env = runtime?.env;

  const summary = {
    has_runtime: !!runtime,
    has_runtime_env: !!env,
    env_keys: env ? Object.keys(env).sort() : [],
    SUPABASE_URL_present: !!env?.SUPABASE_URL,
    SUPABASE_URL_type: typeof env?.SUPABASE_URL,
    SUPABASE_URL_len:
      typeof env?.SUPABASE_URL === 'string' ? env.SUPABASE_URL.length : null,
    SUPABASE_ANON_KEY_present: !!env?.SUPABASE_ANON_KEY,
    SUPABASE_ANON_KEY_type: typeof env?.SUPABASE_ANON_KEY,
    SUPABASE_ANON_KEY_len:
      typeof env?.SUPABASE_ANON_KEY === 'string'
        ? env.SUPABASE_ANON_KEY.length
        : null,
    ASSETS_present: !!env?.ASSETS,
  };

  return new Response(JSON.stringify(summary, null, 2), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};
