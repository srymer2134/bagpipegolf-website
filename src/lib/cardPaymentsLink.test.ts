import { describe, expect, it } from 'vitest';
import { CARD_PAYMENTS_GUIDE_PATH, cardPaymentsLink } from './cardPaymentsLink';

const owned = { id: 'league_1', is_owner: true, completed_at: null };

describe('cardPaymentsLink', () => {
  it('owner of an enabled, running league gets the setup link and the guide', () => {
    expect(cardPaymentsLink(owned, true, false)).toEqual({
      href: '/app/leagues/league_1/payments',
      label: 'Set up card payments',
      guide: CARD_PAYMENTS_GUIDE_PATH,
    });
  });
  it('once Stripe is ready the label is just "Card payments"', () => {
    expect(cardPaymentsLink(owned, true, true)?.label).toBe('Card payments');
  });
  it('a co-director (not the owner) gets nothing', () => {
    expect(cardPaymentsLink({ ...owned, is_owner: false }, true, false)).toBeNull();
  });
  it('a league the API has not enabled gets nothing (the page would 404)', () => {
    expect(cardPaymentsLink(owned, false, false)).toBeNull();
  });
  it('a completed league gets nothing', () => {
    expect(cardPaymentsLink({ ...owned, completed_at: '2026-10-12T00:00:00Z' }, true, true)).toBeNull();
  });
  it('the id is URL-encoded', () => {
    expect(cardPaymentsLink({ ...owned, id: 'a b' }, true, false)?.href).toBe('/app/leagues/a%20b/payments');
  });
  it('the guide path is the live page', () => {
    expect(CARD_PAYMENTS_GUIDE_PATH).toBe('/leagues/card-payments');
  });
});
