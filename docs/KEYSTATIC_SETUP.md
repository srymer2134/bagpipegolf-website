# Keystatic — creating the GitHub App and turning the admin on

Keystatic is the browser CMS wired into this repo at `/keystatic`. It
runs in **github mode**: every save is a commit against
`srymer2134/bagpipegolf-website` made as the signed-in person, so the
site's history stays the site's history and a merge to `main` deploys
it the same way a code change does.

**There is no public "Keystatic" GitHub App to install.** That is the
first thing to know, because it is the obvious assumption and it sends
you looking through GitHub's Marketplace for something that is not
there. Keystatic has you create **your own** GitHub App, and it does
the creating for you: a wizard inside the admin UI, on first sign-in.
Installing that app on this repo is the last step of the wizard, not a
separate errand.

## Step 1 — run the wizard (one time, ~3 minutes)

```bash
cd ~/bagpipegolf-website
git checkout sam/keystatic-github-mode   # until this is merged
npm install
npm run dev
```

Then open **http://localhost:4321/keystatic** and:

1. Click **Sign in with GitHub**.
2. The app-creation screen appears. Leave both fields blank — the
   deployed URL can be added later (step 3), and the repo belongs to a
   personal account (`srymer2134`), not an organisation. Click **Create
   GitHub App**.
3. GitHub asks for a name. Anything unused works; `bagpipe-golf-cms`
   keeps it obvious. Create it.
4. GitHub asks where to install it. Choose **Only select
   repositories → `srymer2134/bagpipegolf-website`**. This is the
   install.
5. You land back on the local admin, now in github mode — a branch
   dropdown next to the repo name is how you can tell.

Keystatic writes four values into a local `.env` while that happens:

| Variable | What it is |
|---|---|
| `KEYSTATIC_GITHUB_CLIENT_ID` | the new app's client id |
| `KEYSTATIC_GITHUB_CLIENT_SECRET` | its client secret — **secret** |
| `KEYSTATIC_SECRET` | signs the admin's own session cookie — **secret** |
| `PUBLIC_KEYSTATIC_GITHUB_APP_SLUG` | the app's slug; public, ends up in the browser bundle |

`.env` is git-ignored. Don't paste any of them into a PR, an issue, or
this file — the repo is public.

## Step 2 — merge

The admin works locally the moment step 1 finishes. Merging
`sam/keystatic-github-mode` deploys `/keystatic` to bagpipegolf.com,
where it will load and then fail to sign in until step 3 is done. That
is harmless (the route is useless to a visitor either way) but it does
mean the two steps belong in the same sitting.

## Step 3 — the deployed admin

Two things, both in places that are easy to half-do:

**a. The app needs the production callback.** GitHub only redirects to
callback URLs the app lists, and the wizard registered the localhost
one. Open the app's settings —
<https://github.com/settings/installations> → the app → **App
settings** → **Add Callback URL** — and add:

```
https://bagpipegolf.com/api/keystatic/github/oauth/callback
```

Keep the `http://localhost:4321/...` one; an app can hold several, and
removing it breaks local work.

**b. The four variables have to exist in two different Cloudflare
places.** The three secrets go on the **Worker** (Settings → Variables
and Secrets, as secrets), because that is what the admin's API routes
read at request time. `PUBLIC_KEYSTATIC_GITHUB_APP_SLUG` goes in
**Workers Builds** env instead, because Astro inlines `PUBLIC_*` at
build time — the same trap `PUBLIC_SENTRY_DSN` documents at length in
`astro.config.mjs`. A value set in the wrong one of those two places
looks set and does nothing.

Worker variables:
<https://dash.cloudflare.com/4f70075f63e2e612e22030d01984c1eb/workers/services/view/bagpipegolf/production/settings>

## Who can use it

GitHub decides, not us. Keystatic asks GitHub whether the signed-in
user has **write access to this repo**, so the access list *is* the
repo's collaborator list — today Sam and `schroeder-chris`. Adding an
editor means adding a collaborator; there is no separate user list to
keep in sync, which is the main reason github mode is worth the setup
over anything bespoke.

The repo is **public**, so anything saved in the admin is public from
the moment it is saved. A stranger can load `/keystatic` and sign in;
they will see nothing they can change.

## What is editable: the FAQ

**bagpipegolf.com/faq** — the whole page. Open
<https://bagpipegolf.com/keystatic>, sign in with GitHub, click **FAQ**,
edit or add a question, hit save. Saving commits to `main`, the commit
triggers a Workers Builds rebuild, and the answer is live a couple of
minutes later. Nothing reads this repo at request time; the questions
are baked into the Worker bundle at build.

Each question is one JSON file in `content/faq/`, with an **Order**
field (lowest first, ties alphabetical). The file name is the slug and
renaming it is harmless — nothing links to it.

**One rule for whoever edits it.** Write `{sideGameCount}` instead of
typing how many side games there are. It renders as the real number,
read from `src/lib/sideGames.ts`. This is not fussiness: in October the
FAQ said "30+" while the app had 34, the home page said 30 and a rules
page said "34+", all because someone typed each one. `gameCount.test.ts`
fails CI on a typed count, and it scans `content/` as well as the pages,
so the guard did not weaken when the copy moved into a CMS.

Pages still in code, if you want the next one converted: the four Phase
0b marketing pages (Home, Features, For Hosts, For Players) are the
valuable target — they are the copy issue #424 in `fairwayiq-flutter`
is an editorial pass over. Each conversion is a real change to that
page, so they are worth doing one at a time rather than in a batch.

## Known risk, worth knowing before you debug

Keystatic issue [#1497](https://github.com/Thinkmill/keystatic/issues/1497)
reports GitHub sign-in failing with a 401 on Cloudflare — no OAuth
state cookie — and it is open as of 2026-11-13. It was filed against
`@keystatic/astro` **5.0.6**, which read its secrets from
`process.env`; that is empty in a Worker, and a missing
`KEYSTATIC_SECRET` is exactly what stops the state cookie being
signed. We are on **6.0.0**, which reads them through
`astro:env/server`'s `getSecret()` — the adapter-aware path — so the
likely cause does not apply here. "Likely" is doing real work in that
sentence: it has not been proven on our deploy. If sign-in 401s after
step 3, check for `KEYSTATIC_SECRET` on the Worker before anything
else. Reporters on the thread see the same symptom on Vercel and
Netlify, which is itself a hint that the usual cause is a missing
variable rather than the host.
