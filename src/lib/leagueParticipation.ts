// League OWNER participation — the website half of
// fairwayiq-flutter `docs/plans/LEAGUE_OWNER_PARTICIPATION_PLAN.md`
// (§1 D1–D5, §2 frozen contract).
//
// THE CONTRACT, in one table. Participation is the owner's OWN
// `league_members` row; there is no flag column anywhere.
//
//   playing (default) → role = 'player',    status = 'active'
//   organizer         → role = 'organizer', status = 'active'
//   undecided         → NO ROW → show the one-time D4 prompt
//
// `league_members.dues_cents` (nullable int ≥ 0) is what THAT member
// owes: null → the league amount (`leagues.dues_cents`), 0 → nothing,
// n → n. Only the league owner may set it, or `role` — a DB trigger
// enforces that; the route below checks it too, so a non-owner gets a
// clear 403 rather than a raw trigger error.
//
// THE RULE FOR EVERY CONSUMER: anything meaning "people who play"
// (dues roster, pairings, standings, public roster of players)
// excludes `role = 'organizer'` — `isPlayingMember`. Anything meaning
// "people in the league" (membership, messages) includes them.
//
// GRACEFUL BEFORE THE BACKEND LANDS. Until the migration adds
// `league_members.dues_cents`, selecting it fails with 42703
// (undefined_column). `loadOwnMembership` reports that as
// `supported: false`, and every page treats it as "this feature is not
// here yet": no participation card, no prompt, and the Pay section
// behaves exactly as it did before (league amount).
//
// PURE except for the two functions that take a Supabase client, whose
// queries are minimal and injected — tested in
// `leagueParticipation.test.ts` with a fake client.

import type { SupabaseClient } from '@supabase/supabase-js';
import { MAX_DUES_CENTS, formatDuesLine } from './leagueDues';

export type ParticipationRole = 'player' | 'organizer';
export const PARTICIPATION_ROLES: readonly ParticipationRole[] = ['player', 'organizer'];

/** One `league_members` row, as much of it as these rules need. */
export type MemberRow = {
  user_id?: string | null;
  role?: string | null;
  status?: string | null;
  dues_cents?: number | null;
};

/** Ceiling on a typed dues override — one bound for the league amount
 *  and a member's own, defined beside the dues formatting. */
export { MAX_DUES_CENTS };

// ── "Who plays" ─────────────────────────────────────────────────

export function isOrganizer(row: MemberRow | null | undefined): boolean {
  return (row?.role ?? '').trim().toLowerCase() === 'organizer';
}

export function isActive(row: MemberRow | null | undefined): boolean {
  return Boolean(row) && (!row!.status || row!.status === 'active');
}

/** Active and not an organizer — the §2 "people who play" set. */
export function isPlayingMember(row: MemberRow | null | undefined): boolean {
  return isActive(row) && !isOrganizer(row);
}

/** Filter a roster to the people who play. */
export function playingMembers<T extends MemberRow>(rows: readonly T[] | null | undefined): T[] {
  return (rows ?? []).filter(isPlayingMember);
}

// ── What this member owes ──────────────────────────────────────

/** `dues_cents ?? leagues.dues_cents`. Null when neither is a number. */
export function memberDuesCents(
  row: MemberRow | null | undefined,
  leagueDuesCents: number | null | undefined,
): number | null {
  const own = row?.dues_cents;
  if (typeof own === 'number' && Number.isFinite(own)) return Math.max(0, Math.round(own));
  if (typeof leagueDuesCents === 'number' && Number.isFinite(leagueDuesCents)) {
    return Math.max(0, Math.round(leagueDuesCents));
  }
  return null;
}

/**
 * What the viewer's Pay section should do.
 *
 *   'legacy'   — the backend has not landed (`supported: false`): behave
 *                as before, league amount, Pay shown when it is > 0.
 *   'hidden'   — no active row (an undecided owner, a co-director
 *                without a row) or an ORGANIZER: checkout would answer
 *                `not_member`, so there is no button to press.
 *   'nothing'  — a player who owes 0: "Nothing to pay".
 *   'pay'      — a player who owes `cents` > 0.
 *
 * The amount is DISPLAY ONLY. The Pay form never carries it; the API
 * derives the same `dues_cents ?? leagues.dues_cents` on its own.
 */
