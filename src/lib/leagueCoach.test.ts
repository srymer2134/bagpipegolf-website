// Who reaches the Coach Dashboard on the web.
//
// This mirrors the app's `LeagueMember.isCoachOrOwner`
// (`role == 'owner' || role == 'coach'`, plus the league's creator),
// guarded on that side by
// `test/codebase/coach_dashboard_gate_test.dart`. If the two drift, a
// coach sees the dashboard on their phone and a "not available" on
// their laptop, or worse the reverse.
//
// The bug this pair exists to prevent: until 2026-10-21 the app's tile
// also required `partnerBrand == 'bad_birdie'`, so a plain owner of an
// ordinary league could never find the dashboard — while the website
// had been advertising it to "Owner or coach role" the whole time.

import { describe, it, expect } from 'vitest';
import { hasCoachAccess } from './leaguePortal';

describe('hasCoachAccess', () => {
  it('admits the league owner whatever their membership row says', () => {
    expect(hasCoachAccess({ isOwner: true, rawRole: null })).toBe(true);
    expect(hasCoachAccess({ isOwner: true, rawRole: 'player' })).toBe(true);
    expect(hasCoachAccess({ isOwner: true, rawRole: undefined })).toBe(true);
  });

  it('admits an explicit coach who does not own the league', () => {
    expect(hasCoachAccess({ isOwner: false, rawRole: 'coach' })).toBe(true);
  });

  it('admits the director roles', () => {
    for (const r of ['commissioner', 'director', 'owner']) {
      expect(hasCoachAccess({ isOwner: false, rawRole: r }), r).toBe(true);
    }
  });

  it('REFUSES a plain member', () => {
    // 'player' is what the column actually holds for members — see the
    // LeagueRole comment in leaguePortal.ts. 'member' is tested too
    // because it is the value people assume is there.
    for (const r of ['player', 'member', '', null, undefined]) {
      expect(hasCoachAccess({ isOwner: false, rawRole: r }), String(r)).toBe(
        false,
      );
    }
  });

  it('REFUSES an organizer-only owner who is not the creator', () => {
    // 'organizer' is a league owner who opted out of playing. If they
    // own the row, isOwner carries them in; the role string alone
    // must not.
    expect(hasCoachAccess({ isOwner: false, rawRole: 'organizer' })).toBe(false);
  });

  it('is case- and whitespace-insensitive on the raw column', () => {
    expect(hasCoachAccess({ isOwner: false, rawRole: '  Coach ' })).toBe(true);
    expect(hasCoachAccess({ isOwner: false, rawRole: 'COMMISSIONER' })).toBe(
      true,
    );
  });

  it('does not admit a near-miss role', () => {
    // Guards against a future 'assistant_coach' or 'head coach' being
    // let in by a substring match rather than a deliberate decision.
    for (const r of ['assistant_coach', 'head coach', 'coaching', 'co-ach']) {
      expect(hasCoachAccess({ isOwner: false, rawRole: r }), r).toBe(false);
    }
  });
});
