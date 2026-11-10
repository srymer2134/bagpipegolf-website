import { isActive, isPlayingMember, type MemberRow } from './leagueParticipation';

// "I'm in" / "Can't make it" for one league event, from the website.
// Same row the app writes (`LeagueSignupsNotifier.setRsvp`): one
// `league_signups` row per (league_id, user_id, slot_index) with
// status 'in' | 'out'. No new store.
//
// Like the app, saying "in" to an event that is already bound to a
// tournament also adds the player to that tournament's field — unless
// they are an organizer, who never plays (LEAGUE_OWNER_PARTICIPATION
// plan D2).

export type RsvpStatus = 'in' | 'out';

export type RsvpPlan =
  | { ok: true; status: RsvpStatus; slot: number; addToTournament: string | null }
  | { ok: false; httpStatus: number; error: string };

export function parseRsvpBody(raw: unknown): { slot: number; status: RsvpStatus } | null {
  if (!raw || typeof raw !== 'object') return null;
  const { slot, status } = raw as Record<string, unknown>;
  if (typeof slot !== 'number' || !Number.isInteger(slot) || slot < 0) return null;
  if (status !== 'in' && status !== 'out') return null;
  return { slot, status };
}

export function planRsvp(input: {
  member: MemberRow | null;
  event: { slot_index: number; status: string } | null;
  status: RsvpStatus;
  boundTournamentId: string | null;
}): RsvpPlan {
  const { member, event, status, boundTournamentId } = input;
  if (!member || !isActive(member)) {
    return { ok: false, httpStatus: 403, error: "You're not on this league's roster." };
  }
  if (!event) {
    return { ok: false, httpStatus: 404, error: 'That event is not on the schedule.' };
  }
  if (event.status === 'complete') {
    return { ok: false, httpStatus: 409, error: 'That event has already been played.' };
  }
  const addToTournament =
    status === 'in' && boundTournamentId && isPlayingMember(member) ? boundTournamentId : null;
  return { ok: true, status, slot: event.slot_index, addToTournament };
}
