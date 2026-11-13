import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dollars, PLANS, PROMO_CODE } from './offer';

const PRICING = 'src/pages/pricing.astro';

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

  // Sam, 2026-11-09: the Terms do NOT list prices — prices change, and a
  // contract that quotes them has to be amended every time they do. The
  // Terms name the plan shapes and point at /pricing, which pricingCopy.test.ts
  // already pins. Same reasoning as the promo clause above.
  it('names the plan shapes without quoting a price', () => {
    const t = read(TERMS);
    expect(t).toMatch(/<strong>An event pass<\/strong>/);
    expect(t).toMatch(/<strong>A League plan<\/strong>/);
    expect(t).toMatch(/<strong>A Club plan<\/strong>/);
    expect(t).toMatch(/href="\/pricing"/);
    expect(t).toMatch(/Prices are subject to change/);
  });

  it('quotes no plan price, so a price change cannot strand the Terms', () => {
    const t = read(TERMS);
    for (const plan of Object.values(PLANS)) {
      expect(t, `${plan.name} price ${dollars(plan.price)} must not be in the Terms`)
        .not.toContain(dollars(plan.price));
    }
    // No dollar figure at all, so a future price cannot creep in either.
    expect(t).not.toMatch(/\$\d/);
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

  it('states the trial', () => {
    expect(read(TERMS)).toMatch(/one<\/strong> free trial of\s+<strong>30 days<\/strong>/);
  });

  // Sam's policy, 2026-11-09, corrected the same day: the 7-day window is
  // ONLY for what people buy from us — Single Event, League, Club. It does
  // NOT reach player dues. An earlier draft applied it to both, which put
  // a deadline on a relationship that is not ours to govern.
  it('scopes the 7-day window to what we sell, by name', () => {
    const t = read(TERMS);
    expect(t).toContain('<h3>Refunds of what you buy from us</h3>');
    expect(t).toMatch(/<strong>You have 7 days\.<\/strong>/);
    expect(t).toMatch(/<strong>7 days of\s+the purchase<\/strong>/);
    expect(t).toMatch(/the Single Event pass, the\s+League plan, and the Club plan/);
  });

  it('puts player dues entirely at the director\u2019s discretion', () => {
    const t = read(TERMS);
    expect(t).toContain("<h3>Refunds of player dues — the director's call, not ours</h3>");
    expect(t).toMatch(/<strong>not our money and not our decision<\/strong>/);
    expect(t).toMatch(
      /Whether a player is refunded, when, and on what terms is\s+entirely at the discretion of the league director or tournament\s+host\.<\/strong>/,
    );
    // We neither impose terms nor arbitrate them.
    expect(t).toMatch(/we do not impose a deadline, a condition, or a right to a refund/i);
    expect(t).toMatch(/we do not arbitrate it/);
  });

  it('says plainly that the 7-day window does not reach player dues', () => {
    expect(read(TERMS)).toMatch(
      /<strong>The 7-day window above does not apply to player dues\.<\/strong>/,
    );
  });

  // Matches the shipped behaviour, not a looser reading of it: the API
  // refund path keeps the application fee on purpose (payments.ts D2, no
  // `refund_application_fee`), and the in-app confirm copy
  // (lib/paymentsRefunds.ts) tells the host they do not get it back. The
  // player is made whole; the host absorbs both fees. Stated as mechanics
  // a director can price around, NOT as a term we impose on their policy.
  it('refunds the player in full and says whose 2% is kept', () => {
    const t = read(TERMS);
    expect(t).toMatch(/<strong>full\s+payment back<\/strong>/);
    expect(t).toMatch(/<strong>our 2% platform\s+fee is not returned<\/strong>/);
    expect(t).toMatch(/Both are borne by the league or tournament, not deducted\s+from the player/);
  });

  it('leaves the refund terms for dues to the host in both cross-references', () => {
    const t = read(TERMS);
    expect(t).toMatch(/<strong>including the terms on which they refund, which are\s+theirs to set<\/strong>/);
    expect(t).toMatch(/<strong>whether and how you refund a player is your decision, on your terms<\/strong>/);
  });

  // One fee, one number. Joined to the pricing page instead of restated,
  // so the two cannot disagree (F2, 2026-10-09; application_fee_bps=200).
  it('uses the same platform-fee percentage the pricing page states', () => {
    const stated = read(PRICING).match(/Our platform fee is (\d+(?:\.\d+)?)%/);
    expect(stated, 'pricing page must state the platform fee').not.toBeNull();
    const t = read(TERMS);
    expect(t).toContain(`our ${stated![1]}% platform`);
    expect(t).toContain(`We take a ${stated![1]}% platform fee`);
  });

  it('describes the lapse behaviour the plan gate actually enforces', () => {
    // planGate.ts: the DB refuses a season, new events, and attaching a
    // tournament. Nothing else is withheld, and nothing is deleted.
    const t = read(TERMS);
    expect(t).toMatch(/no longer\s+start a new season, add events, or attach tournaments/);
    expect(t).toMatch(/nothing is deleted because of non-payment/);
  });

  it('points player dues at the host’s own Stripe account', () => {
    const t = read(TERMS);
    expect(t).toMatch(/into the host's own Stripe account<\/strong>, not ours/);
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
const MAILING_ADDRESS = [
  'Taybuta, Inc.',
  '3800 Buchtel Blvd',
  'P.O. Box 100532',
  'Denver, CO 80250',
];

describe('contact address', () => {
  it('is a mailable four-line block on both pages', () => {
    for (const f of [TERMS, PRIVACY]) {
      const t = read(f);
      expect(t, f).toContain('<strong>Mailing address:</strong><br />');
      let at = t.indexOf('<strong>Mailing address:</strong>');
      for (const line of MAILING_ADDRESS) {
        const next = t.indexOf(line, at);
        expect(next, `${f}: "${line}"`).toBeGreaterThan(at);
        at = next;
      }
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
  // Privacy moved on to 2026-11-12 (processor list: Anthropic, GitHub,
  // Apple, Google, Cloudflare). A later date is fine; going backwards is not.
  it('carries the 2026-11-09 revision date (Terms) and a later one (Privacy)', () => {
    expect(read(TERMS), TERMS).toContain('Last updated: <strong>November 9, 2026</strong>.');
    expect(read(PRIVACY), PRIVACY).toContain('Last updated: <strong>November 12, 2026</strong>.');
  });
});
