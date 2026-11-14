import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  clubBillingChip,
  clubBillingDetail,
  clubBillingRows,
  clubBillingState,
  hasClubPlan,
} from './clubBilling';
import type { Club } from '../components/ClubPanel.astro';

function club(over: Partial<Club> = {}): Club {
  return {
    org_id: 'club_1',
    name: 'Pine Valley',
    role: 'owner',
    covered: true,
    seats_used: 1,
    seats_max: 4,
    plan_payer: { display_name: 'Sam', me: true },
    members: [],
    invites: [],
    leagues: [],
    ...over,
  };
}

describe('clubBillingState', () => {
  it('is yours when you are the payer', () => {
    expect(clubBillingState(club())).toBe('yours');
  });

  it('names the other payer rather than claiming it is unpaid', () => {
    expect(clubBillingState(club({ plan_payer: { display_name: 'Casey', me: false } }))).toBe('other-payer');
  });

  it('a covered club with no payer is a comp, not a sale', () => {
    // club_plan_payer returns null when only a comp covers the club.
    expect(clubBillingState(club({ plan_payer: null }))).toBe('comped');
  });

  it('uncovered beats everything — an expired payer is not coverage', () => {
    expect(clubBillingState(club({ covered: false }))).toBe('unsubscribed');
    expect(clubBillingState(club({ covered: false, plan_payer: { display_name: 'Sam', me: true } }))).toBe(
      'unsubscribed',
    );
  });
});

describe('clubBillingRows', () => {
  it('an admin who pays for nothing does not find the club on their billing page', () => {
    const rows = clubBillingRows([club({ role: 'admin', plan_payer: { display_name: 'Sam', me: false } })]);
    expect(rows).toEqual([]);
  });

  it('an admin who IS the payer does', () => {
    const rows = clubBillingRows([club({ role: 'admin', plan_payer: { display_name: 'Me', me: true } })]);
    expect(rows.map((r) => r.state)).toEqual(['yours']);
  });

  it('an owner sees their own club even when another admin pays', () => {
    // So they do not buy a second plan for a club that already has one.
    const rows = clubBillingRows([club({ role: 'owner', plan_payer: { display_name: 'Casey', me: false } })]);
    expect(rows.map((r) => r.state)).toEqual(['other-payer']);
  });

  it('several clubs come back by name', () => {
    const rows = clubBillingRows([
      club({ org_id: 'b', name: 'Shinnecock' }),
      club({ org_id: 'a', name: 'Baltusrol' }),
    ]);
    expect(rows.map((r) => r.club.name)).toEqual(['Baltusrol', 'Shinnecock']);
  });
});

describe('hasClubPlan', () => {
  it('only a plan this viewer pays for counts', () => {
    expect(hasClubPlan(clubBillingRows([club()]))).toBe(true);
    expect(hasClubPlan(clubBillingRows([club({ plan_payer: null })]))).toBe(false);
    expect(hasClubPlan(clubBillingRows([club({ covered: false })]))).toBe(false);
  });
});

describe('the copy', () => {
  it('pluralises the league count', () => {
    const one = clubBillingDetail({ club: club({ leagues: [{} as never] }), state: 'yours' });
    expect(one).toContain('1 league attached');
    const two = clubBillingDetail({ club: club({ leagues: [{} as never, {} as never] }), state: 'yours' });
    expect(two).toContain('2 leagues attached');
  });

  it("names the other payer, and survives a profile with no display name", () => {
    expect(
      clubBillingDetail({ club: club({ plan_payer: { display_name: 'Casey', me: false } }), state: 'other-payer' }),
    ).toContain("Casey's Club plan");
    expect(
      clubBillingDetail({ club: club({ plan_payer: { display_name: null, me: false } }), state: 'other-payer' }),
    ).toContain('another admin');
  });

  it('never prints a renewal date, because no read on this page has one', () => {
    for (const state of ['yours', 'other-payer', 'comped', 'unsubscribed'] as const) {
      const line = clubBillingDetail({ club: club(), state });
      expect(line).not.toMatch(/renew|\d{4}-\d{2}-\d{2}/i);
      expect(clubBillingChip(state).length).toBeGreaterThan(0);
    }
  });
});

// ── The wiring, which is where this bug actually lived ──────
//
// The helper above can be perfect while the page still never calls it. The
// first version of the club public page shipped a 404 because its test
// asserted a line was present rather than that the path could succeed, so
// these name the DOORS the page has to go through.
describe('the billing page is wired to all of it', () => {
  const page = readFileSync(new URL('../pages/app/billing/index.astro', import.meta.url), 'utf8');

  it('gates the portal on the server answer, not the league list', () => {
    expect(page).toMatch(/offersManage\(state, rows\)/);
    expect(page).not.toMatch(/offersPortal\(/);
  });

  it('does not 404 someone who has already paid', () => {
    expect(page).toMatch(/!state\.billing_available && !state\.manage_available/);
  });

  it('renders the portal outside the leagues-only branch', () => {
    // The whole bug: a club payer with no leagues of their own fell into the
    // empty state, and the Manage button lived inside the other branch.
    const portal = page.indexOf('/api/billing/portal-session');
    const leagueList = page.indexOf('sorted.map(');
    expect(portal).toBeGreaterThan(-1);
    expect(leagueList).toBeGreaterThan(-1);
    expect(portal).toBeGreaterThan(leagueList);
    // It is guarded by the page-level conditions, not by `sorted.length > 0`.
    const guard = page.slice(Math.max(0, portal - 400), portal);
    expect(guard).toMatch(/!tournamentId && !loadFailed && showPortal/);
  });

  it('reads the club only when middleware says there is one', () => {
    expect(page).toMatch(/\(locals\.clubs \?\? \[\]\)\.length > 0/);
    expect(page).toMatch(/path: '\/api\/clubs'/);
  });
});
