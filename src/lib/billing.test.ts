// Rail 1 page logic — the league subscription ($2,000/yr).
//
// These cover the decisions a server-rendered .astro cannot be tested for,
// which is why they live in lib/ rather than in the page.
//
// The one that matters most: `entitled` decides covered-vs-not, NOT the
// presence of a subscription row. A past_due card still entitles, because
// Stripe's Smart Retries run 14 days before it cancels — a director whose
// card failed this morning must not open the page and read "Not subscribed"
// next to a league they have paid for.

import { describe, expect, it } from 'vitest';
import {
  billingErrorMessage,
  daysUntil,
  formatPeriodEnd,
  offersPortal,
  rowDetail,
  rowState,
  type BillingLeagueRow,
} from './billing';

function row(over: Partial<BillingLeagueRow> = {}): BillingLeagueRow {
  return {
    league_id: 'league_1',
    entitled: false,
    pays: false,
    source: null,
    period_end: null,
    cancel_at_period_end: false,
    ...over,
  };
}

describe('rowState', () => {
  it('not entitled → subscribe, whatever else is set', () => {
    expect(rowState(row())).toBe('subscribe');
    // A canceled subscription leaves source='stripe' on the row but
    // entitled=false. It must read as "not subscribed", not "ending".
    expect(rowState(row({ source: 'stripe', entitled: false }))).toBe('subscribe');
  });

  it('entitled by card → active, or ending when it will not renew', () => {
    expect(rowState(row({ entitled: true, source: 'stripe' }))).toBe('active');
    expect(
      rowState(row({ entitled: true, source: 'stripe', cancel_at_period_end: true })),
    ).toBe('ending');
  });

  it('entitled by comp → comped, never "subscribed"', () => {
    // A comp is not a purchase. Calling it "Subscribed" would make a comped
    // league look like revenue on the page the director reads.
    expect(rowState(row({ entitled: true, source: 'comp' }))).toBe('comped');
  });

  it('a past_due card still reads as active', () => {
    // The API returns entitled=true for past_due; the page must not
    // second-guess that by looking for a "status" it is not given.
    expect(rowState(row({ entitled: true, source: 'stripe' }))).toBe('active');
  });
});

describe('rowDetail', () => {
  it('names the renewal date when there is one', () => {
    expect(rowDetail(row({ entitled: true, source: 'stripe', period_end: '2027-10-22T00:00:00Z' })))
      .toBe('Renews 22 October 2027.');
  });

  it('says it will not renew when cancelling', () => {
    const d = rowDetail(
      row({
        entitled: true,
        source: 'stripe',
        cancel_at_period_end: true,
        period_end: '2027-01-05T00:00:00Z',
      }),
    );
    expect(d).toContain('5 January 2027');
    expect(d).toContain('will not renew');
  });

  it('a comp says "no charge", and an open-ended one names no date', () => {
    expect(rowDetail(row({ entitled: true, source: 'comp', period_end: null })))
      .toBe('Covered at no charge.');
    expect(rowDetail(row({ entitled: true, source: 'comp', period_end: '2027-06-01T00:00:00Z' })))
      .toContain('until 1 June 2027');
  });

  it('never prints "Invalid Date"', () => {
    for (const bad of ['', 'not-a-date', 'yesterday']) {
      const d = rowDetail(row({ entitled: true, source: 'stripe', period_end: bad }));
      expect(d).not.toContain('Invalid');
      expect(d).toBe('Active.');
    }
  });
});

describe('formatPeriodEnd / daysUntil', () => {
  it('formats a real date and rejects junk', () => {
    expect(formatPeriodEnd('2027-10-22T00:00:00Z')).toBe('22 October 2027');
    expect(formatPeriodEnd(null)).toBeNull();
    expect(formatPeriodEnd('nope')).toBeNull();
  });

  it('counts days forward and backward', () => {
    const today = new Date('2026-10-22T00:00:00Z');
    expect(daysUntil('2026-10-29T00:00:00Z', today)).toBe(7);
    expect(daysUntil('2026-10-15T00:00:00Z', today)).toBe(-7);
    expect(daysUntil(null, today)).toBeNull();
    expect(daysUntil('nope', today)).toBeNull();
  });
});

describe('offersPortal', () => {
  it('only when something was bought with a card', () => {
    // A comp has no Stripe customer, so the portal would 409 no_customer —
    // the button would always fail.
    expect(offersPortal([row({ entitled: true, source: 'comp' })])).toBe(false);
    expect(offersPortal([row()])).toBe(false);
    expect(offersPortal([])).toBe(false);
    expect(offersPortal([row({ source: 'stripe' })])).toBe(true);
    // Mixed: one card among comps is enough.
    expect(
      offersPortal([row({ source: 'comp', entitled: true }), row({ source: 'stripe' })]),
    ).toBe(true);
  });
});

describe('billingErrorMessage', () => {
  it('no code → no notice', () => {
    expect(billingErrorMessage(null)).toBeNull();
    expect(billingErrorMessage(undefined)).toBeNull();
    expect(billingErrorMessage('')).toBeNull();
  });

  it('every message makes clear nothing was charged where that is true', () => {
    for (const code of ['cancelled', 'price_not_configured', 'stripe_error', 'error']) {
      expect(billingErrorMessage(code)!.toLowerCase()).toContain('nothing was charged');
    }
  });

  it('an unknown code never leaks the raw code to the reader', () => {
    const msg = billingErrorMessage('some_new_api_code_42')!;
    expect(msg).not.toContain('some_new_api_code_42');
    expect(msg).toContain('Something went wrong');
  });

  it('the refusals a director can act on say what to do', () => {
    expect(billingErrorMessage('already_subscribed')).toContain('already has an active');
    expect(billingErrorMessage('not_league_owner')).toContain('league owner');
    expect(billingErrorMessage('no_customer')).toContain('subscribe first');
  });
});
