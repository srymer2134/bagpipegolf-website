// Permanent diagnostic. Reports the shape of the Cloudflare Worker's
// env bindings surfaced through Astro's `locals.runtime.env`. Originally
// added 2026-07-28 to debug a "SUPABASE_URL missing from runtime env"
// production incident; promoted to a permanent ops surface 2026-08-13
// after bagpipegolf-website#36 flagged the class of misconfig
// (SUPABASE_URL pointing at the wrong project) that this endpoint
// makes cheap to verify.
//
// The endpoint intentionally never exposes secret VALUES. It does
// expose the SUPABASE_URL project ref (the 20-char subdomain) — that
// string is NOT a secret (it appears in every JWT `iss` claim, every
// auth cookie name, every browser request) and is the single fastest
// way to answer "is the website pointed at DEV or PROD Supabase?"
// without curl-inspecting cookies from a signed-in session.
//
// Read-only, no side effects.

import type { APIRoute } from 'astro';
import { extractSupabaseProjectRef } from '../../lib/supabase';

const KNOWN_SUPABASE_PROJECT_REFS: Readonly<Record<string, string>> = {
  eqhxlpvglxmoqmrqczqr: 'dev',
  doqjphzxatgawfznrtfn: 'prod',
};

// 🚨 ADMIN-ONLY (PA-S6). This enumerates which env bindings the
// Worker has. That is a map of the deployment for anyone probing it —
// which integrations exist, which secrets are set, which are missing —
// and it answered anonymously.
//
// Gated on the same admin allow-list the app uses
// (`kFairwayiqAdminEmails`), kept here as a literal because the
// website has no import path into the Flutter repo. Six entries as of
// 2026-10-02; if it drifts, the diagnostic going quiet for an admin is
// the safe failure.
const ADMIN_EMAILS = new Set([
  'sonofahero2@gmail.com',
  'swrymer@gmail.com',
  'cjkeefe@comcast.net',
  'yerapat@gmail.com',
  'nwrymer10@gmail.com',
  'chrisschroeder.hq@gmail.com',
]);

export const GET: APIRoute = async ({ locals }) => {
  const email = (locals as App.Locals)?.user?.email?.toLowerCase().trim();
  if (!email || !ADMIN_EMAILS.has(email)) {
    // 404, not 403 — an unauthenticated prober should not learn the
    // route exists.
    return new Response('Not found', { status: 404 });
  }

  const runtime = (locals as any)?.runtime;
  const env = runtime?.env;

  const supabaseUrl =
    typeof env?.SUPABASE_URL === 'string' ? env.SUPABASE_URL : null;
  const ref = supabaseUrl ? extractSupabaseProjectRef(supabaseUrl) : null;
  const supabaseEnv = ref
    ? (KNOWN_SUPABASE_PROJECT_REFS[ref] ?? 'unknown')
    : null;

  const summary = {
    has_runtime: !!runtime,
    has_runtime_env: !!env,
    env_keys: env ? Object.keys(env).sort() : [],
    SUPABASE_URL_present: !!env?.SUPABASE_URL,
    SUPABASE_URL_type: typeof env?.SUPABASE_URL,
    SUPABASE_URL_len:
      typeof env?.SUPABASE_URL === 'string' ? env.SUPABASE_URL.length : null,
    // Non-secret project identifier — see file header for why exposing
    // this is safe. Answers "which Supabase project is the site wired
    // to?" without a cookie inspection dance.
    SUPABASE_URL_ref: ref,
    SUPABASE_URL_env: supabaseEnv,
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
