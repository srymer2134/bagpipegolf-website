import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  attachTarget,
  clubBillingChip,
  clubBillingDetail,
  clubBillingRows,
  clubBillingState,
  hasClubPlan,
  planDate,
} from './clubBilling';
import type { Club } from '../components/ClubPanel.astro';
import type { BillingClubRow } from './billing';

function plan(over: Partial<BillingClubRow> = {}): BillingClubRow {
  return {
    org_id: 'club_1',
    covered: true,
    source: 'stripe',
    period_end: '2027-11-13T03:55:01+00:00',
    cancel_at_period_end: false,
    ...over,
  };
}

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
    expect(clubBillingState(club(), plan())).toBe('yours');
  });

  it('is ending when the payer has cancelled — the state that needs action', () => {
    expect(clubBillingState(club(), plan({ cancel_at_period_end: true }))).toBe('ending');
    // Only for the payer: someone else's cancellation is their business, and
    // `covered` is still the truth until it lapses.
    expect(
      clubBillingState(club({ plan_payer: { display_name: 'Casey', me: false } }), plan({ cancel_at_period_end: true })),
    ).toBe('other-payer');
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

  it('every state has a chip, and none of them prints a dollar amount', () => {
    // No amount, ever: we hold a price id, not a figure, and a club bought
    // under a promo may renew at a number no price we hold would name.
    for (const state of ['yours', 'ending', 'other-payer', 'comped', 'unsubscribed'] as const) {
      const line = clubBillingDetail({ club: club(), state, plan: plan() });
      expect(line).not.toMatch(/\$/);
      expect(clubBillingChip(state).length).toBeGreaterThan(0);
    }
  });

  it('leads with the renewal date, which is what the director came for', () => {
    const line = clubBillingDetail({ club: club(), state: 'yours', plan: plan() });
    expect(line).toMatch(/^Renews Nov 13, 2027\./);
  });

  it('a cancelled plan says Ends, and says what is lost', () => {
    const line = clubBillingDetail({
      club: club(),
      state: 'ending',
      plan: plan({ cancel_at_period_end: true }),
    });
    expect(line).toContain('Ends Nov 13, 2027');
    expect(line).toMatch(/lose cover/);
    expect(line).not.toMatch(/Renews/);
  });

  it('says nothing about a date it does not have', () => {
    // An older API sends no `clubs`, so there is no plan to read. The line
    // must still make sense rather than printing "Renews undefined".
    for (const state of ['yours', 'ending', 'comped'] as const) {
      const line = clubBillingDetail({ club: club(), state, plan: null });
      expect(line).not.toMatch(/undefined|null|NaN|Invalid/i);
    }
    expect(clubBillingDetail({ club: club(), state: 'yours', plan: null })).not.toMatch(/Renews/);
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

  it('joins the club list to the subscription read, or no date can appear', () => {
    expect(page).toMatch(/clubBillingRows\(clubs, state\?\.clubs \?\? \[\]\)/);
  });

  it('the portal button names the jobs rather than saying "manage"', () => {
    // "Manage subscription" is our word for three of a director's: update a
    // card, get a receipt, stop paying. A vague button that leaves the site
    // does not get clicked.
    expect(page).toContain('Update card, receipts, or cancel');
    expect(page).not.toMatch(/Manage \{?clubPayer|Manage subscription/);
  });

  it('a comp is never labelled in a way that scans as unpaid', () => {
    // On a billing page, beside a plan, "No charge" reads as a problem.
    expect(page).not.toMatch(/'No charge'/);
    for (const state of ['yours', 'ending', 'other-payer', 'comped', 'unsubscribed'] as const) {
      expect(clubBillingChip(state)).not.toMatch(/No charge/);
    }
    expect(clubBillingChip('comped')).toBe('Covered');
  });

  it('offers attach instead of a second subscription, and only when covered', () => {
    expect(page).toMatch(/state === 'subscribe' && attachTo/);
    expect(page).toMatch(/name="action" value="attach"/);
    expect(page).toMatch(/value=\{attachTo\.org_id\}/);
    // The button sits on /app/billing, so it has to say where to come back
    // to or the 303 drops the director on the club page.
    expect(page).toMatch(/name="back" value="\/app\/billing"/);
    // And the page must be able to show what the action said.
    expect(page).toMatch(/clubMessage\(Astro\.url\.searchParams\.get\('club'\)\)/);
  });
});

describe('the club page is where the plan is managed', () => {
  const panel = readFileSync(new URL('../components/ClubPanel.astro', import.meta.url), 'utf8');
  const detail = readFileSync(new URL('../pages/app/club/[id].astro', import.meta.url), 'utf8');
  const loader = readFileSync(new URL('./clubPage.ts', import.meta.url), 'utf8');

  it('the portal is reachable from the club, not only from Billing', () => {
    // The old line said "Manage it in Billing →", sending a director to a
    // page titled "Your league subscription" to do one thing.
    expect(panel).toMatch(/action="\/api\/billing\/portal-session"/);
    expect(panel).not.toMatch(/Manage it in Billing/);
  });

  it('the button names the jobs instead of saying "manage"', () => {
    expect(panel).toContain('Update card, receipts, or cancel');
  });

  it('the plan line can say Ends as well as Renews', () => {
    expect(panel).toMatch(/planEnding/);
    expect(panel).toMatch(/ends \{planOn\}/);
    expect(panel).toMatch(/Renews \{planOn\}/);
  });

  it('and the date actually reaches it', () => {
    expect(loader).toMatch(/path: '\/api\/billing\/entitlements'/);
    expect(loader).toMatch(/plans\.set\(row\.org_id, row\)/);
    expect(detail).toMatch(/plan=\{plans\.get\(club\.org_id\) \?\? null\}/);
  });

  it('a failed billing read costs the date, not the page', () => {
    // Everything on a club page — admins, leagues, the public address —
    // must survive the subscription read being down.
    const guarded = /try \{[\s\S]*?\/api\/billing\/entitlements[\s\S]*?\} catch \{/.test(loader);
    expect(guarded).toBe(true);
  });
});

describe('planDate', () => {
  it('carries the year, because a Club plan runs a year', () => {
    expect(planDate('2027-11-13T03:55:01+00:00')).toBe('Nov 13, 2027');
  });

  it('is UTC, so the day does not shift by timezone', () => {
    // 00:30Z is the previous evening in Mountain Time, where Sam is.
    expect(planDate('2027-01-01T00:30:00+00:00')).toBe('Jan 1, 2027');
  });

  it('answers null rather than a lie', () => {
    expect(planDate(null)).toBeNull();
    expect(planDate(undefined)).toBeNull();
    expect(planDate('not a date')).toBeNull();
  });
});

describe('attachTarget', () => {
  it('offers a covered club, so an unattached league can join it for free', () => {
    const rows = clubBillingRows([club()], [plan()]);
    expect(attachTarget(rows)?.org_id).toBe('club_1');
  });

  it('a cancelled-but-still-live plan still covers an attachment', () => {
    const rows = clubBillingRows([club()], [plan({ cancel_at_period_end: true })]);
    expect(attachTarget(rows)?.org_id).toBe('club_1');
  });

  it('a comped club counts — coverage is coverage', () => {
    const rows = clubBillingRows([club({ plan_payer: null })], []);
    expect(attachTarget(rows)?.org_id).toBe('club_1');
  });

  it('NEVER offers an uncovered club, which would swap a real plan for a no-op', () => {
    const rows = clubBillingRows([club({ covered: false })], []);
    expect(attachTarget(rows)).toBeNull();
  });

  it('does not offer a club the viewer only owns on paper and nobody pays for', () => {
    expect(attachTarget([])).toBeNull();
  });
});
