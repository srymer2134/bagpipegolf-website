// @ts-check
import { defineConfig } from 'astro/config';

import cloudflare from "@astrojs/cloudflare";
import sentry from "@sentry/astro";
import sitemap from "@astrojs/sitemap";
import { sideGames } from "./src/lib/sideGames.ts";
import { canonicalUrl } from "./src/lib/canonical.ts";

// Paths that must never appear in the sitemap: signed-in surfaces, API
// routes, Stripe return pages, auth forms, and per-event/per-league
// share links (user-generated, often private, and not marketing pages).
const NOT_IN_SITEMAP =
  /^https:\/\/bagpipegolf\.com\/(app|api|pay|join|l|t)(\/|$)|\/(login|signup|forgot-password)\/?$/;

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
//
// Sentry client-side crash reporting — mirrors the Flutter app's
// Sentry setup (matching org + a website-specific project). The
// integration injects the browser SDK automatically; the
// Cloudflare Worker side is wrapped separately in
// src/lib/sentryServer.ts. See `.dev.vars.example` for the env
// var contract.
export default defineConfig({
  site: 'https://bagpipegolf.com',
  // `server` = every page runs through the Worker (needed for the auth
  // middleware + per-request Supabase data reads). Marketing pages can
  // opt back into static prerender with `export const prerender = true;`
  // once we want them SEO-snappy.
  output: 'server',
  adapter: cloudflare(),
  integrations: [
    // sitemap-index.xml + sitemap-0.xml at build time. With
    // `output: 'server'` the integration sees only routes without
    // params, so the side-game detail pages (`/side-games/[slug]`) are
    // listed explicitly from the same data the page renders from.
    // `robots.txt` (public/) points crawlers here.
    sitemap({
      customPages: sideGames.map(
        (g) => `https://bagpipegolf.com/side-games/${g.slug}`,
      ),
      filter: (page) => !NOT_IN_SITEMAP.test(page),
      // Same rule as every page's <link rel="canonical"> and og:url
      // (src/lib/canonical.ts), so the sitemap never lists a URL the page
      // itself says is not canonical.
      serialize: (item) => ({ ...item, url: canonicalUrl(item.url) }),
    }),
    sentry({
      // Client DSN is a public value (embedded in the browser bundle).
      // `PUBLIC_*` is Astro's convention for exposing env vars to the
      // client. When unset (local dev without a Sentry project), the
      // integration no-ops silently — matches the app's own guard.
      // Falls back to the literal below when PUBLIC_SENTRY_DSN is not in
      // the build environment.
      //
      // WHY THE LITERAL IS COMMITTED, in a PUBLIC repo. This value is
      // compiled into the browser bundle and served from
      // bagpipegolf.com — anyone can already read it with View Source,
      // so committing it adds discoverability, not exposure. A Sentry
      // DSN is also write-only: it can submit events, never read them.
      //
      // It is here because the integration reads `process.env` at BUILD
      // time, which means the value has to exist in the Workers Builds
      // environment, not just the Worker's runtime bindings. That is a
      // separate dashboard field people reliably miss — and when it is
      // missing the SDK no-ops in silence, which is exactly how this
      // sat unwired while looking finished. A committed default cannot
      // be forgotten.
      //
      // Setting PUBLIC_SENTRY_DSN in the environment still overrides
      // this, so a staging project can point elsewhere without a code
      // change.
      //
      // Project `javascript-astro`, org `taybuta`. Added 2026-10-12.
      dsn:
        process.env.PUBLIC_SENTRY_DSN ||
        'https://c8936f9d6342be934fbd73f18c6ff79e@o4512243792805888.ingest.us.sentry.io/4512244106461184',
      // Errors only. Performance / session-replay flipped off; enable
      // per-need later. Mirrors the app's `tracesSampleRate: 0.0`.
      tracesSampleRate: 0,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
      // Explicitly opt OUT of PII collection. Sentry defaults to `false`
      // but we set it so a future SDK major can't flip the default under
      // us — same guard the app uses in main.dart.
      sendDefaultPii: false,
      // Source-maps upload requires a Sentry auth token
      // (`SENTRY_AUTH_TOKEN` env var). Safe to omit when unset — the
      // build just skips the upload step; SDK still runs.
      sourceMapsUploadOptions: {
        project: process.env.SENTRY_PROJECT,
        authToken: process.env.SENTRY_AUTH_TOKEN,
      },
    }),
  ],
});