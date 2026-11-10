import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  PLANS,
  PROMO_CODE,
  PROMO_ENDS_AT,
  buyHref,
  differentCodeBuyHref,
  dollars,
  offerActive,
  offerPrice,
  planFromNext,
} from './offer';

// The launch code (Sam, 2026-11-04/05): Bagpipe50, 50% off the first
// payment, redeemable until 2026-12-31 23:59 Mountain.
describe('launch offer', () => {
  it('halves the first payment of each plan', () => {
    expect(offerPrice(PLANS.event)).toBe(120);
    expect(offerPrice(PLANS.league)).toBe(1070);
    expect(offerPrice(PLANS.club)).toBe(1485);
    expect(dollars(1070)).toBe('$1,070');
  });

  it('ends at 23:59:59 Mountain on December 31, 2026, the Stripe redeem_by', () => {
    expect(PROMO_ENDS_AT.getTime() / 1000).toBe(1798786799);
    expect(offerActive(new Date('2026-12-31T23:00:00-07:00'))).toBe(true);
    expect(offerActive(new Date('2027-01-01T00:00:01-07:00'))).toBe(false);
  });

  it('puts the code on every buy link while the offer runs, and drops it after', () => {
    const during = new Date('2026-11-10T12:00:00Z');
    const after = new Date('2027-01-02T12:00:00Z');
    expect(buyHref('league', during)).toBe(`/buy/league?promo=${PROMO_CODE}`);
    expect(buyHref('event', after)).toBe('/buy/event');
  });

  it('reads the plan back out of a sign-up `next`', () => {
    expect(planFromNext('/buy/league')).toBe('league');
    expect(planFromNext('/buy/event?promo=Bagpipe50')).toBe('event');
    expect(planFromNext('/buy/gold')).toBeNull();
    expect(planFromNext('/app')).toBeNull();
    expect(planFromNext('//evil.com/buy/league')).toBeNull();
    expect(planFromNext(null)).toBeNull();
  });

  it('shows the same prices in the plan cards as PLANS', () => {
    const cards = readFileSync('src/components/PlanCards.astro', 'utf8');
    expect(cards).toContain(`<h3>${dollars(PLANS.event.price)} <span class="card__per">/ per event`);
    expect(cards).toContain(`<h3>${dollars(PLANS.league.price)} <span class="card__per">/ year per league`);
    expect(cards).toContain(`<h3>${dollars(PLANS.club.price)} <span class="card__per">/ year`);
  });

  it('gives every plan card a button that starts buying it', () => {
    const cards = readFileSync('src/components/PlanCards.astro', 'utf8');
    for (const k of ['event', 'league', 'club']) {
      expect(cards).toContain(`href={buy('${k}')} data-plan="${k}"`);
    }
  });

  it('gives every plan card a "different code" link that clears the saved code', () => {
    const cards = readFileSync('src/components/PlanCards.astro', 'utf8');
    for (const k of ['event', 'league', 'club'] as const) {
      expect(cards).toContain(`href={differentCodeBuyHref('${k}')}>Have a different code?</a>`);
      expect(differentCodeBuyHref(k)).toBe(`/buy/${k}?promo=none`);
    }
  });

  it('ships no source comments to the browser on /pricing', () => {
    // The page's notes name competitors' sources and internal plan
    // sections. An HTML comment is served to every visitor; an Astro
    // {/* */} comment is not.
    const page = readFileSync('src/pages/pricing.astro', 'utf8');
    const template = page.slice(page.indexOf('---', 3) + 3);
    expect(template).not.toContain('<!--');
  });
});

