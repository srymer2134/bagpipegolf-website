// @ts-check
import { defineConfig } from 'astro/config';

import cloudflare from "@astrojs/cloudflare";

// Bagpipe Golf marketing + director-portal site.
//
// Deploys to Cloudflare Pages — Astro builds a fully static `dist/`
// out of the box, no adapter required for the landing-page-only
// shape. Add `@astrojs/cloudflare` when we wire server-side routes
// for the director portal (form handlers, SendGrid, AI compose
// passthrough). Free Pages tier covers 100k functions/day even
// after that.
//
// Custom domain (`bagpipegolf.com`) attaches in the Cloudflare
// Pages dashboard once Casey's GoDaddy nameserver swap completes —
// see fairwayiq-flutter/docs/DNS_MIGRATION_HANDOFF.md.
export default defineConfig({
  site: 'https://bagpipegolf.com',
  // `server` = every page runs through the Worker (needed for the auth
  // middleware + per-request Supabase data reads). Marketing pages can
  // opt back into static prerender with `export const prerender = true;`
  // once we want them SEO-snappy.
  output: 'server',
  adapter: cloudflare()
});