// The tournament pass ($240, one time) — every rule the site applies, as
// pure functions so each one is unit-tested.
//
// Product rule (Sam, 2026-10-25): a STANDALONE tournament (not in a league)
// is free up to 36 players; a field of 37 or more needs one pass, paid once.
// A league's tournaments are covered by the league plan.
//
// The gate itself is Postgres (`tournaments_field_gate`, flutter migration
// 20261114). The API turns its refusal into one answer (api #182):
//   402 { code: 'tournament_pass_required', error, tournament_id, free_max, billing_url }
// on create, join, and both invite accepts; and on a roster PATCH it saves
// everything else and answers 200 with `roster_refused`.
//
// TWO AUDIENCES, TWO MESSAGES. A DIRECTOR is told what happened and where to
// get a pass. A PLAYER joining is told the tournament is full and to ask the
// organizer — never a price and never a billing link, because the player
// cannot buy the pass and should not be sold to.
//
// NOTHING SHOWS WHILE THE GATE IS OFF. Every notice below is null unless the
// API says `field.enforced`. With `billing.config.gate = 'off'` (today) no
// director or player sees any change.

export const TOURNAMENT_PASS_CODE = 'tournament_pass_required';
export const TOURNAMENT_PASS_PRICE_COPY = '$240';
/** Shipped value of billing.config.tournament_free_max; used only as a fallback. */
export const DEFAULT_FREE_MAX = 36;
/** List a tournament on /app/billing once it is this close to the limit. */
export const NEAR_LIMIT_MARGIN = 6;

export const PLAYER_FULL_MESSAGE = 'This tournament is full for now — ask the organizer.';

/** The `field` object from GET /api/billing/entitlements?tournament_id= (standalone only). */
export interface TournamentField {
  enforced: boolean;
  entitled: boolean;
  field_size: number;
  free_max: number;
  pass: { source: string; created_at: string; livemode: boolean | null } | null;
}

interface ErrorLike {
  status?: unknown;
  body?: unknown;
}

/** True for the API's field-size refusal (402 + its code). */
export function isPassRequiredError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as ErrorLike;
  const code = e.body && typeof e.body === 'object' ? (e.body as { code?: unknown }).code : undefined;
  return e.status === 402 && code === TOURNAMENT_PASS_CODE;
}

/** The free limit from a refusal body (or a roster_refused object), else the shipped value. */
export function freeMaxOf(body: unknown): number {
  const n = body && typeof body === 'object' ? (body as { free_max?: unknown }).free_max : undefined;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : DEFAULT_FREE_MAX;
}

export function directorPassMessage(freeMax: number): string {
  return `This tournament has more than ${freeMax} players, which needs a tournament pass.`;
}

/** Where a director gets a pass. Same-origin and built from a validated id only. */
export function passUrl(tournamentId?: string | null): string {
  return tournamentId
    ? `/app/billing?tournament_id=${encodeURIComponent(tournamentId)}#tournament-passes`
    : '/app/billing#tournament-passes';
}

/** A PLAYER's join was refused: neutral, no price, no billing link. */
export function playerRefusal(): { status: number; body: { error: string; code: string } } {
  return { status: 409, body: { error: PLAYER_FULL_MESSAGE, code: 'tournament_full' } };
}

/** A DIRECTOR's write was refused: what happened, and where to get a pass. */
export function directorRefusal(
  tournamentId: string | null,
  refusalBody: unknown,
): { status: number; body: Record<string, unknown> } {
  const freeMax = freeMaxOf(refusalBody);
  return {
    status: 402,
    body: {
      error: directorPassMessage(freeMax),
      code: TOURNAMENT_PASS_CODE,
      free_max: freeMax,
      pass_url: passUrl(tournamentId),
    },
  };
}

/**
 * A roster PATCH whose roster was refused (everything else saved). Null when
 * the save went through whole.
 */
export function rosterRefusedNotice(
  result: unknown,
  tournamentId: string,
): { error: string; pass_url: string; free_max: number } | null {
  const r = result && typeof result === 'object' ? (result as { roster_refused?: unknown }).roster_refused : null;
  if (!r || typeof r !== 'object') return null;
  const freeMax = freeMaxOf(r);
  return {
    error: `${directorPassMessage(freeMax)} Your other changes were saved; the roster was not.`,
    pass_url: passUrl(tournamentId),
    free_max: freeMax,
  };
}

export type FieldNotice =
  | { kind: 'needs_pass'; field_size: number; free_max: number }
  | { kind: 'has_pass'; field_size: number; free_max: number; comped: boolean };

/**
 * What the director's manage page shows. Null while the gate is off for this
 * owner — the property that keeps today's site unchanged.
 */
export function fieldNotice(field: TournamentField | null | undefined): FieldNotice | null {
  if (!field || field.enforced !== true) return null;
  if (field.entitled) {
    return {
      kind: 'has_pass',
      field_size: field.field_size,
      free_max: field.free_max,
      comped: field.pass?.source === 'comp',
    };
  }
  if (field.field_size >= field.free_max) {
    return { kind: 'needs_pass', field_size: field.field_size, free_max: field.free_max };
  }
  return null;
}

export interface BillingTournamentRow {
  id: string;
  name: string;
  field_size: number;
  free_max: number;
  state: 'has_pass' | 'needs_pass' | 'near';
  comped: boolean;
}

/**
 * The /app/billing "Tournament passes" list: standalone tournaments the
 * director owns that have a pass, or are at or near the limit — and only
 * where the gate is enforced or a pass already exists.
 */
export function billingTournamentRows(
  items: { id: string; name: string; field: TournamentField | null }[],
): BillingTournamentRow[] {
  const rows: BillingTournamentRow[] = [];
  for (const it of items) {
    const f = it.field;
    if (!f) continue;
    const hasPass = f.entitled && f.pass !== null;
    if (!f.enforced && !hasPass) continue;
    if (hasPass) {
      rows.push({ id: it.id, name: it.name, field_size: f.field_size, free_max: f.free_max, state: 'has_pass', comped: f.pass?.source === 'comp' });
    } else if (f.field_size >= f.free_max) {
      rows.push({ id: it.id, name: it.name, field_size: f.field_size, free_max: f.free_max, state: 'needs_pass', comped: false });
    } else if (f.field_size >= f.free_max - NEAR_LIMIT_MARGIN) {
      rows.push({ id: it.id, name: it.name, field_size: f.field_size, free_max: f.free_max, state: 'near', comped: false });
    }
  }
  const order = { needs_pass: 0, near: 1, has_pass: 2 } as const;
  return rows.sort((a, b) => order[a.state] - order[b.state] || a.name.localeCompare(b.name));
}

/** Pull a `field` object out of an entitlements response, defensively. */
export function fieldFromEntitlements(body: unknown): TournamentField | null {
  if (!body || typeof body !== 'object') return null;
  const f = (body as { field?: unknown }).field;
  if (!f || typeof f !== 'object') return null;
  const o = f as Record<string, unknown>;
  if (typeof o.field_size !== 'number' || typeof o.free_max !== 'number') return null;
  return {
    enforced: o.enforced === true,
    entitled: o.entitled === true,
    field_size: o.field_size,
    free_max: o.free_max,
    pass: o.pass && typeof o.pass === 'object' ? (o.pass as TournamentField['pass']) : null,
  };
}