export type PayState =
  | { kind: 'legacy'; cents: number | null }
  | { kind: 'hidden' }
  | { kind: 'nothing' }
  | { kind: 'pay'; cents: number };

export function payStateFor(input: {
  supported: boolean;
  row: MemberRow | null | undefined;
  leagueDuesCents: number | null | undefined;
}): PayState {
  if (!input.supported) {
    const c = typeof input.leagueDuesCents === 'number' ? input.leagueDuesCents : null;
    return { kind: 'legacy', cents: c };
  }
  if (!isPlayingMember(input.row)) return { kind: 'hidden' };
  const cents = memberDuesCents(input.row, input.leagueDuesCents);
  // A league with no dues and no override: nothing to collect, so the
  // whole section stays off rather than shouting "Nothing to pay" at a
  // league that never charged anything.
  if (cents === null) return { kind: 'hidden' };
  if (cents === 0) {
    const leagueCharges = typeof input.leagueDuesCents === 'number' && input.leagueDuesCents > 0;
    const overridden = typeof input.row?.dues_cents === 'number';
    return leagueCharges || overridden ? { kind: 'nothing' } : { kind: 'hidden' };
  }
  return { kind: 'pay', cents };
}

// ── The D4 prompt ───────────────────────────────────────────────

/** The owner has never answered "Are you playing?" — no row at all.
 *  An inactive row is an answer (they left), not a missing one. */
export function needsParticipationPrompt(input: {
  supported: boolean;
  isOwner: boolean;
  row: MemberRow | null | undefined;
}): boolean {
  return input.supported && input.isOwner && !input.row;
}

/** The Manage page's "My dues" control: which radio is selected. */
export type DuesChoice = 'league' | 'custom' | 'none';

export function duesChoiceFor(row: MemberRow | null | undefined): DuesChoice {
  const c = row?.dues_cents;
  if (typeof c !== 'number') return 'league';
  return c === 0 ? 'none' : 'custom';
}

// ── The write request ──────────────────────────────────────────

export type ParticipationRequest = {
  role: ParticipationRole;
  /** null = pay the league amount. */
  dues_cents: number | null;
};

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

const ALLOWED_KEYS = new Set(['role', 'dues_cents']);

/**
 * Validate `POST /api/leagues/[id]/participation`. Exactly `role`
 * (required: 'player' | 'organizer') and `dues_cents` (optional;
 * null/absent = league amount, else an integer 0…MAX_DUES_CENTS).
 * Any other key refuses the request — this route moves an obligation,
 * so a field it does not understand is not one to drop silently.
 */
export function parseParticipationRequest(body: unknown): Parsed<ParticipationRequest> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Malformed request.' };
  }
  const b = body as Record<string, unknown>;
  const extra = Object.keys(b).filter((k) => !ALLOWED_KEYS.has(k));
  if (extra.length) return { ok: false, error: `Unexpected field(s): ${extra.sort().join(', ')}.` };

  const role = b.role;
  if (typeof role !== 'string' || !(PARTICIPATION_ROLES as readonly string[]).includes(role)) {
    return { ok: false, error: 'Choose playing or organizing.' };
  }

  const raw = b.dues_cents;
  let dues: number | null = null;
  if (raw !== undefined && raw !== null) {
    if (typeof raw !== 'number' || !Number.isInteger(raw)) {
      return { ok: false, error: 'Dues must be a whole number of cents.' };
    }
    if (raw < 0) return { ok: false, error: 'Dues cannot be negative.' };
    if (raw > MAX_DUES_CENTS) return { ok: false, error: 'That dues amount is too large.' };
    dues = raw;
  }
  // An organizer owes nothing by definition (D2); storing an override
  // on their row would be a number no surface reads. Clear it.
  if (role === 'organizer') dues = null;
  return { ok: true, value: { role: role as ParticipationRole, dues_cents: dues } };
}

// ── I/O ─────────────────────────────────────────────────────────

/** Postgres undefined_column — the backend migration is not applied. */
function isMissingColumn(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  // 42703 on a SELECT; PostgREST answers PGRST204 ("Could not find the
  // 'dues_cents' column … in the schema cache") on an INSERT/UPDATE.
  if (err.code === '42703' || err.code === 'PGRST204') return true;
  const m = err.message ?? '';
  return /dues_cents/.test(m) && /column/i.test(m);
}

