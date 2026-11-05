# Google Analytics + Tag Manager on bagpipegolf.com: handoff for Chris

**From:** Sam (written with Claude) · **Date:** 2026-11-05 · **Status:** live

As of 2026-11-05, Google Analytics is collecting visits on the public pages of bagpipegolf.com, through Google Tag Manager. You're being made co-admin of both. This page covers what's set up, the rules, and what to do first.

---

## 1. What you have access to

| | ID | Owner account |
|---|---|---|
| **Google Tag Manager** container | `GTM-N98KQ7BX` | sam@bagpipegolf.com |
| **Google Analytics 4** property (bagpipegolf.com web stream) | `G-M85W8RCVYM` | sam@bagpipegolf.com |

You are being added to both, **at the Administrator level**, on two addresses:

- `chris@bagpipegolf.com`
- `Chrisschroeder.hq@gmail.com`

**Your first steps:**
1. Accept the invite emails from Google, for both products and both addresses.
2. Open [tagmanager.google.com](https://tagmanager.google.com). You should see the **Bagpipe Golf** account with the `bagpipegolf.com` container, and be able to **Publish**.
3. Open [analytics.google.com](https://analytics.google.com) and go to **Reports → Realtime**. Visit bagpipegolf.com on your phone, and you should appear within a minute.
4. If either doesn't show up, tell Sam which address you're signed in with.

---

## 2. How it is wired

```
bagpipegolf.com page ──loads──▶ Tag Manager container GTM-N98KQ7BX
                                      │
                                      └──▶ Google Tag G-M85W8RCVYM ──▶ Google Analytics
```

- **The website code contains only the Tag Manager container.** Google Analytics and any future tags are set up *inside Tag Manager*.
- So **adding or changing a tag is a Tag Manager publish, not a website deploy.** No engineer or code change is needed.
- The live container is **version 2** (2026-11-05). It holds one tag: a **Google Tag** with `G-M85W8RCVYM`, firing on **All Pages**.

### Which pages it runs on (and why some never will)

Tag Manager can run any script on any page it's loaded on. So the website loads it **only on the public marketing site**:

| Loads ✅ | Never loads ❌ |
|---|---|
| Home, Pricing, Features, For Hosts, For Players, FAQ | `/app/…`: everything a signed-in user sees, including billing |
| Side Games, Leagues, Tournaments, Buddies Trips | `/pay/…`: payment pages and Stripe checkouts |
| Public league and tournament pages (`/l/…`, `/t/…`) | `/join/…`: invite links carry a private token in the URL |
| **`/signup`**, on purpose: the course email lands there | `/login`, `/forgot-password`, `/reset-password`, `/delete-account` |
| Privacy, Terms, Support | Anything not on `bagpipegolf.com` (previews, local copies) |

This is enforced in the website code, not in Tag Manager, so **a trigger in Tag Manager cannot add those pages back.** If you need data from inside the signed-in app, talk to Sam: the app has its own analytics (PostHog), tied to accounts.

---

## 3. What's already being measured

- **Page views, traffic sources, location (city level), device and browser**: GA4 does these automatically.
- **Campaigns:** the course intro email links carry
  `utm_source=email`, `utm_medium=course_intro`, `utm_campaign=founding_clubs`.
  See them in **Reports → Acquisition → Traffic acquisition**, filtered by session campaign `founding_clubs`.
- **Social link clicks:** clicks on the Instagram / TikTok / X / YouTube icons send a `social_click` event into Tag Manager, with `platform`, `source` (which part of the page) and `path`.
  **This is not in GA yet.** To report it, add a **GA4 Event** tag in Tag Manager: event name `social_click`, triggered by a **Custom Event** trigger named `social_click`. Pass the platform through as a parameter if you want the per-network breakdown.

### Worth setting up early (optional)
- **Mark `sign_up` as a key event** once there is one. Today the site sends no sign-up event; it's a good first ask for engineering if you want conversion tracking.
- **Exclude internal traffic:** in GA, **Admin → Data streams → Configure tag settings → Define internal traffic**, then add your office or home IP addresses.

---

## 4. Rules, please keep to these

1. **Don't paste the "Install Google Tag Manager" snippet anywhere.** The site already loads the container. A second copy double-counts every visit.
2. **Keep Google Signals and advertising features OFF** in GA (Admin → Data collection). The privacy policy now says we don't use Google's advertising features. Turning them on would make it untrue.
3. **Anything that collects new kinds of data needs a privacy-policy update first.** That includes heatmaps or session recording, ad pixels (Meta, TikTok, LinkedIn), chat widgets, and email capture. Tell Sam before you publish, and the policy gets updated in the same change.
4. **Use Preview before Publish.** In Tag Manager, click **Preview**, enter `https://bagpipegolf.com`, and check that the tag fires where you expect. The site is set up to allow Preview mode.
5. **Name each published version** in Tag Manager, e.g. "Add social_click event". Versions are how we roll back.
6. **Some third-party scripts will be blocked,** by the website's security settings, which allow Google's tag hosts only. If a new vendor's script doesn't load, it needs a small website change; ask engineering and name the vendor.

---

## 5. What we did on 2026-11-05 (the record)

- Sam created the GA4 property (`G-M85W8RCVYM`) and the Tag Manager container (`GTM-N98KQ7BX`) under sam@bagpipegolf.com.
- **Website PR #192** (merged and deployed, `fa608df8`):
  - added the Tag Manager loader to the public pages only (the rules in §2);
  - opened the site's security settings for Google's tag hosts. Without this, the browser would have **silently blocked** Tag Manager;
  - forwarded the existing social-click events into Tag Manager;
  - **updated the privacy policy** to name Google Analytics: what it collects, cookies, not tied to accounts, no advertising features, and how to opt out.
- **Verified on the live site:**
  - the tag is on `/`, `/pricing` and `/signup`, and absent on `/login` and `/app/…`;
  - Google serves the container;
  - after Sam published the Google Tag, the live container is **version 2** and contains `G-M85W8RCVYM`.

### For engineers (where the code is)
- `bagpipegolf-website/src/lib/analytics.ts`: the container ID, the page rule, and the loader (the hostname guard and the `social_click` forwarding).
- `bagpipegolf-website/src/layouts/BaseLayout.astro`: where the loader is rendered.
- `bagpipegolf-website/src/lib/csp.ts`: the security policy entries for Google's tag hosts.
- `bagpipegolf-website/src/pages/privacy.astro`: the Google Analytics sections.

---

## 6. Open items

- [ ] Sam: add Chris (both addresses) as **Administrator** in GA and Tag Manager, with **Publish** on the container.
- [ ] Chris: accept the invites and confirm you can see Realtime.
- [ ] Chris (optional): a `social_click` GA4 Event tag (§3), and internal-traffic exclusion.
- [ ] Engineering (when asked): a `sign_up` event for conversion tracking.

Questions: Sam (sam@bagpipegolf.com).
