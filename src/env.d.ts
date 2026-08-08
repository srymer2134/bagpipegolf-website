/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

type Runtime = import('@astrojs/cloudflare').Runtime<{
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  RAILWAY_API_URL: string;
  ASSETS: Fetcher;
}>;

declare namespace App {
  interface Locals extends Runtime {
    session: import('@supabase/supabase-js').Session | null;
    user: import('@supabase/supabase-js').User | null;
  }
}
