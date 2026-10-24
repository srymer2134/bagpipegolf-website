// The page Content-Security-Policy, applied by src/middleware.ts.
// A pure module so src/lib/csp.test.ts can pin it without loading the
// Astro middleware runtime.

export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  // See the note above on 'unsafe-inline'.
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com data:',
  "img-src 'self' data: https:",
  // Supabase + Railway + Sentry ingest.
  "connect-src 'self' https:",
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
