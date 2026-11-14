import { describe, expect, it } from 'vitest';

import { welcomeSteps } from './clubPage';

const club = (over: Record<string, unknown> = {}) =>
  ({
    org_id: 'club_1', name: 'Pine Valley', role: 'owner', covered: true,
    seats_used: 1, seats_max: 4, members: [{ user_id: 'u1', role: 'owner', display_name: 'Sam', email: null }],
    invites: [], leagues: [], ...over,
  }) as never;

describe('welcomeSteps', () => {
  it('shows a fresh club three things to do, none done but the name', () => {
    const steps = welcomeSteps(club());
    expect(steps.map((s) => s.done)).toEqual([true, false, false]);
    expect(steps.map((s) => s.text)).toEqual([
      'Name your club', 'Attach a league', 'Invite your admins',
    ]);
  });

  it('ticks attaching once a league is in the club', () => {
    const steps = welcomeSteps(club({ leagues: [{ league_id: 'l1', name: 'Tue Night', owner: 'u1', mine: true, covered: true }] }));
    expect(steps[1].done).toBe(true);
  });

  it('counts a pending invite as inviting — the work is done, not the acceptance', () => {
    const steps = welcomeSteps(club({ invites: [{ invite_id: 'i1', email: 'a@b.c', expires_at: '2026-12-01' }] }));
    expect(steps[2].done).toBe(true);
  });
});
