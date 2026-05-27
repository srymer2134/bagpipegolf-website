# bagpipegolf.com

Marketing + (eventually) director-portal site for **Bagpipe Golf** — the
golf caddie + scorecard + side-bet engine app. Companion to the
[fairwayiq-flutter](https://github.com/yerapat/fairwayiq-flutter) iOS
+ Android client and the
[fairwayiq-api](https://github.com/yerapat/fairwayiq-api) Railway
backend.

## Stack

- **Framework**: [Astro 5](https://astro.build) — static-first
  (server islands available when we need them)
- **Hosting**: Cloudflare Pages (free tier; same Cloudflare account
  that holds the `bagpipegolf.com` DNS zone)
- **Domain**: `bagpipegolf.com` (attaches once Casey's GoDaddy
  nameserver swap completes — see the DNS handoff doc in the
  Flutter repo)

## Develop locally

```bash
npm install
npm run dev          # http://localhost:4321
npm run build        # → dist/
npm run preview      # serve dist/ locally to smoke-test
```

## Deploy

Cloudflare Pages auto-builds on push to `main`. The first time:

1. Cloudflare dashboard → Workers & Pages → **Create application** →
   **Pages** → **Connect to Git**.
2. Authorise the `yerapat` GitHub org if not already, select
   `bagpipegolf-website`.
3. Framework preset: **Astro** (auto-detected).
4. Build command: `npm run build` (default)
5. Output directory: `dist` (default)
6. Save and Deploy. First build takes ~60s.

After the first deploy succeeds, every push to `main` rebuilds
automatically. PRs get unique preview URLs.

Custom domain (`bagpipegolf.com`) attaches under **Pages →
Custom domains** once DNS resolves to Cloudflare.

## File map

```
public/
  bagpipe-golf-logo.jpg     ← Logo2Y, copied from Flutter assets/branding
  favicon.svg               ← inline-SVG mark
src/
  layouts/BaseLayout.astro  ← <head> + shared CSS variables
  pages/index.astro         ← landing page (single-file v1)
astro.config.mjs            ← site URL only; no adapter yet
package.json
tsconfig.json
```

## Roadmap

- v0.1 (this commit): single-page landing with hero, feature triad,
  director value-prop, coming-soon strip, footer
- v0.2: split into Home / For Directors / Pricing pages; add a
  Markdown-driven blog at `/posts`
- v0.3: director portal (sign in via Supabase Auth, list-my-events,
  send-comms-blast). Requires `@astrojs/cloudflare` adapter so
  Pages Functions can sign Supabase JWTs server-side.

Updates / brand changes belong in this repo only. The Logo2Y image
file is duplicated here from the Flutter repo for hosting
isolation; if the brand mark changes, copy it across in one step.
