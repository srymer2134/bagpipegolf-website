import { createServerClient, parseCookieHeader, serializeCookieHeader } from '@supabase/ssr';
import type { APIContext, AstroCookies } from 'astro';
import type { SupabaseClient } from '@supabase/supabase-js';

type SupaCtx = {
  request: Request;
  cookies: AstroCookies;
  locals: App.Locals;
};

// ── Known Supabase project refs ─────────────────────────────────
//
// Refs (the 20-char string before `.supabase.co`) are NOT secrets — they
// appear in every JWT `iss` claim, every auth cookie name, every browser
// request. Safe to embed here + safe to expose via /api/env-diag.
//
// Purpose: refuse to serve when SUPABASE_URL points at an unrecognized
// project. Prevents the "silent 401 on every course search" failure mode
// documented in bagpipegolf-website#36 (2026-08-13) — where the website
// pointing at PROD Supabase while the Railway API points at DEV would
// authenticate the user but reject every downstream API call.
//
// To add a new project (e.g. staging), add its ref here and it'll be
// accepted. To point the website at the "wrong" project on purpose (e.g.
// for a one-off pre-prod cutover test), temporarily add its ref here in
// a scoped commit — never bypass the check silently.
const KNOWN_SUPABASE_PROJECT_REFS: Readonly<Record<string, string>> = {
  eqhxlpvglxmoqmrqczqr: 'dev',
  doqjphzxatgawfznrtfn: 'prod',
};

/**
 * Extract the 20-char project ref from a Supabase URL.
 * `https://eqhxlpvglxmoqmrqczqr.supabase.co` → `eqhxlpvglxmoqmrqczqr`
 * Returns null on malformed URLs.
 */
export function extractSupabaseProjectRef(url: string): string | null {
  try {
    const host = new URL(url).hostname;
    // Must be a `<20-char>.supabase.co` shape — reject `https://evil.com`
    // that happens to have `.supabase.co` embedded elsewhere.
    const parts = host.split('.');
    if (parts.length !== 3 || parts[1] !== 'supabase' || parts[2] !== 'co') {
      return null;
    }
    return parts[0];
  } catch {
    return null;
  }
}

/**
 * Refuse to build a Supabase client when SUPABASE_URL is unrecognized.
 * Fail-loud (throw with an actionable message) instead of fail-silent
 * (build a client that authenticates but then 401s on every downstream
 * API call because the API is pointed at a different project).
 *
 * The env label ('dev' / 'prod') returned is used by /api/env-diag so
 * ops can `curl` the endpoint and get an unambiguous answer without
 * cross-referencing project refs by hand.
 */
export function assertKnownSupabaseUrl(url: string): { ref: string; env: string } {
  const ref = extractSupabaseProjectRef(url);
  if (!ref) {
    throw new Error(
      `SUPABASE_URL "${url}" is not a valid Supabase project URL. ` +
        'Expected: https://<20-char-ref>.supabase.co. ' +
        'Fix the Worker secret before the site can serve.',
    );
  }
  const env = KNOWN_SUPABASE_PROJECT_REFS[ref];
  if (!env) {
    const known = Object.entries(KNOWN_SUPABASE_PROJECT_REFS)
      .map(([r, e]) => `${e}=${r}`)
      .join(', ');
    throw new Error(
      `SUPABASE_URL project ref "${ref}" is not in the known allowlist ` +
        `(${known}). Refusing to serve with an unknown Supabase project — ` +
        'this would silently 401 every downstream API call because the ' +
        'Railway API expects a token from a specific project. ' +
        'To add a new project, edit KNOWN_SUPABASE_PROJECT_REFS in ' +
        'src/lib/supabase.ts. See bagpipegolf-website#36 for the failure ' +
        'mode this prevents.',
    );
  }
  return { ref, env };
}

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

  // Fail-closed if the Worker's SUPABASE_URL points at an unknown project.
  // Throws with an actionable error — never returns silently on bad config.
  assertKnownSupabaseUrl(url);

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
