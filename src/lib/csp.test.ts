import { describe, expect, it } from 'vitest';
import { CONTENT_SECURITY_POLICY, EDITOR_CONTENT_SECURITY_POLICY, isEditorPath } from './csp';

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

describe('content editor CSP (2026-11-06)', () => {
  it('adds blob: images for the editor only, and changes nothing else', () => {
    expect(directive('img-src')).toBe("img-src 'self' data: https:");
    expect(EDITOR_CONTENT_SECURITY_POLICY).toContain("img-src 'self' data: blob: https:");
    expect(EDITOR_CONTENT_SECURITY_POLICY.replace(' blob:', '')).toBe(CONTENT_SECURITY_POLICY);
  });

  it('applies to /keystatic and its sub-pages, not look-alike paths', () => {
    expect(isEditorPath('/keystatic')).toBe(true);
    expect(isEditorPath('/keystatic/singleton/homeHero')).toBe(true);
    expect(isEditorPath('/keystatic-tips')).toBe(false);
    expect(isEditorPath('/')).toBe(false);
  });
});
