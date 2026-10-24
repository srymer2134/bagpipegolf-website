import { describe, expect, it } from 'vitest';
import { CONTENT_SECURITY_POLICY } from './csp';

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

  it('keeps the rest of the policy locked down', () => {
    expect(directive('frame-ancestors')).toBe("frame-ancestors 'none'");
    expect(directive('object-src')).toBe("object-src 'none'");
    expect(directive('base-uri')).toBe("base-uri 'self'");
  });
});
