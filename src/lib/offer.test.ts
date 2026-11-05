import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  PLANS,
  PROMO_CODE,
  PROMO_ENDS_AT,
  buyHref,
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
      expect(cards).toContain(`href={buyHref('${k}')} data-plan="${k}"`);
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
