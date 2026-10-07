// @ts-check
import { defineConfig } from 'astro/config';

import cloudflare from "@astrojs/cloudflare";
import sentry from "@sentry/astro";
import sitemap from "@astrojs/sitemap";
import { sideGames } from "./src/lib/sideGames.ts";

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
      // Every internal link on the site is slash-less (`href="/faq"`), and
      // both forms serve 200, so list the form the site itself links to.
      // The root stays `https://bagpipegolf.com/`.
      serialize: (item) => ({
        ...item,
        url: item.url.replace(/(?<=\.com\/.+)\/$/, ''),
      }),
    }),
    sentry({
      // Client DSN is a public value (embedded in the browser bundle).
      // `PUBLIC_*` is Astro's convention for exposing env vars to the
      // client. When unset (local dev without a Sentry project), the
      // integration no-ops silently — matches the app's own guard.
      dsn: process.env.PUBLIC_SENTRY_DSN,
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