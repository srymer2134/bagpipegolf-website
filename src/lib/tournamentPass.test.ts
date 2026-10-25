import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_FREE_MAX,
  PLAYER_FULL_MESSAGE,
  billingTournamentRows,
  directorRefusal,
  fieldFromEntitlements,
  fieldNotice,
  freeMaxOf,
  isPassRequiredError,
  passUrl,
  playerRefusal,
  rosterRefusedNotice,
  type TournamentField,
} from './tournamentPass';

// The tournament pass on the website (api #182). Sam, 2026-10-25: a
// standalone tournament is free up to 36 players; 37+ needs one $240 pass.

const refusal = { status: 402, body: { code: 'tournament_pass_required', free_max: 36, tournament_id: 't1' } };
const field = (o: Partial<TournamentField> = {}): TournamentField => ({
  enforced: true,
  entitled: false,
  field_size: 36,
  free_max: 36,
  pass: null,
  ...o,
});

describe('recognising the refusal', () => {
  it('is the 402 with its code — nothing else', () => {
    expect(isPassRequiredError(refusal)).toBe(true);
    expect(isPassRequiredError({ status: 402, body: { code: 'league_subscription_required' } })).toBe(false);
    expect(isPassRequiredError({ status: 409, body: { code: 'tournament_pass_required' } })).toBe(false);
    expect(isPassRequiredError(null)).toBe(false);
    expect(isPassRequiredError(new Error('x'))).toBe(false);
  });

  it('reads the limit from the body, falling back to the shipped 36', () => {
    expect(freeMaxOf({ free_max: 40 })).toBe(40);
    expect(freeMaxOf({})).toBe(DEFAULT_FREE_MAX);
    expect(freeMaxOf(null)).toBe(36);
  });
});

describe('two audiences, two messages', () => {
  it('a PLAYER is told the tournament is full — never a price, never a billing link', () => {
    const r = playerRefusal();
    expect(r.status).toBe(409);
    expect(r.body.error).toBe(PLAYER_FULL_MESSAGE);
    expect(JSON.stringify(r.body)).not.toMatch(/\$|billing|pass|240/i);
  });

  it('a DIRECTOR is told what happened and where to get a pass', () => {
    const r = directorRefusal('t1', refusal.body);
    expect(r.status).toBe(402);
    expect(r.body.error).toBe('This tournament has more than 36 players, which needs a tournament pass.');
    expect(r.body.pass_url).toBe('/app/billing?tournament_id=t1#tournament-passes');
  });

  it('a pass link is same-origin and encodes the id', () => {
    expect(passUrl('a b/c')).toBe('/app/billing?tournament_id=a%20b%2Fc#tournament-passes');
    expect(passUrl(null)).toBe('/app/billing#tournament-passes');
  });

  it('a refused roster in a 200 PATCH becomes a notice; a whole save does not', () => {
    const n = rosterRefusedNotice({ tournament: {}, roster_refused: { code: 'tournament_pass_required', free_max: 36 } }, 't1');
    expect(n?.error).toMatch(/more than 36 players.*Your other changes were saved; the roster was not\./);
    expect(n?.pass_url).toBe('/app/billing?tournament_id=t1#tournament-passes');
    expect(rosterRefusedNotice({ tournament: {} }, 't1')).toBeNull();
  });
});

describe('gate off → nobody sees any change (the key property)', () => {
  it('the manage notice is null whenever the field gate is not enforced', () => {
    expect(fieldNotice(field({ enforced: false, field_size: 80 }))).toBeNull();
    expect(fieldNotice(field({ enforced: false, entitled: true, pass: { source: 'stripe', created_at: 'x', livemode: false } }))).toBeNull();
    expect(fieldNotice(null)).toBeNull();
  });

  it('the billing list is empty for unenforced owners with no pass', () => {
    expect(billingTournamentRows([{ id: 't', name: 'Big', field: field({ enforced: false, field_size: 90 }) }])).toEqual([]);
    expect(billingTournamentRows([{ id: 't', name: 'Big', field: null }])).toEqual([]);
  });
});

