import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dollars, PLANS, PROMO_CODE } from './offer';

// Billing went live on 2026-11-05 (Stripe LIVE, lib/offer.ts). Until
// 2026-11-09 both legal pages still said we never touch money — Terms §6
// said "Bagpipe Golf does not hold, transfer, or process money", Terms §7
// said we "do not process those fees", Privacy §1 said "we do not collect,
// hold, or transfer money", and Stripe was absent from the §3 processor
// table. Terms §6 had also promised, in its own words, to be updated
// "before it goes live".
//
// These tests pin the corrections so the pages cannot drift back while we
// are charging cards. Prices are read from PLANS rather than restated, so a
// price change fails here instead of leaving the Terms quoting a dead
// number.
const read = (p: string) => readFileSync(p, 'utf8');
const TERMS = 'src/pages/terms.astro';
const PRIVACY = 'src/pages/privacy.astro';

describe('Terms — the money claims match what we actually do', () => {
  it('no longer claims we never process money', () => {
    const t = read(TERMS);
    expect(t).not.toMatch(/does not\s+hold, transfer, or process money/);
    expect(t).not.toMatch(/does not\s+process those fees/);
    // The self-dated promise: real-money handling shipped, so the clause
    // that deferred it must be gone, not merely reworded around.
    expect(t).not.toMatch(/will be updated to\s+cover that capability before it goes live/);
  });

  it('keeps the player-to-player wager claim, which is still true', () => {
    const t = read(TERMS);
    expect(t).toMatch(/Money wagered\s+between players never passes through Bagpipe Golf/);
    expect(t).toMatch(/players settle those wagers between themselves/i);
  });

  it('has a subscriptions section, numbered 7, before Tournaments', () => {
    const t = read(TERMS);
    expect(t).toContain('<h2>7. Plans, payments and subscriptions</h2>');
    expect(t.indexOf('<h2>7.')).toBeLessThan(t.indexOf('<h2>8. Tournaments and invites</h2>'));
  });

  it('names Stripe as the processor and disclaims card storage', () => {
    const t = read(TERMS);
    expect(t).toMatch(/<strong>Stripe<\/strong>, our payment processor/);
    expect(t).toMatch(/never receive or store\s+your full card number/);
  });

  it('states every plan price, read from PLANS so a change fails here', () => {
    const t = read(TERMS);
    for (const plan of Object.values(PLANS)) {
      expect(t, `${plan.name} price ${dollars(plan.price)}`).toContain(dollars(plan.price));
    }
  });

  it('discloses auto-renewal and how cancelling behaves', () => {
    const t = read(TERMS);
    expect(t).toMatch(/renew automatically each year/);
    expect(t).toMatch(/Cancelling takes effect at the end of the period you have\s+already paid for/);
    expect(t).toMatch(/Single-event\s+passes do not renew/);
  });

  // Sam, 2026-11-09: keep the promo clause high level — the Terms say that
  // codes work when applicable, and the code's own terms live wherever we
  // publish it. A dated code in a contract goes stale and then has to be
  // amended, which is the opposite of what a Terms page is for.
  it('covers promo codes without naming one', () => {
    const t = read(TERMS);
    expect(t).toMatch(/first payment only/);
    expect(t).toMatch(/One code per checkout/);
    expect(t).toMatch(/valid only on the terms stated/);
  });

  it('never hard-codes a live code, percentage or redeem-by date', () => {
    const t = read(TERMS);
    expect(t).not.toContain(PROMO_CODE);
    expect(t).not.toMatch(/\d+% off/);
    expect(t).not.toMatch(/Mountain Time/);
    // No calendar date in the Terms except the "Last updated" line itself.
    const dates = [...t.matchAll(/(?:January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}, \d{4}/g)];
    expect(dates.map((m) => m[0])).toEqual(['November 9, 2026']);
  });

  it('states the refund stance and the trial', () => {
    const t = read(TERMS);
    expect(t).toMatch(/<strong>non-refundable<\/strong>/);
    expect(t).toMatch(/one<\/strong> free trial of\s+<strong>30 days<\/strong>/);
  });

  it('describes the lapse behaviour the plan gate actually enforces', () => {
    // planGate.ts: the DB refuses a season, new events, and attaching a
    // tournament. Nothing else is withheld, and nothing is deleted.
    const t = read(TERMS);
    expect(t).toMatch(/no longer\s+start a new season, add events, or attach tournaments/);
    expect(t).toMatch(/nothing is deleted because of non-payment/);
  });

  it('points entry fees at the director’s own Stripe account', () => {
    const t = read(TERMS);
    expect(t).toMatch(/into the director's own Stripe\s+account/);
  });

  it('is numbered 1..17 with no gap, and cross-refs resolve', () => {
    const t = read(TERMS);
    const nums = [...t.matchAll(/<h2>(\d+)\./g)].map((m) => Number(m[1]));
    expect(nums).toEqual(Array.from({ length: 17 }, (_, i) => i + 1));
    // Every §N referenced in the body is a section that exists.
    const refs = [...t.matchAll(/§(\d+)/g)].map((m) => Number(m[1]));
    expect(refs.length).toBeGreaterThan(0);
    for (const r of refs) expect(nums, `§${r}`).toContain(r);
    // The two named targets, so a renumber cannot silently point elsewhere.
    expect(t).toContain('<h2>16. Contact</h2>');
    expect(t).toContain('<h2>15. Disputes and arbitration</h2>');
  });
});

describe('Privacy — payments are disclosed', () => {
  it('no longer claims we never collect or transfer money', () => {
    expect(read(PRIVACY)).not.toMatch(/we do not collect, hold, or transfer money\./);
  });

  it('scopes the no-money claim to money between players', () => {
    expect(read(PRIVACY)).toMatch(/never collect, hold, or transfer money between\s+players/);
  });

  it('lists Stripe in the third-party processor table', () => {
    const p = read(PRIVACY);
    expect(p).toContain('<td><strong>Stripe</strong></td>');
    const table = p.slice(p.indexOf('<h2>3.'), p.indexOf('<h2>4.'));
    expect(table).toContain('<strong>Stripe</strong>');
  });

  it('says what billing data reaches us, and what never does', () => {
    const p = read(PRIVACY);
    expect(p).toMatch(/<strong>Billing information<\/strong>/);
    expect(p).toMatch(/never receive or store your full card number/);
  });
});

// The contact address users are told to write to — for privacy requests
// (Privacy §10) and for arbitration notices (Terms §15/§16). Casey moved it
// from the Wyoming registered agent to Denver in flutter #1625 and fixed the
// P.O. Box in #1631 (100352 → 100532), but only in that repo's markdown
// copies, so for a few hours the PUBLISHED pages — the ones that count —
// still named Casper, WY. Pinned here so a one-sided edit shows up as a
// failure rather than as a wrong address on a live legal page.
const MAILING_ADDRESS = '3800 Buchtel Blvd, P.O. Box 100532, Denver, CO 80250';

describe('contact address', () => {
  it('is the current Denver address on both pages', () => {
    for (const f of [TERMS, PRIVACY]) {
      expect(read(f), f).toContain(`<strong>Mailing address:</strong> ${MAILING_ADDRESS}`);
    }
  });

  it('keeps no trace of the old Wyoming agent address', () => {
    for (const f of [TERMS, PRIVACY]) {
      expect(read(f), f).not.toMatch(/Greenspire|Casper/);
    }
  });

  it('does not carry the mistyped P.O. Box from flutter #1625', () => {
    for (const f of [TERMS, PRIVACY]) {
      expect(read(f), f).not.toContain('100352');
    }
  });
});

describe('both pages were re-dated when the money clauses changed', () => {
  it('carries the 2026-11-09 revision date', () => {
    for (const f of [TERMS, PRIVACY]) {
      expect(read(f), f).toContain('Last updated: <strong>November 9, 2026</strong>.');
    }
  });
});
