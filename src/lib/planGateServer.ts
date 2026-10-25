// The I/O half of the plan gate: one entitlements read per league page.
// The decisions live in planGate.ts, which is pure and tested.
//
// A failed read answers NULL, which `isLocked` treats as unlocked. That is
// deliberate: the database and the API are the gate, and a page that
// guessed "locked" on a network blip would hide controls they still allow.

import { callRailway } from './railway';
import type { LeagueEntitlement } from './planGate';

type Ctx = Parameters<typeof callRailway>[0];

export async function fetchLeagueEntitlement(
  ctx: Ctx,
  leagueId: string,
): Promise<LeagueEntitlement | null> {
  try {
    return await callRailway<LeagueEntitlement>(ctx, {
      method: 'GET',
      path: '/api/billing/entitlements',
      query: { league_id: leagueId },
    });
  } catch (err) {
    console.error('[planGate] entitlements read failed — treating as unlocked', err);
    return null;
  }
}
