import { describe, expect, it } from 'vitest';
import { offersPass, parseTournamentId, passDetail, passState, type TournamentEntitlement } from './tournamentPass';

function ent(over: Partial<NonNullable<TournamentEntitlement['field']>> = {}, standalone = true): TournamentEntitlement {
  return {
    billing_available: true,
    standalone,
    field: { enforced: true, entitled: false, field_size: 12, free_max: 36, pass: null, ...over },
  };
}

describe('passState', () => {
  it('a league event is never sold a pass', () => {
    const e = { billing_available: true, enforced: false } as TournamentEntitlement;
    expect(passState(e)).toBe('league');
    expect(offersPass(passState(e))).toBe(false);
  });
  it('a pass on file → covered, whatever the field size', () => {
    expect(passState(ent({ entitled: true, field_size: 80 }))).toBe('covered');
    expect(offersPass('covered')).toBe(false);
  });
  it('at the free limit → needed; below it → optional; both can buy', () => {
    expect(passState(ent({ field_size: 36 }))).toBe('needed');
    expect(passState(ent({ field_size: 35 }))).toBe('optional');
    expect(offersPass('needed')).toBe(true);
    expect(offersPass('optional')).toBe(true);
  });
  it('a missing answer is unknown, and offers nothing', () => {
    expect(passState(null)).toBe('unknown');
    expect(passState({ billing_available: true, standalone: true, field: null })).toBe('unknown');
    expect(offersPass('unknown')).toBe(false);
  });
});

describe('passDetail', () => {
  it('names the numbers the server sent', () => {
    expect(passDetail('needed', ent({ field_size: 36 }).field)).toBe('36 players — the free limit is 36. A pass lets more join.');
    expect(passDetail('optional', ent({ field_size: 20 }).field)).toContain('20 of 36 free spots used');
  });
});

describe('parseTournamentId', () => {
  it('bounds the id', () => {
    expect(parseTournamentId(' tourney_1 ')).toBe('tourney_1');
    expect(parseTournamentId('')).toBeNull();
    expect(parseTournamentId('x'.repeat(129))).toBeNull();
    expect(parseTournamentId(5)).toBeNull();
  });
});