describe('Club checkout proxy', () => {
  it('sends the API nothing but the remembered code — never a price or plan', () => {
    const src = readFileSync('src/pages/api/billing/club-checkout.ts', 'utf8');
    expect(src).toContain("path: '/api/billing/club-checkout'");
    expect(src).toContain('body: promo ? { promo_code: promo } : {}');
    // It reads no form field at all: there is nothing for a caller to name.
    expect(src).not.toContain('form.get');
    expect(src).not.toContain('formData');
  });

  it('the Club card buys, and still offers the trial and an email', () => {
    const cards = readFileSync('src/components/PlanCards.astro', 'utf8');
    expect(cards).toMatch(/Buy Club — \$\{dollars\(first\('club'\)\)\} first year/);
    expect(cards).toContain("href={`${buy('club')}#trial`}");
    // No shared editing until the self-serve Club ships (plan phase D).
    expect(cards).toContain('Up to 4 admins, each running their own leagues');
  });
});

// Founding Clubs (Sam, 2026-11-09): Founding70, 70% off League/Club for the
// first 25 clubs. The Colorado outreach links carry ?promo=Founding70.
import { FOUNDING_CODE, foundingFor, foundingPrice, isFoundingCode } from './offer';
import { visitorPromo } from './promoCode';

describe('Founding70', () => {
  const during = new Date('2026-11-10T12:00:00Z');
  const after = new Date('2027-01-02T12:00:00Z');

  it('prices the first year at 30% of list: Club $891, League $642', () => {
    expect(foundingPrice(PLANS.club)).toBe(891);
    expect(foundingPrice(PLANS.league)).toBe(642);
  });

  it('applies to League and Club only, and only while the offer runs', () => {
    expect(foundingFor('club', 'founding70', during)).toBe(true);
    expect(foundingFor('league', 'Founding70', during)).toBe(true);
    expect(foundingFor('event', 'Founding70', during)).toBe(false);
    expect(foundingFor('club', 'Bagpipe50', during)).toBe(false);
    expect(foundingFor('club', 'Founding70', after)).toBe(false);
    expect(isFoundingCode(null)).toBe(false);
  });

  it('a founding visitor\'s Buy links never overwrite Founding70 with Bagpipe50', () => {
    // The regression this guards: a Bagpipe50 link replacing the saved code
    // turns 70% off into 50% off for someone the outreach promised 70%.
    expect(buyHref('league', during, 'Founding70')).toBe(`/buy/league?promo=${FOUNDING_CODE}`);
    expect(buyHref('club', during, 'founding70')).toBe(`/buy/club?promo=${FOUNDING_CODE}`);
    expect(buyHref('event', during, 'Founding70')).toBe('/buy/event');
    // everyone else is unchanged
    expect(buyHref('league', during, null)).toBe(`/buy/league?promo=${PROMO_CODE}`);
    expect(buyHref('league', during, 'Bagpipe50')).toBe(`/buy/league?promo=${PROMO_CODE}`);
  });

  it('reads the code from this request\'s link before the saved cookie', () => {
    const jar = (v?: string) => ({ get: () => (v ? { value: v } : undefined), set: () => {}, delete: () => {} });
    expect(visitorPromo(new URL('https://x/pricing?promo=Founding70'), jar('Bagpipe50'))).toBe('Founding70');
    expect(visitorPromo(new URL('https://x/pricing'), jar('Founding70'))).toBe('Founding70');
    expect(visitorPromo(new URL('https://x/pricing?promo=none'), jar('Founding70'))).toBeNull();
    expect(visitorPromo(new URL('https://x/pricing?promo=<x>'), jar())).toBeNull();
  });

  it('every card and Buy link on the marketing pages is code-aware', () => {
    const cards = readFileSync('src/components/PlanCards.astro', 'utf8');
    expect(cards).toContain('buyHref(k, undefined, code)');
    expect(cards).not.toMatch(/href=\{buyHref\('/);
    for (const page of ['src/pages/leagues.astro', 'src/pages/tournaments.astro']) {
      const src = readFileSync(page, 'utf8');
      expect(src).not.toMatch(/buyHref\('(league|event|club)'\)/);
    }
  });
});
