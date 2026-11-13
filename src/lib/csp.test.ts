import { describe, expect, it } from 'vitest';
import {
  CONTENT_SECURITY_POLICY,
  KEYSTATIC_CONTENT_SECURITY_POLICY,
  cspForPath,
} from './csp';

const directive = (name: string) =>
  CONTENT_SECURITY_POLICY.split(';').map((d) => d.trim()).find((d) => d.startsWith(name + ' '));

describe('page CSP form-action', () => {
  it('lets the payments forms redirect to Stripe-hosted onboarding and Checkout', () => {
    // Chrome enforces form-action on the redirect after a POST. Without these
    // two hosts, "Set up card payments" / "Continue setup" / "Pay season dues"
    // silently do nothing (2026-10-13).
    const fa = directive('form-action');
    expect(fa).toBeDefined();
    expect(fa).toContain("'self'");
    expect(fa).toContain('https://connect.stripe.com');
    expect(fa).toContain('https://checkout.stripe.com');
    expect(fa).toContain('https://billing.stripe.com');
  });

  it('allows nothing broader than those two Stripe hosts', () => {
    const sources = directive('form-action')!.split(/\s+/).slice(1);
    expect(sources.sort()).toEqual(["'self'", 'https://billing.stripe.com', 'https://checkout.stripe.com', 'https://connect.stripe.com'].sort());
  });

  it('lets Google Tag Manager load (2026-11-05) and nothing script-wise beyond it', () => {
    const ss = directive('script-src')!.split(/\s+/).slice(1);
    expect(ss.sort()).toEqual(
      ["'self'", "'unsafe-inline'", 'https://*.googletagmanager.com', 'https://tagmanager.google.com'].sort(),
    );
    expect(directive('frame-src')).toBe('frame-src https://www.googletagmanager.com');
  });

  it('keeps the rest of the policy locked down', () => {
    expect(directive('frame-ancestors')).toBe("frame-ancestors 'none'");
    expect(directive('object-src')).toBe("object-src 'none'");
    expect(directive('base-uri')).toBe("base-uri 'self'");
  });
});

describe('cspForPath', () => {
  it('serves the site policy on a marketing page', () => {
    expect(cspForPath('/')).toBe(CONTENT_SECURITY_POLICY);
    expect(cspForPath('/features')).toBe(CONTENT_SECURITY_POLICY);
    // A path that merely starts with the same letters is not the admin.
    expect(cspForPath('/keystatic-notes')).toBe(CONTENT_SECURITY_POLICY);
  });

  it('serves the admin policy on the Keystatic UI and its API routes', () => {
    for (const p of ['/keystatic', '/keystatic/collection/posts', '/api/keystatic/github/login']) {
      expect(cspForPath(p)).toBe(KEYSTATIC_CONTENT_SECURITY_POLICY);
    }
  });

  it("gives the admin 'unsafe-eval' and blob: — and keeps them off every other page", () => {
    // The admin is a React app we don't author; without these it renders blank.
    expect(KEYSTATIC_CONTENT_SECURITY_POLICY).toContain("'unsafe-eval'");
    expect(KEYSTATIC_CONTENT_SECURITY_POLICY).toContain('blob:');
    expect(CONTENT_SECURITY_POLICY).not.toContain("'unsafe-eval'");
    expect(CONTENT_SECURITY_POLICY).not.toContain('blob:');
  });

  it('keeps the admin un-framable and script-host-free', () => {
    const d = (name: string) =>
      KEYSTATIC_CONTENT_SECURITY_POLICY.split(';').map((x) => x.trim()).find((x) => x.startsWith(name + ' '));
    expect(d('frame-ancestors')).toBe("frame-ancestors 'none'");
    expect(d('object-src')).toBe("object-src 'none'");
    expect(d('script-src')!.split(/\s+/).slice(1).sort()).toEqual(
      ["'self'", "'unsafe-eval'", "'unsafe-inline'"].sort(),
    );
  });
});
