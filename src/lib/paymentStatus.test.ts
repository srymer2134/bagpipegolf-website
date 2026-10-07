import { describe, expect, it } from 'vitest';

import {
  PAYMENT_STATUSES,
  formatAmountCents,
  isSettled,
  parsePaymentStatus,
  statusLabel,
  statusTone,
} from './paymentStatus';

describe('payment status vocabulary', () => {
  it('covers every status the contract defines', () => {
    // If the app adds one, this list is where the website learns about
    // it — and a missing entry would render a blank chip.
    expect([...PAYMENT_STATUSES].sort()).toEqual(
      [
        'failed',
        'paid_offline',
        'pending',
        'refunded',
        'succeeded',
        'waived',
      ].sort(),
    );
  });

  it('labels every status, and never returns an empty string', () => {
    for (const s of PAYMENT_STATUSES) {
      expect(statusLabel(s)).toBeTruthy();
    }
    expect(statusLabel(null)).toBe('Unpaid');
    expect(statusLabel(undefined)).toBe('Unpaid');
  });

  it('does NOT call paid_offline "Paid"', () => {
    // The whole reason it has its own status: showing it as Paid makes
    // the Stripe payout look short by exactly these rows.
    expect(statusLabel('paid_offline')).toBe('Paid (cash)');
    expect(statusLabel('succeeded')).toBe('Paid');
    expect(statusLabel('paid_offline')).not.toBe(statusLabel('succeeded'));
  });

  it('keeps waived and paid_offline distinct', () => {
    // No money moved vs money moved outside Stripe.
    expect(statusLabel('waived')).toBe('Waived');
    expect(statusLabel('waived')).not.toBe(statusLabel('paid_offline'));
  });

  it('settles on card, comp and cash — but not on refunded', () => {
    expect(isSettled('succeeded')).toBe(true);
    expect(isSettled('waived')).toBe(true);
    expect(isSettled('paid_offline')).toBe(true);
    expect(isSettled('pending')).toBe(false);
    expect(isSettled('failed')).toBe(false);
    expect(isSettled('refunded')).toBe(false);
    expect(isSettled(null)).toBe(false);
    expect(isSettled(undefined)).toBe(false);
  });

  it('never-attempted is neutral, not an error tone', () => {
    // A director needs "hasn't tried yet" to look different from
    // "tried and failed".
    expect(statusTone(null)).toBe('neutral');
    expect(statusTone('failed')).toBe('bad');
    expect(statusTone('pending')).toBe('warn');
  });

  it('tones every status', () => {
    for (const s of PAYMENT_STATUSES) {
      expect(statusTone(s)).toBeTruthy();
    }
  });

  it('parses the wire, and an unknown status is null not a throw', () => {
    for (const s of PAYMENT_STATUSES) {
      expect(parsePaymentStatus(s)).toBe(s);
      expect(parsePaymentStatus(s.toUpperCase())).toBe(s);
    }
    // A server that learns a new status must not blank a whole roster.
    expect(parsePaymentStatus('disputed')).toBeNull();
    expect(parsePaymentStatus(null)).toBeNull();
    expect(parsePaymentStatus(42)).toBeNull();
    expect(parsePaymentStatus('')).toBeNull();
  });

  it('formats amounts, including a real $0', () => {
    expect(formatAmountCents(5000)).toBe('$50');
    expect(formatAmountCents(5050)).toBe('$50.50');
    // A $0 payment row is a real thing — a full comp — unlike $0 dues,
    // which `formatDuesCents` drops.
    expect(formatAmountCents(0)).toBe('$0');
    expect(formatAmountCents('nope')).toBe('—');
  });
});

describe('W6 — the fee disclosure states no number it has not agreed', () => {
  it('names no platform-fee percentage', async () => {
    // F2 is half-decided: players never see a fee as a line item, and
    // the PERCENTAGE is still held. `application_fee_bps` defaults to
    // 0, so nothing is charged. A number on this page before it is
    // agreed is a published price we are not charging — worse than
    // stating none.
    const fs = await import('node:fs/promises');
    const page = await fs.readFile('src/pages/pricing.astro', 'utf8');
    const block = page.slice(page.indexOf('id="collecting-money"'));
    // Any "N%" or "N bps" in the fee block would be that number.
    expect(block).not.toMatch(/\d+(\.\d+)?\s*%/);
    expect(block).not.toMatch(/\d+\s*bps/i);
    expect(block).toContain('not switched on');
  });

  it('tells a host the cash route exists', async () => {
    // Collecting by card is optional. A host who would rather take
    // Venmo should not read this page and conclude they have to
    // connect Stripe to run a league.
    const fs = await import('node:fs/promises');
    const page = await fs.readFile('src/pages/pricing.astro', 'utf8');
    expect(page).toContain('Mark paid in cash');
  });

  it('says the money goes to the host, not to us', async () => {
    const fs = await import('node:fs/promises');
    const page = await fs.readFile('src/pages/pricing.astro', 'utf8');
    expect(page).toMatch(/your own Stripe account/i);
    expect(page).toMatch(/never hold your players/i);
  });
});

describe('W7 — onboarding expectations are stated before the host starts', () => {
  it('names all three things Stripe will ask for', async () => {
    // A host who meets "upload a photo ID" cold, three screens into
    // Stripe's flow, abandons it and reports the feature as broken.
    const fs = await import('node:fs/promises');
    const page = await fs.readFile('src/pages/pricing.astro', 'utf8');
    const block = page.slice(page.indexOf('id="connecting-stripe"'));
    expect(block).toMatch(/bank account/i);
    expect(block).toMatch(/EIN|SSN|tax ID/i);
    expect(block).toMatch(/photo ID/i);
  });

  it('says verification can outlast the sitting', async () => {
    const fs = await import('node:fs/promises');
    const page = await fs.readFile('src/pages/pricing.astro', 'utf8');
    const block = page.slice(page.indexOf('id="connecting-stripe"'));
    expect(block).toMatch(/day or two/i);
  });
});

describe('/pay/* return pages', () => {
  it('success NEVER claims a payment succeeded on its own', async () => {
    // Landing on /pay/success means Stripe sent the browser back,
    // nothing more — and the URL is forgeable by typing it. The page
    // must ask the server.
    const fs = await import('node:fs/promises');
    const page = await fs.readFile('src/pages/pay/success.astro', 'utf8');
    expect(page).toContain('/api/payments?scope=');
    expect(page).toMatch(/NEVER MARKS ANYTHING PAID/);
  });

  it('a slow webhook is not reported as a failure', async () => {
    // The load-bearing half: telling a paying player it failed is how
    // they pay twice.
    const fs = await import('node:fs/promises');
    const page = await fs.readFile('src/pages/pay/success.astro', 'utf8');
    expect(page).toContain('no need to pay again');
    expect(page).not.toMatch(/payment failed/i);
  });

  it('cancel is not an error, and does not poll', async () => {
    const fs = await import('node:fs/promises');
    const page = await fs.readFile('src/pages/pay/cancel.astro', 'utf8');
    expect(page).toMatch(/Nothing was charged/);
    expect(page).not.toContain('/api/payments');
  });

  it('both pages exist at the paths the AASA already publishes', async () => {
    // `wellKnown.ts` has published /pay/success and /pay/cancel since
    // 2026-10-05. These are the pages that make those URLs real.
    const fs = await import('node:fs/promises');
    for (const p of ['src/pages/pay/success.astro', 'src/pages/pay/cancel.astro']) {
      await expect(fs.access(p)).resolves.toBeUndefined();
    }
  });
});