export type OwnMembership = {
  /** False until `league_members.dues_cents` exists (backend migration). */
  supported: boolean;
  row: MemberRow | null;
};

/** The signed-in user's own row in this league, with `dues_cents`. */
export async function loadOwnMembership(
  supabase: SupabaseClient,
  leagueId: string,
  userId: string,
): Promise<OwnMembership> {
  const { data, error } = await supabase
    .from('league_members')
    .select('user_id, role, status, dues_cents')
    .eq('league_id', leagueId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    if (isMissingColumn(error)) return { supported: false, row: null };
    throw error;
  }
  return { supported: true, row: (data as MemberRow | null) ?? null };
}

export type SaveResult = { status: number; body: Record<string, unknown> };

/**
 * The route's whole job, with the client injected. Order, each a guard:
 *   1. the body is exactly the contract's fields;
 *   2. the caller OWNS the league (`leagues.user_id`) — a co-director
 *      is not the owner, and this is the owner's own row;
 *   3. update the row if it exists, else insert it (display_name is
 *      NOT NULL, so an insert takes the profile's name).
 *
 * Writes as the signed-in user: RLS (`Self or owner …`) and the
 * owner-only trigger on `dues_cents`/`role` both still apply.
 */
export async function saveOwnParticipation(
  supabase: SupabaseClient,
  leagueId: string,
  userId: string,
  body: unknown,
): Promise<SaveResult> {
  const parsed = parseParticipationRequest(body);
  if (!parsed.ok) return { status: 400, body: { error: parsed.error } };
  const req = parsed.value;

  const { data: league, error: lErr } = await supabase
    .from('leagues')
    .select('id, user_id')
    .eq('id', leagueId)
    .maybeSingle();
  if (lErr) return { status: 500, body: { error: 'Could not read this league.' } };
  if (!league) return { status: 404, body: { error: 'League not found.' } };
  if ((league as { user_id?: string | null }).user_id !== userId) {
    return { status: 403, body: { error: 'Only the league owner can set this.' } };
  }

  const patch = { role: req.role, status: 'active', dues_cents: req.dues_cents };

  const { data: updated, error: uErr } = await supabase
    .from('league_members')
    .update(patch)
    .eq('league_id', leagueId)
    .eq('user_id', userId)
    .select('user_id')
    .maybeSingle();
  if (uErr) return failure(uErr);
  if (updated) return { status: 200, body: { ok: true, ...req } };

  const { data: prof } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', userId)
    .maybeSingle();
  const name = ((prof as { display_name?: string | null } | null)?.display_name ?? '').trim() || 'Commissioner';

  const { error: iErr } = await supabase
    .from('league_members')
    .insert({ league_id: leagueId, user_id: userId, display_name: name, ...patch });
  if (iErr) return failure(iErr);
  return { status: 200, body: { ok: true, ...req } };
}

function failure(err: { code?: string; message?: string }): SaveResult {
  if (isMissingColumn(err)) {
    return { status: 503, body: { error: 'This setting is not available yet. Please try again later.' } };
  }
  // 23514 = the role CHECK; P0001 / 42501 = the owner-only trigger or RLS.
  if (err.code === '23514') return { status: 400, body: { error: 'The database rejected that choice.' } };
  if (err.code === '42501' || err.code === 'P0001') {
    return { status: 403, body: { error: 'Only the league owner can set this.' } };
  }
  console.error('[leagueParticipation:write]', err);
  return { status: 500, body: { error: 'Could not save.' } };
}

// ── What the Pay section renders ───────────────────────────────

export type PayDisplay = {
  /** "$45 · due Apr 15" — display only, never sent. Null with `nothing`. */
  amountLabel: string | null;
  /** True → "Nothing to pay", no Pay button. */
  nothing: boolean;
};

/**
 * One decision for every Pay surface (league overview, signup step).
 * Null → render no Pay section at all.
 */
export function payDisplayFor(state: PayState, dueDate: string | null | undefined): PayDisplay | null {
  switch (state.kind) {
    case 'hidden':
      return null;
    case 'nothing':
      return { amountLabel: null, nothing: true };
    case 'pay':
      return { amountLabel: formatDuesLine(state.cents, dueDate), nothing: false };
    case 'legacy': {
      const label = formatDuesLine(state.cents, dueDate);
      return label ? { amountLabel: label, nothing: false } : null;
    }
  }
}
