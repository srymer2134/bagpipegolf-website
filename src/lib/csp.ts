// The page Content-Security-Policy, applied by src/middleware.ts.
// A pure module so src/lib/csp.test.ts can pin it without loading the
// Astro middleware runtime.

// Google Tag Manager (lib/analytics.ts, 2026-11-05). gtm.js and the GA4
// library it pulls load from *.googletagmanager.com; GA hits go out by fetch
// and image beacon, which `connect-src https:` and `img-src https:` already
// cover. tagmanager.google.com + the gstatic image hosts are GTM's Preview
// mode (Tag Assistant), which the admins use to debug a container before
// publishing. frame-src is the tag's own <noscript> iframe.
const GTM_SCRIPT = 'https://*.googletagmanager.com https://tagmanager.google.com';

export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  // See the note above on 'unsafe-inline'.
  `script-src 'self' 'unsafe-inline' ${GTM_SCRIPT}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://tagmanager.google.com",
  'font-src https://fonts.gstatic.com data:',
  "img-src 'self' data: https:",
  // Supabase + Railway + Sentry ingest.
  "connect-src 'self' https:",
  'frame-src https://www.googletagmanager.com',
  "frame-ancestors 'none'",
  "base-uri 'self'",
  // Stripe's three hosted pages, and nothing else. The payments forms
  // ("Set up card payments", "Continue setup", "Pay season dues") POST
  // to our own /api/* routes, which answer 303 → connect.stripe.com
  // (onboarding) or checkout.stripe.com (Checkout). Chrome applies
  // form-action to the REDIRECT after a form post too, so with only
  // 'self' it silently cancelled the hop to Stripe and the button
  // appeared to do nothing (Sam, 2026-10-13 — the API had minted a valid
  // link on every click). The routes themselves only ever redirect to
  // Stripe-hosted URLs (isStripeUrl in src/lib/paymentsRoutes.ts).
  // billing.stripe.com is the league subscription's Customer Portal
  // ("Manage subscription"); missing from this list, the same silent
  // cancel hit that button on 2026-10-24.
  "form-action 'self' https://connect.stripe.com https://checkout.stripe.com https://billing.stripe.com",
  "object-src 'none'",
].join('; ');

// ── The Keystatic admin surface ────────────────────────────────────
//
// /keystatic is a React app from @keystatic/astro, and the policy
// above is written for OUR pages: it would break it. Two reasons, and
// both are invisible until you open the admin and find a blank panel:
//
//   * `'unsafe-eval'` — Vite's dev transform and React Refresh
//     evaluate code at runtime, so without it the admin is blank in
//     `astro dev` (middleware runs in dev too). It is scoped to these
//     two path prefixes and never served on a marketing page.
//   * `blob:` on img-src and `worker-src` — the editor builds image
//     previews and object URLs client-side.
//
// GitHub is reachable through `connect-src https:`, which the main
// policy already allows, so api.github.com needs no entry of its own.
//
// This is a looser policy on a path that can WRITE to the repo, which
// is only defensible because GitHub, not this header, is the access
// control: Keystatic asks GitHub whether the signed-in user has write
// access to srymer2134/bagpipegolf-website, and a stranger who loads
// /keystatic can sign in and see nothing it lets them change.
const KEYSTATIC_PREFIXES = ['/keystatic', '/api/keystatic'];

export const KEYSTATIC_CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  'font-src https://fonts.gstatic.com data:',
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https:",
  "worker-src 'self' blob:",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

/**
 * The policy for a given request path: the admin one under
 * /keystatic, the site one everywhere else.
 */
export function cspForPath(pathname: string): string {
  const isKeystatic = KEYSTATIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + '/'),
  );
  return isKeystatic ? KEYSTATIC_CONTENT_SECURITY_POLICY : CONTENT_SECURITY_POLICY;
}
