import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Stripe's marks terms (stripe.com/legal/marks) forbid altering the badge
// and limit it to pages about Stripe-run payments. These keep both true.
const BADGE = 'public/brand/powered-by-stripe.svg';
// SHA-256 of "Powered by Stripe - black.svg" from Stripe's
// Powered_by_Stripe-badge.zip, downloaded 2026-10-26.
const STRIPE_BLACK_SHA256 = 'e434f84af23af5d3ab6dbe7cfc9f6fc6009d95d1986ad6d529c2760ec18a524b';

const read = (p: string) => readFileSync(p, 'utf8');

describe('Powered by Stripe badge', () => {
  it('is Stripe’s file, unaltered', () => {
    const hash = createHash('sha256').update(readFileSync(BADGE)).digest('hex');
    expect(hash).toBe(STRIPE_BLACK_SHA256);
  });

  it('links to stripe.com, as Stripe asks', () => {
    expect(read('src/components/payments/PoweredByStripe.astro')).toContain('href="https://stripe.com"');
  });

  it.each([
    'src/pages/pricing.astro',
    'src/components/payments/PayButton.astro',
    'src/pages/app/billing/index.astro',
  ])('shows on the payment surface %s', (p) => {
    expect(read(p)).toContain('<PoweredByStripe');
  });

  it('is not site-wide — the marks belong only beside Stripe payments', () => {
    for (const p of ['src/components/Footer.astro', 'src/components/SiteNav.astro', 'src/layouts/BaseLayout.astro']) {
      expect(read(p)).not.toContain('PoweredByStripe');
    }
  });
});
