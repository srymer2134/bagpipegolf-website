// ============================================================
// Creating an event leads, and the create link carries the week
// ============================================================
// Plan: LEAGUE_EVENT_CREATE_UX_PLAN.md slice 2 (flutter repo).
//
// Sam, 2026-10-25: "Creating a new Tournament should be the primary
// option and is it really necessary that a user goes and creates a
// tournament then comes back and attaches it?"
//
// It was not. `LeagueEventBoard` opened an empty event with the PICKER
// ("Choose one of yours…") and demoted creating to help text that read,
// literally, "then come back and attach it" — and `/app/tournaments/new`
// accepted no league or slot param, so coming back and attaching by
// hand was the only way through.
//
// These read the .astro sources, the same way copySpelling.test.ts and
// gameCount.test.ts do: the markup is the behaviour here, there is no
// function to call, and a component test harness would be a much larger
// commitment than the thing it guards.
//
// Each check names the regression it exists to stop. The scan fails
// loudly if a file goes missing rather than passing on an empty read —
// a guard that silently skips is worth nothing
// (project_curated_stub_drift_guard_gap).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = process.cwd();

function source(rel: string): string {
  const text = readFileSync(join(root, rel), 'utf8');
  // Fail loudly rather than let an empty/moved file pass every check.
  if (text.trim().length < 500) {
    throw new Error(`${rel} is missing or unexpectedly tiny — fix the path.`);
  }
  return text;
}

const board = source('src/components/LeagueEventBoard.astro');
const wizard = source('src/pages/app/tournaments/new.astro');

/**
 * [text] with comments removed — `{/* … *\/}` JSX blocks, `/* … *\/`
 * CSS/JS blocks, and whole-line `//`.
 *
 * The "this copy is gone" checks below must read what a DIRECTOR sees,
 * not what we wrote about it. Without this, the comment explaining why
 * "then come back and attach it" was removed satisfies the test that it
 * was removed — which is how a guard quietly stops guarding. (Caught by
 * this very test on first run.)
 */
function copyOnly(text: string): string {
  return text
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('//'))
    .join('\n');
}

const boardCopy = copyOnly(board);

describe('an empty event leads with creating', () => {
  it('offers a create link carrying BOTH the league and the slot', () => {
    // Without the slot the wizard cannot bind the week the director was
    // looking at, which is the whole round trip.
    expect(board).toContain(
      '/app/tournaments/new?league=${encodeURIComponent(leagueId)}&slot=${r.slot}',
    );
  });

  it('gives the create link the primary button style', () => {
    expect(board).toContain('evb__btn--go evb__btn--wide');
  });

  it('no longer tells the director to come back and attach it', () => {
    expect(boardCopy).not.toContain('come back and attach it');
    expect(boardCopy).not.toContain('Nothing suitable?');
  });

  it('demotes the picker to a secondary action', () => {
    // The picker's button must NOT be the primary (`--go`) any more.
    const attach = board.indexOf('data-attach={r.slot}');
    expect(attach).toBeGreaterThan(-1);
    const line = board.slice(board.lastIndexOf('<button', attach), attach);
    expect(line).not.toContain('evb__btn--go');
  });
});

describe('the plan lock still blocks only NEW setup', () => {
  // league_plan_lock: "block NEW setup, never block play or tidy-up".
  // A locked league may still MOVE an event it already owns into an
  // empty week, so the picker must survive the lock even though the
  // create link does not. An earlier draft of this change took the
  // picker away too, which would have stranded a locked director with
  // an event and nowhere to put it.
  it('hides the create link when locked', () => {
    const create = board.indexOf('Create this event');
    expect(create).toBeGreaterThan(-1);
    expect(board.slice(0, create)).toContain('{!locked && (');
  });

  it('keeps the picker reachable while locked', () => {
    const attach = board.indexOf('data-attach={r.slot}');
    expect(attach).toBeGreaterThan(-1);

    // Read the WHOLE LINE holding the guard, not a slice starting at
    // the guard text. A first version sliced from `myTournaments.length
    // > 0` forward, so `{!locked && myTournaments.length > 0 ? (` left
    // the `!locked` behind the slice start and the mutant passed —
    // watched surviving on 2026-10-25, which is why this reads the line.
    const at = board.lastIndexOf('myTournaments.length > 0', attach);
    expect(at).toBeGreaterThan(-1);
    const lineStart = board.lastIndexOf('\n', at) + 1;
    const line = board.slice(lineStart, board.indexOf('\n', at));

    // The condition above the picker is about having something to
    // attach. Mentioning the lock at all means a locked director with
    // an event has nowhere to put it.
    expect(line).not.toContain('locked');
  });
});

describe('the wizard honours the league week it was opened from', () => {
  it('reads both params', () => {
    expect(wizard).toContain("Astro.url.searchParams.get('league')");
    expect(wizard).toContain("Astro.url.searchParams.get('slot')");
  });

  it('verifies the viewer OWNS that league before promising anything', () => {
    // The bind endpoint enforces RLS, but only after the tournament has
    // been created. Checking first means a stale link degrades to an
    // ordinary standalone create instead of a broken promise.
    const ctx = wizard.indexOf('league context fetch failed');
    expect(ctx).toBeGreaterThan(-1);
    const block = wizard.slice(ctx - 900, ctx);
    expect(block).toContain(".eq('user_id', user!.id)");
  });

  it('bounds the slot the same way the schedule route does', () => {
    expect(wizard).toContain('rawSlot <= 51');
  });

  it('binds the slot after a successful create', () => {
    const bind = wizard.indexOf('/api/leagues/${encodeURIComponent(fromLeagueId)}/events');
    expect(bind).toBeGreaterThan(-1);
    expect(wizard.slice(bind, bind + 400)).toContain('tournamentId: id');
  });

  it('returns to the schedule, not the leaderboard', () => {
    expect(wizard).toContain(
      '/app/leagues/${encodeURIComponent(fromLeagueId)}/schedule',
    );
  });

  it('never reports a failed bind as a failed create', () => {
    // The charge-succeeded lesson from /app/billing/success: when the
    // expensive half worked, say so. The tournament exists and is in
    // the picker; implying otherwise would send the director looking
    // for something they already have.
    const bound = wizard.indexOf("if (!bound) {");
    expect(bound).toBeGreaterThan(-1);
    const msg = wizard.slice(bound, bound + 500);
    expect(msg).toContain('was created');
    expect(msg).toContain('Nothing is lost');
  });
});
