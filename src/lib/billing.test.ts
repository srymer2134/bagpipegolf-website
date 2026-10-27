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
  moveTargets,
  daysUntil,
  formatPeriodEnd,
  offersPortal,
  offersTrial,
  rowDetail,
  rowState,
  trialButtonCopy,
  type BillingLeagueRow,
  type TrialInfo,
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

describe('moveTargets — "Move to next season"', () => {
  const row = (league_id: string, entitled: boolean, source: 'stripe' | 'comp' | null = 'stripe') => ({
    league_id, entitled, pays: true, source, period_end: '2027-10-24T00:00:00Z', cancel_at_period_end: false,
  });
  const owned = [
    { id: 'old', name: 'Spring', created_at: '2026-03-01T00:00:00Z', completed_at: '2026-06-01T00:00:00Z' },
    { id: 'new', name: 'Fall', created_at: '2026-08-01T00:00:00Z', completed_at: null },
    { id: 'newer_paid', name: 'Winter', created_at: '2026-09-01T00:00:00Z', completed_at: null },
    { id: 'older', name: 'Last year', created_at: '2025-03-01T00:00:00Z', completed_at: '2025-06-01T00:00:00Z' },
  ];

  it('a completed paid league offers newer, uncovered leagues only', () => {
    const rows = [row('old', true), row('newer_paid', true), row('new', false, null)];
    expect(moveTargets(rows[0], owned, rows).map((l) => l.id)).toEqual(['new']);
  });

  it('a comp moves too', () => {
    const rows = [row('old', true, 'comp')];
    expect(moveTargets(rows[0], owned, rows).map((l) => l.id)).toEqual(['newer_paid', 'new']);
  });

  it('nothing for a league that is not complete, not paid, or unknown', () => {
    const rows = [row('new', true), row('old', false, null)];
    expect(moveTargets(rows[0], owned, rows)).toEqual([]); // not complete
    expect(moveTargets(rows[1], owned, rows)).toEqual([]); // nothing to move
    expect(moveTargets(row('ghost', true), owned, [])).toEqual([]);
  });

  it('every move refusal from the API has its own sentence', () => {
    const codes = ['moved', 'move_already_this_term', 'move_target_covered', 'move_not_newer',
      'move_not_owner', 'move_nothing_to_move', 'move_same_league', 'comped'];
    const msgs = codes.map((c) => billingErrorMessage(c));
    for (const m of msgs) expect(m).not.toMatch(/Something went wrong/);
    expect(new Set(msgs).size).toBe(codes.length);
  });
});

// ── The free trial (api 20261115): 30 days, no card, one per director ──
function trial(over: Partial<TrialInfo> = {}): TrialInfo {
  return { trial_days: 30, used: false, available: true, league_id: null, ends_at: null, active: false, ...over };
}

describe('the free trial', () => {
  it('a trial row reads as a trial, with its end date and what happens next', () => {
    const r = row({ entitled: true, source: 'trial', period_end: '2026-11-25T00:00:00.000Z' });
    expect(rowState(r)).toBe('trial');
    const d = rowDetail(r);
    expect(d).toContain('Free trial until 25 November 2026');
    expect(d).toContain('first payment is taken when the trial ends');
  });

  it('a lapsed trial is just "not subscribed" — entitled decides, not the source', () => {
    expect(rowState(row({ entitled: false, source: 'trial' }))).toBe('subscribe');
  });

  it('is offered only for an uncovered league, while enforced, with the trial unused', () => {
    const open = row();
    expect(offersTrial({ enforced: true, trial: trial() }, open)).toBe(true);
    // nothing enforced yet → keep the one trial for later
    expect(offersTrial({ enforced: false, trial: trial() }, open)).toBe(false);
    expect(offersTrial({ trial: trial() }, open)).toBe(false);
    // already used, or unknown
    expect(offersTrial({ enforced: true, trial: trial({ available: false, used: true }) }, open)).toBe(false);
    expect(offersTrial({ enforced: true }, open)).toBe(false);
    expect(offersTrial(null, open)).toBe(false);
    // a covered league
    expect(offersTrial({ enforced: true, trial: trial() }, row({ entitled: true, source: 'stripe' }))).toBe(false);
    expect(offersTrial({ enforced: true, trial: trial() }, row({ entitled: true, source: 'comp' }))).toBe(false);
  });

  it('the button names the length the server set', () => {
    expect(trialButtonCopy(trial())).toBe('Start 30-day free trial');
    expect(trialButtonCopy(trial({ trial_days: 14 }))).toBe('Start 14-day free trial');
    expect(trialButtonCopy(trial({ trial_days: 0 }))).toBe('Start free trial');
    expect(trialButtonCopy(undefined)).toBe('Start free trial');
  });

  it('every trial code has its own sentence, and none claims a charge', () => {
    for (const code of [
      'trial_started',
      'trial_already_used',
      'trial_league_covered',
      'trial_not_needed',
      'trial_unavailable',
      'trial_not_owner',
    ]) {
      const msg = billingErrorMessage(code)!;
      expect(msg, code).not.toContain('Something went wrong');
      expect(msg.toLowerCase(), code).not.toContain('charged');
    }
    expect(billingErrorMessage('trial_started')).toContain('No card needed');
  });
});
