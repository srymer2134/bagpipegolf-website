// What one event write does to a season's bindings — the pure half of
// POST /api/leagues/[id]/events, so every branch is unit-tested.
//
// A tournament is ONE event: binding it to two slots would count the same
// leaderboard twice in the standings. Three outcomes beyond a plain bind:
//
//   • ALREADY BOUND (409 `already_bound`). The tournament is on another
//     slot and the caller did not ask to move it. The answer carries that
//     slot, so the board can ask "already event K — move it here?".
//   • MOVE (`move: true`). The old slot's binding goes in the SAME write,
//     so the league never gains a tournament — which is why a league with
//     no plan may still do it (the database gate refuses only ids the
//     league did not already have; plan §3.3 signal (c)).
//   • DESTINATION OCCUPIED (409 `destination_occupied`). The slot already
//     holds a DIFFERENT tournament. This route used to overwrite it
//     silently, dropping an attached event with no message; now it says so.
//
// OWNERSHIP. Binding a tournament the director cannot edit would create an
// event nobody in the league can run, so a NEW id must be one they own —
// the route checks that. An id the league ALREADY has (on a slot, or in
// `event_tournament_ids`) skips the check: an event attached from the app
// may belong to another member, and moving it is tidy-up, not a new event.

export type BindResult =
  | {
      ok: true;
      bindings: Record<string, string>;
      /** True when the route must confirm the caller owns `tid`. */
      needsOwnership: boolean;
    }
  | {
      ok: false;
      status: 409;
      code: 'already_bound' | 'destination_occupied';
      error: string;
      /** For `already_bound`: the slot that already holds it. */
      boundSlot?: number;
    };

export function planBinding(opts: {
  bindings: Record<string, string> | null | undefined;
  /** The league's `event_tournament_ids`. */
  eventIds: readonly string[] | null | undefined;
  slot: number;
  /** The tournament to bind; '' unbinds. */
  tid: string;
  move: boolean;
}): BindResult {
  const bindings: Record<string, string> = { ...(opts.bindings ?? {}) };
  const key = String(opts.slot);

  if (opts.tid === '') {
    delete bindings[key];
    return { ok: true, bindings, needsOwnership: false };
  }

  const current = bindings[key];
  if (current === opts.tid) {
    // Already there: nothing to do, and nothing new to own.
    return { ok: true, bindings, needsOwnership: false };
  }
  if (current) {
    return {
      ok: false,
      status: 409,
      code: 'destination_occupied',
      error: 'That event already has a tournament attached. Detach it first, or pick an empty event.',
    };
  }

  const clash = Object.entries(bindings).find(([k, v]) => v === opts.tid && k !== key);
  if (clash) {
    const boundSlot = Number(clash[0]);
    if (!opts.move) {
      return {
        ok: false,
        status: 409,
        code: 'already_bound',
        error: `That tournament is already event ${boundSlot + 1} of this season.`,
        boundSlot,
      };
    }
    delete bindings[clash[0]];
    bindings[key] = opts.tid;
    return { ok: true, bindings, needsOwnership: false };
  }

  // Not on any slot. Known to the league through the array → a plain bind
  // of something it already has; otherwise a new tournament.
  const known = (opts.eventIds ?? []).includes(opts.tid);
  bindings[key] = opts.tid;
  return { ok: true, bindings, needsOwnership: !known };
}
