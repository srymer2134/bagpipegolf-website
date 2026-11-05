import { describe, expect, it } from 'vitest';
import { GTM_CONTAINER_ID, gtmAllowedPath, gtmLoaderScript } from './analytics';

describe('gtmAllowedPath', () => {
  it('loads on the public marketing site, including /signup', () => {
    for (const p of ['/', '/pricing', '/features', '/side-games/wolf', '/leagues', '/signup', '/l/abc', '/t/xyz', '/privacy']) {
      expect(gtmAllowedPath(p), p).toBe(true);
    }
  });
  it('never loads on signed-in, payment, invite or password pages', () => {
    for (const p of [
      '/app', '/app/', '/app/billing', '/app/tournaments/tourney_1/manage',
      '/pay/abc', '/api/billing/checkout-session', '/join/tok123',
      '/login', '/forgot-password', '/reset-password', '/delete-account', '/APP/billing',
    ]) {
      expect(gtmAllowedPath(p), p).toBe(false);
    }
  });
  it('does not over-match a public page that merely starts with the same letters', () => {
    expect(gtmAllowedPath('/apple-guide')).toBe(true);
    expect(gtmAllowedPath('/payments-explained')).toBe(true);
  });
});

describe('gtmLoaderScript', () => {
  it('loads the right container, only on the production hostnames', () => {
    const s = gtmLoaderScript();
    expect(GTM_CONTAINER_ID).toBe('GTM-N98KQ7BX');
    expect(s).toContain('"GTM-N98KQ7BX"');
    expect(s).toContain('https://www.googletagmanager.com/gtm.js?id=');
    expect(s).toContain('["bagpipegolf.com","www.bagpipegolf.com"]');
  });
  it('forwards the existing social-click events', () => {
    expect(gtmLoaderScript()).toContain("addEventListener('bpg:social_click'");
  });
});
