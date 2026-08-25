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
  ASSETS: Fetcher;
}>;

declare namespace App {
  interface Locals extends Runtime {
    session: import('@supabase/supabase-js').Session | null;
    user: import('@supabase/supabase-js').User | null;
  }
}
