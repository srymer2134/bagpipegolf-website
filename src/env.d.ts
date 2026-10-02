/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

type Runtime = import('@astrojs/cloudflare').Runtime<{
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  // Railway backend base URL — used by the tournament-create + course-
  // search proxies under src/pages/api/. Single env for now
  // (fairwayiqmobile-production.up.railway.app); if a staging Railway
  // arrives, wire it via wrangler env-scoped secrets rather than a
  // second binding.
  RAILWAY_API_URL: string;
  // Sentry — server-side crash reporting for the Worker. When unset
  // (local dev / no Sentry account) the SDK no-ops silently, matching
  // the app's guard in main.dart. Client-side DSN is
  // `PUBLIC_SENTRY_DSN` (Astro's convention for browser-exposed env
  // vars) and lives in the build environment, not this binding map.
  SENTRY_DSN?: string;
  // Deploy environment label ('production' | 'preview' | 'development').
  // Filters dev crashes out of the prod project's dashboard the same
  // way the app's `beforeSend` hook does. Not required — falls back to
  // 'production' when unset.
  SENTRY_ENVIRONMENT?: string;
  ASSETS: Fetcher;
}>;

declare namespace App {
  interface Locals extends Runtime {
    session: import('@supabase/supabase-js').Session | null;
    user: import('@supabase/supabase-js').User | null;
  }
}
