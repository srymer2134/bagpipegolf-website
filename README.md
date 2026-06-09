# bagpipegolf.com

Marketing + (eventually) full player + director portal for **Bagpipe Golf** — the
golf caddie + scorecard + side-bet engine app. Companion to the
[fairwayiq-flutter](https://github.com/yerapat/fairwayiq-flutter) iOS
+ Android client and the
[fairwayiq-api](https://github.com/yerapat/fairwayiq-api) Railway
backend.

## Stack

- **Framework**: [Astro 5](https://astro.build) in `output: 'server'` mode
- **Adapter**: [`@astrojs/cloudflare`](https://docs.astro.build/en/guides/integrations-guide/cloudflare/) — every page runs as a Cloudflare Worker
- **Auth + data**: Supabase (same project as the mobile app), via [`@supabase/ssr`](https://github.com/supabase/auth-helpers) with cookie sessions
- **Hosting**: Cloudflare Workers (with Pages-style asset serving). Custom domain `bagpipegolf.com` + `www.bagpipegolf.com`.

## Develop locally

```bash
npm install
cp .dev.vars.example .dev.vars   # then fill in the dev Supabase URL + anon key
npm run dev                      # http://localhost:4321
npm run build                    # → dist/
npm run preview                  # serve dist/ via wrangler
```

`.dev.vars` carries the local Supabase URL + anon key (the same ones the
Flutter app uses against dev). They are picked up automatically by the
`@astrojs/cloudflare` dev shim.

## Deploy

```bash
npm run deploy                   # builds + wrangler deploy
```

For production, the same two vars must exist on the Worker:

```bash
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_ANON_KEY
```

(or set them under Cloudflare dashboard → Workers → Settings → Variables.)

## Site map

```
PUBLIC MARKETING                  PUBLIC MICROSITE         AUTH              APP (Supabase-gated)
─────────────────                 ──────────────────       ──────            ─────────────────────
/                Home             /t/[id]   tourney page   /login            /app                        Dashboard
/features        Features         /t/[id]/leaderboard      /signup           /app/profile                Profile
/for-hosts       For TDs / LDs    /l/[id]   league page    /forgot-password  /app/history                Round history
/for-players     For players      /l/[id]/standings                          /app/tournaments            My tournaments
/pricing         Pricing                                                     /app/tournaments/[id]       Tournament overview
/faq             FAQ                                                         /app/tournaments/[id]/leaderboard
/privacy         App Store req.                                              /app/tournaments/[id]/scorecard
/terms           App Store req.                                              /app/tournaments/[id]/calcutta
/support         Contact + FAQ                                               /app/tournaments/[id]/payouts
                                                                             /app/tournaments/[id]/manage   ← TD
                                                                             /app/leagues                My leagues
                                                                             /app/leagues/[id]           League overview
                                                                             /app/leagues/[id]/standings
                                                                             /app/leagues/[id]/schedule
                                                                             /app/leagues/[id]/manage    ← LD
```

Auth is enforced by `src/middleware.ts`. Any `/app/*` path without a valid
Supabase session returns `302 /login?next=<path>`. `/login`, `/signup`,
`/forgot-password` bounce a signed-in user to `/app`.

## File map

```
public/
  bagpipe-golf-logo.jpg     ← Logo2Y, copied from Flutter assets/branding
  favicon.svg               ← inline-SVG mark
src/
  layouts/BaseLayout.astro  ← shared <head>, nav + footer, global CSS
  components/
    SiteNav.astro           ← top nav (switches signed-out / signed-in)
    Footer.astro            ← shared site footer
    TournamentSubnav.astro  ← per-tournament tabs (Overview / Leaderboard / …)
    LeagueSubnav.astro      ← per-league tabs (Overview / Standings / …)
  lib/
    supabase.ts             ← createServerClient factory for SSR + cookie session
  middleware.ts             ← per-request session resolve + protect /app/*
  env.d.ts                  ← Astro.locals typings (runtime, session, user)
  pages/
    index.astro             ← landing
    {features,for-hosts,for-players,pricing,faq,privacy,terms,support}.astro
    {login,signup,forgot-password}.astro
    api/auth/signout.ts     ← POST signs out + redirects
    t/[id].astro            ← public tournament microsite
    l/[id].astro            ← public league microsite
    app/                    ← all auth-gated routes
      index.astro              dashboard
      profile.astro
      history.astro
      tournaments/index.astro
      tournaments/[id]/{index,leaderboard,scorecard,calcutta,payouts,manage}.astro
      leagues/index.astro
      leagues/[id]/{index,standings,schedule,manage}.astro
astro.config.mjs            ← output: 'server' + cloudflare adapter
wrangler.jsonc              ← Worker bindings + custom-domain routes
```

## Roadmap

- ✅ **v0.1** — single-page landing
- ✅ **v0.2** — site IA + nav + footer + all marketing pages + public per-event
  microsite stubs + Supabase auth (login / signup / forgot-password) + the full
  `/app/*` route shell with auth guard.
- **Next (v0.3)** — wire real Supabase reads on the `/app/*` pages: list-my-tournaments,
  list-my-leagues, profile editor round-trip, round history, public tournament
  leaderboard at `/t/[id]/leaderboard`.
- **v0.4** — director portal: TD lifecycle controls, communications blast (push /
  email / SMS), AI-assisted compose. LD-equivalent for leagues.
- **v0.5+** — sponsor surfaces, kiosk-mode TV leaderboard, online registration
  + payments.

Updates / brand changes belong in this repo only. The Logo2Y image
file is duplicated here from the Flutter repo for hosting isolation; if
the brand mark changes, copy it across in one step.
