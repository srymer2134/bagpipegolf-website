import { describe, expect, it } from 'vitest';
import { paymentsSetupDestination, paymentsSetupPath } from './payments';

/**
 * `/app/payments/setup` — the direct entry.
 *
 * Chris, on a live call 2026-10-13, went to finish setting up payments
 * and landed on a list of his leagues: pick one, open Manage, hunt for
 * the button. Owning exactly one league is the common case and should
 * not need a picker.
 */
describe('paymentsSetupDestination', () => {
  it('one owned league → straight to its payments page', () => {
    expect(paymentsSetupDestination([{ id: 'league_1791923044462' }]))
      .toBe('/app/leagues/league_1791923044462/payments');
  });

  it('several owned leagues → render the picker, never guess', () => {
    // Picking one for someone with three would send them to the wrong
    // Stripe account, which is worse than one extra click.
    expect(paymentsSetupDestination([{ id: 'a' }, { id: 'b' }, { id: 'c' }])).toBeNull();
  });

  it('no owned leagues → render the explanation', () => {
    expect(paymentsSetupDestination([])).toBeNull();
  });

  it('null / undefined (a failed load) → render, do not redirect', () => {
    // A failed query must not look like "you own nothing" AND must not
    // redirect somewhere arbitrary.
    expect(paymentsSetupDestination(null)).toBeNull();
    expect(paymentsSetupDestination(undefined)).toBeNull();
  });

  it('one row with a blank id → render, not /app/leagues//payments', () => {
    expect(paymentsSetupDestination([{ id: '' }])).toBeNull();
    expect(paymentsSetupDestination([{ id: '   ' }])).toBeNull();
  });

  it('the destination is the same path the Manage button uses', () => {
    // If these ever diverge, one of the two entry points goes somewhere
    // that does not exist.
    const id = 'league_1791923044462';
    expect(paymentsSetupDestination([{ id }])).toBe(paymentsSetupPath('league', id));
  });

  it('an id needing encoding is encoded once, not twice', () => {
    const out = paymentsSetupDestination([{ id: 'a b/c' }]);
    expect(out).toBe(paymentsSetupPath('league', 'a b/c'));
    expect(out).not.toContain('%25'); // double-encoding
  });
});