describe('when the gate is enforced', () => {
  it('at the limit the director is offered a pass; below it, nothing', () => {
    expect(fieldNotice(field({ field_size: 36 }))).toEqual({ kind: 'needs_pass', field_size: 36, free_max: 36 });
    expect(fieldNotice(field({ field_size: 40 }))?.kind).toBe('needs_pass');
    expect(fieldNotice(field({ field_size: 35 }))).toBeNull();
  });

  it('a pass shows as active, and a comp says so', () => {
    expect(fieldNotice(field({ entitled: true, pass: { source: 'stripe', created_at: 'x', livemode: false } }))).toMatchObject({ kind: 'has_pass', comped: false });
    expect(fieldNotice(field({ entitled: true, pass: { source: 'comp', created_at: 'x', livemode: null } }))).toMatchObject({ kind: 'has_pass', comped: true });
  });

  it('the billing list: needs a pass first, then near the limit, then passes — far-below tournaments omitted', () => {
    const rows = billingTournamentRows([
      { id: 'a', name: 'Has pass', field: field({ entitled: true, field_size: 50, pass: { source: 'stripe', created_at: 'x', livemode: false } }) },
      { id: 'b', name: 'Near', field: field({ field_size: 31 }) },
      { id: 'c', name: 'Over', field: field({ field_size: 40 }) },
      { id: 'd', name: 'Small', field: field({ field_size: 12 }) },
    ]);
    expect(rows.map((r) => [r.id, r.state])).toEqual([
      ['c', 'needs_pass'],
      ['b', 'near'],
      ['a', 'has_pass'],
    ]);
  });

  it('a pass bought before the gate turned on is still listed', () => {
    const rows = billingTournamentRows([
      { id: 'a', name: 'Paid early', field: field({ enforced: false, entitled: true, field_size: 40, pass: { source: 'stripe', created_at: 'x', livemode: false } }) },
    ]);
    expect(rows[0]?.state).toBe('has_pass');
  });
});

describe('reading the entitlements answer', () => {
  it('takes `field`, never the top-level payments answer', () => {
    const body = { standalone: true, enforced: false, entitled: true, field: { enforced: true, entitled: false, field_size: 40, free_max: 36, pass: null } };
    expect(fieldFromEntitlements(body)).toEqual({ enforced: true, entitled: false, field_size: 40, free_max: 36, pass: null });
    expect(fieldFromEntitlements({ enforced: false, entitled: true })).toBeNull(); // a league answer has no field
    expect(fieldFromEntitlements(null)).toBeNull();
  });
});

describe('the wiring', () => {
  const read = (p: string) => readFileSync(p, 'utf8');

  it('the three PLAYER routes answer the neutral refusal', () => {
    for (const p of [
      'src/pages/api/tournaments/[id]/join.ts',
      'src/pages/api/invites/[token]/accept.ts',
      'src/pages/api/invites/code/[code]/accept.ts',
    ]) {
      const s = read(p);
      expect(s, p).toMatch(/if \(isPassRequiredError\(err\)\) \{\s*const r = playerRefusal\(\);/);
      expect(s, p).not.toMatch(/directorRefusal/);
    }
  });

  it('the DIRECTOR routes answer the pass refusal; update reports a refused roster', () => {
    for (const p of ['src/pages/api/tournaments/[id]/update.ts', 'src/pages/api/tournaments/[id]/duplicate.ts', 'src/pages/api/tournaments/create.ts']) {
      expect(read(p), p).toMatch(/directorRefusal\(/);
    }
    expect(read('src/pages/api/tournaments/[id]/update.ts')).toMatch(/rosterRefusedNotice\(result, id\)/);
  });

  it('the success page confirms a pass from `field.entitled`, not the payments answer', () => {
    const s = read('src/pages/app/billing/success.astro');
    expect(s).toMatch(/body\.field && body\.field\.entitled === true/);
  });

  it('the checkout proxy sends only the tournament id upstream', () => {
    const s = read('src/pages/api/billing/tournament-checkout.ts');
    expect(s).toMatch(/body: \{ tournament_id: tournamentId \}/);
    expect(s).toMatch(/isStripeUrl\(data\.checkout_url, 'checkout'\)/);
  });
});
