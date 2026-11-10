import { describe, expect, it } from 'vitest';
import { parseRsvpBody, planRsvp } from './leagueRsvp';

const player = { user_id: 'u1', role: 'player', status: 'active' };
const organizer = { user_id: 'u1', role: 'organizer', status: 'active' };
const open = { slot_index: 3, status: 'scheduled' };

describe('parseRsvpBody', () => {
  it('accepts a slot and in/out', () => {
    expect(parseRsvpBody({ slot: 3, status: 'in' })).toEqual({ slot: 3, status: 'in' });
    expect(parseRsvpBody({ slot: 0, status: 'out' })).toEqual({ slot: 0, status: 'out' });
  });

  it('rejects anything else', () => {
    expect(parseRsvpBody(null)).toBeNull();
    expect(parseRsvpBody({ slot: '3', status: 'in' })).toBeNull();
    expect(parseRsvpBody({ slot: 1.5, status: 'in' })).toBeNull();
    expect(parseRsvpBody({ slot: -1, status: 'in' })).toBeNull();
    expect(parseRsvpBody({ slot: 3, status: 'maybe' })).toBeNull();
  });
});

describe('planRsvp', () => {
  it('refuses someone not on the roster, or no longer active', () => {
    expect(planRsvp({ member: null, event: open, status: 'in', boundTournamentId: null }))
      .toMatchObject({ ok: false, httpStatus: 403 });
    expect(planRsvp({ member: { ...player, status: 'removed' }, event: open, status: 'in', boundTournamentId: null }))
      .toMatchObject({ ok: false, httpStatus: 403 });
  });

  it('refuses an event that is not on the schedule, or already played', () => {
    expect(planRsvp({ member: player, event: null, status: 'in', boundTournamentId: null }))
      .toMatchObject({ ok: false, httpStatus: 404 });
    expect(planRsvp({ member: player, event: { slot_index: 3, status: 'complete' }, status: 'in', boundTournamentId: null }))
      .toMatchObject({ ok: false, httpStatus: 409 });
  });

  it('a player who says in to a bound event joins its field', () => {
    expect(planRsvp({ member: player, event: open, status: 'in', boundTournamentId: 't9' }))
      .toEqual({ ok: true, status: 'in', slot: 3, addToTournament: 't9' });
  });

  it('out, an unbound event, or an organizer never touches a field', () => {
    expect(planRsvp({ member: player, event: open, status: 'out', boundTournamentId: 't9' }))
      .toMatchObject({ ok: true, addToTournament: null });
    expect(planRsvp({ member: player, event: open, status: 'in', boundTournamentId: null }))
      .toMatchObject({ ok: true, addToTournament: null });
    expect(planRsvp({ member: organizer, event: open, status: 'in', boundTournamentId: 't9' }))
      .toMatchObject({ ok: true, status: 'in', addToTournament: null });
  });
});
