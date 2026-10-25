// The plan gate on the website (billing Phase 1c): when a league page shows
// anything locked, what counts as the paywall, and the Attach picker.
//
// THE PROPERTY THESE EXIST FOR: an owner the gate does not cover — every
// owner while it is off — sees exactly the page they saw before. A locked
// control appears ONLY for `enforced && !entitled`.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  attachChoices,
  billingUrlFor,
  isLocked,
  isPlanGateError,
  paywallBody,
  PLAN_GATE_CODE,
} from './planGate';

describe('isLocked — only enforced && !entitled', () => {
  it('locks an enforced owner whose league has no plan', () => {
    expect(isLocked({ enforced: true, entitled: false })).toBe(true);
  });

  it('an UNENFORCED owner is never locked, plan or no plan', () => {
    expect(isLocked({ enforced: false, entitled: false })).toBe(false);
    expect(isLocked({ enforced: false, entitled: true })).toBe(false);
  });

  it('an enforced owner WITH a plan is not locked', () => {
    expect(isLocked({ enforced: true, entitled: true })).toBe(false);
  });

  it('anything missing, malformed or unreadable is UNLOCKED — the server decides', () => {
    expect(isLocked(null)).toBe(false);
    expect(isLocked(undefined)).toBe(false);
    expect(isLocked({})).toBe(false);
    expect(isLocked({ enforced: true })).toBe(false); // entitled unknown
    expect(isLocked({ enforced: 'true', entitled: false })).toBe(false);
    expect(isLocked({ enforced: true, entitled: 'false' })).toBe(false);
    expect(isLocked({ error: 'upstream_error' } as never)).toBe(false);
  });
});

describe('isPlanGateError — only the plan gate is a paywall', () => {
  it('the database refusal (PostgREST PT402)', () => {
    expect(isPlanGateError({ code: 'PT402', message: 'league_subscription_required' })).toBe(true);
    expect(isPlanGateError({ code: 'PT402' })).toBe(true);
  });

  it('the API refusal', () => {
    expect(isPlanGateError({ code: 'league_subscription_required', error: 'x' })).toBe(true);
  });

  it('anything else is not — an unrelated refusal is never dressed up as a paywall', () => {
    expect(isPlanGateError(null)).toBe(false);
    expect(isPlanGateError({ code: '23505' })).toBe(false);
    expect(isPlanGateError({ code: '42501', message: 'denied' })).toBe(false);
    expect(isPlanGateError({ code: 'PT409', message: 'league_subscription_active' })).toBe(false);
    expect(isPlanGateError('PT402')).toBe(false);
  });
});

describe('paywallBody', () => {
  it('carries the code and a same-origin billing link for the league', () => {
    const b = paywallBody('league_1');
    expect(b.code).toBe(PLAN_GATE_CODE);
    expect(b.billing_url).toBe('/app/billing?league_id=league_1');
    expect(b.billing_url.startsWith('/app/billing')).toBe(true);
    expect(b.error.length).toBeGreaterThan(10);
  });

  it('encodes the league id and falls back to the page', () => {
    expect(billingUrlFor('a b&c')).toBe('/app/billing?league_id=a%20b%26c');
    expect(billingUrlFor(null)).toBe('/app/billing');
  });
});

describe('attachChoices — the Attach picker', () => {
  const mine = [
    { id: 't_mine_new', name: 'Fresh event', completed_at: null },
    { id: 't_mine_known', name: 'Known event', completed_at: null },
  ];
  const known = new Map([['t_other', { name: 'From the app', completed_at: null }]]);

  it('UNLOCKED: exactly the director’s own tournaments, as before', () => {
    const out = attachChoices({
      locked: false,
      mine,
      eventIds: ['t_other'],
      bindings: { '0': 't_mine_known' },
      known,
    });
    expect(out).toBe(mine); // same list, untouched
  });

  it('LOCKED: only tournaments the league already has and that are on no slot', () => {
    const out = attachChoices({
      locked: true,
      mine,
      eventIds: ['t_mine_known', 't_other', 't_bound'],
      bindings: { '2': 't_bound' },
      known,
    });
    expect(out.map((t) => t.id)).toEqual(['t_mine_known', 't_other']);
    expect(out.find((t) => t.id === 't_other')?.name).toBe('From the app');
  });

  it('LOCKED with nothing unbound: an empty picker, never a new tournament', () => {
    expect(attachChoices({ locked: true, mine, eventIds: [], bindings: {}, known })).toEqual([]);
  });
});

// The wiring: each place a gated write can come back refused maps it to the
// paywall instead of a generic failure. Pages and routes are not unit-
// testable, so this reads their source — the same approach as the CSP tests.
describe('wiring', () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

  it('the schedule, events and create routes answer the paywall on PT402', () => {
    for (const p of [
      'src/pages/api/leagues/[id]/schedule.ts',
      'src/pages/api/leagues/[id]/events.ts',
    ]) {
      expect(read(p), p).toMatch(/if \(isPlanGateError\(error\)\) return json\(paywallBody\(id\), 402\);/);
    }
    const create = read('src/pages/api/leagues/create.ts');
    expect(create).toMatch(/isLocked\(await fetchLeagueEntitlement\(ctx, data\.id\)\)/);
    expect(create).toMatch(/wErr && isPlanGateError\(wErr\)/);
  });

  it('the schedule page locks only through isLocked, and passes the result down', () => {
    const page = read('src/pages/app/leagues/[id]/schedule.astro');
    expect(page).toMatch(/locked = isLocked\(await fetchLeagueEntitlement\(Astro, d\.league\.id\)\)/);
    expect(page).toMatch(/let locked = false;/);
    expect(page).toMatch(/locked=\{locked\}/);
  });

  it('a failed entitlements read is unlocked, not locked', () => {
    const io = read('src/lib/planGateServer.ts');
    expect(io).toMatch(/catch \(err\) \{[\s\S]*return null;/);
  });
});
