// Card payments — W5 (the director roster) and the signup page's
// season-dues step. PURE: no I/O, unit-tested in
// `paymentsRoster.test.ts`. The I/O is `paymentsServer.ts`
// (`markOffline`, `waive`, `listPayments`).
//
// Wire shapes: `docs/handoffs/PAYMENTS_API_CONTRACT_V1.md` §2.4, §2.6,
// §2.7 in the fairwayiq-flutter repo.
//
// 🚨 THE RULES THIS FILE HOLDS
//
//   1. A roster action carries NO AMOUNT. "Mark paid in cash" and
//      "Waive" send exactly `{scope, id, profile_id}` plus the one
//      optional free-text field the contract names (`note` / `reason`).
//      Anything else is a refusal, not a field we drop — the same rule
//      `parseCheckoutRequest` holds for checkout.
//   2. The website RECORDS, it does not SEND. Marking someone paid in
//      cash moves no money; the copy says "recorded", never "sent".
//   3. `paid_offline` and `waived` stay distinct ("Paid (cash)" vs
//      "Waived"). The labels come from `paymentStatus.ts` — one
//      vocabulary for the app and the site.

import {
  formatAmountCents,
  isSettled,
  parsePaymentStatus,
  statusLabel,
  statusTone,
  type PaymentStatus,
  type StatusTone,
} from './paymentStatus';
import {
  parseEntityId,
  parseScope,
  type CheckoutNotice,
  type PaymentKind,
  type PaymentRow,
  type PaymentScope,
  type PaymentsMode,
} from './payments';

// ── W5 — the roster ─────────────────────────────────────────────

/** What the page already reads from `league_members`. */
export type RosterMember = {
  user_id: string | null;
  display_name: string | null;
  status?: string | null;
};

export type RosterPaymentRow = {
  profileId: string;
  name: string;
  /** False for a payment row whose payer is no longer on the roster —
   *  still shown, because the money is still in the league's books. */
  onRoster: boolean;
  /** Null = no row at all = never attempted ("Unpaid"). */
  status: PaymentStatus | null;
  label: string;
  tone: StatusTone;
  /** What the row says was charged/owed. Null with no row. */
  amountLabel: string | null;
  /** The director's reason, for a waived row. */
  waivedReason: string | null;
  /** "Mark paid in cash" / "Waive" are offered only while the player
   *  still owes — never on a settled row (that would be a second
   *  obligation-satisfying row, which the API refuses with
   *  `already_paid` anyway). */
  canRecord: boolean;
};

function stamp(r: PaymentRow): string {
  return String(r.updated_at ?? r.created_at ?? '');
}

/**
 * Join the league roster to the §2.4 payments list for ONE kind.
 *
 * One line per member. When a member has several rows (a failed card
 * attempt, then a cash payment), the line shows a SETTLED row if one
 * exists, otherwise the most recently updated — a director must never
 * see "Failed" for someone who has since paid.
 *
 * Members are sorted by name; payers missing from the roster follow,
 * so nothing with money attached disappears.
 */
export function rosterPayments(
  members: readonly RosterMember[] | null | undefined,
  payments: readonly PaymentRow[] | null | undefined,
  kind: PaymentKind,
): RosterPaymentRow[] {
  const best = new Map<string, PaymentRow>();
  for (const r of payments ?? []) {
    if (!r || r.kind !== kind || typeof r.profile_id !== 'string') continue;
    const cur = best.get(r.profile_id);
    if (!cur) {
      best.set(r.profile_id, r);
      continue;
    }
    const curSettled = isSettled(parsePaymentStatus(cur.status));
    const newSettled = isSettled(parsePaymentStatus(r.status));
    if (newSettled && !curSettled) best.set(r.profile_id, r);
    else if (newSettled === curSettled && stamp(r) > stamp(cur)) best.set(r.profile_id, r);
  }

  const line = (profileId: string, name: string, onRoster: boolean): RosterPaymentRow => {
    const row = best.get(profileId) ?? null;
    const status = row ? parsePaymentStatus(row.status) : null;
    return {
      profileId,
      name,
      onRoster,
      status,
      label: row && status === null ? 'Unknown' : statusLabel(status),
      tone: statusTone(status),
      // No amount beside "Waived": no money moved, and a figure there
      // reads like a payment.
      amountLabel: row && status !== 'waived' ? formatAmountCents(row.amount_cents) : null,
      waivedReason: status === 'waived' ? (row?.waived_reason ?? null) : null,
      canRecord: !isSettled(status),
    };
  };

  const seen = new Set<string>();
  const out: RosterPaymentRow[] = [];
  for (const m of members ?? []) {
    if (!m?.user_id || seen.has(m.user_id)) continue;
    seen.add(m.user_id);
    out.push(line(m.user_id, m.display_name?.trim() || 'Player', true));
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  const orphans = [...best.keys()].filter((p) => !seen.has(p)).sort();
  for (const p of orphans) out.push(line(p, 'Not on the roster', false));
  return out;
}

/** The roster's header count: how many still owe. */
export function rosterSummary(rows: readonly RosterPaymentRow[]): { settled: number; owing: number } {
  let settled = 0;
  for (const r of rows) if (isSettled(r.status)) settled += 1;
  return { settled, owing: rows.length - settled };
}

// ── W5 — the two owner actions: exactly the contract's fields ───

export type RosterAction = 'mark_offline' | 'waive';

/** §2.6 request. */
export type MarkOfflineRequest = { scope: PaymentScope; id: string; profile_id: string; note?: string };
/** §2.7 request. */
export type WaiveRequest = { scope: PaymentScope; id: string; profile_id: string; reason?: string };

export type ParsedRosterAction<T> = { ok: true; value: T } | { ok: false; reason: string };

/** The one free-text field each action may carry. */
export const ROSTER_TEXT_FIELD: Record<RosterAction, 'note' | 'reason'> = {
  mark_offline: 'note',
  waive: 'reason',
};

export const ROSTER_TEXT_MAX = 200;

/** Profile ids are uuids; refuse anything that is not one. */
export function parseProfileId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s) ? s : null;
}

/**
 * Validate the form our own mark-offline / waive route receives.
 * Required: `scope`, `id`, `profile_id`. Optional: `note` (mark-offline)
 * or `reason` (waive), trimmed, at most 200 characters, and omitted
 * from the result when blank. Any other key — `amount`, `amount_cents`,
 * `status`, the other action's text field — refuses the whole request.
 */
export function parseRosterAction(
  action: 'mark_offline',
  entries: Iterable<[string, unknown]> | Record<string, unknown> | null | undefined,
): ParsedRosterAction<MarkOfflineRequest>;
export function parseRosterAction(
  action: 'waive',
  entries: Iterable<[string, unknown]> | Record<string, unknown> | null | undefined,
): ParsedRosterAction<WaiveRequest>;
export function parseRosterAction(
  action: RosterAction,
  entries: Iterable<[string, unknown]> | Record<string, unknown> | null | undefined,
): ParsedRosterAction<MarkOfflineRequest | WaiveRequest> {
  if (!entries || typeof entries !== 'object') return { ok: false, reason: 'empty body' };
  const pairs: Array<[string, unknown]> =
    Symbol.iterator in (entries as object)
      ? [...(entries as Iterable<[string, unknown]>)]
      : Object.entries(entries as Record<string, unknown>);
  const text = ROSTER_TEXT_FIELD[action];
  const allowed = new Set(['scope', 'id', 'profile_id', text]);
  const keys = pairs.map(([k]) => k);
  if (new Set(keys).size !== keys.length) return { ok: false, reason: 'duplicate field' };
  const extra = keys.filter((k) => !allowed.has(k));
  if (extra.length > 0) return { ok: false, reason: `unexpected field(s): ${extra.sort().join(', ')}` };
  const map = Object.fromEntries(pairs);
  const scope = parseScope(map.scope);
  const id = parseEntityId(map.id);
  const profileId = parseProfileId(map.profile_id);
  if (!scope) return { ok: false, reason: 'bad scope' };
  if (!id) return { ok: false, reason: 'bad id' };
  if (!profileId) return { ok: false, reason: 'bad profile_id' };
  const rawText = map[text];
  if (rawText !== undefined && typeof rawText !== 'string') return { ok: false, reason: `bad ${text}` };
  const t = typeof rawText === 'string' ? rawText.trim() : '';
  if (t.length > ROSTER_TEXT_MAX) return { ok: false, reason: `${text} too long` };
  const value: Record<string, string> = { scope, id, profile_id: profileId };
  if (t) value[text] = t;
  return { ok: true, value: value as MarkOfflineRequest | WaiveRequest };
}

/** Only these may ride in `?roster=` back to the page. */
export const ROSTER_RESULT_CODES = [
  'recorded_offline',
  'recorded_waived',
  'already_paid',
  'not_director',
  'payments_disabled',
] as const;

export function rosterResultCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return (ROSTER_RESULT_CODES as readonly string[]).includes(raw) ? raw : 'error';
}

/**
 * What the owner reads after "Mark paid in cash" / "Waive". RECORDED,
 * never "sent" or "paid to": nothing moved through Bagpipe.
 */
export function rosterNotice(code: string | null | undefined): CheckoutNotice | null {
  if (!code) return null;
  switch (code) {
    case 'recorded_offline':
      return { tone: 'good', title: 'Recorded.', body: 'Marked paid in cash. No card was charged.', code };
    case 'recorded_waived':
      return { tone: 'good', title: 'Recorded.', body: 'Dues waived for this player. No money moved.', code };
    case 'already_paid':
      return { tone: 'warn', title: 'Already settled.', body: 'That player is already paid or waived — nothing was changed.', code };
    case 'not_director':
      return { tone: 'bad', title: 'Owner only.', body: 'Only the league’s owner can record payments.', code };
    case 'payments_disabled':
      return { tone: 'warn', title: 'Not available yet.', body: 'Card payments aren’t switched on for this league, so nothing was recorded.', code };
    default:
      return { tone: 'bad', title: 'Nothing was recorded.', body: 'Something went wrong. Please try again in a moment.' };
  }
}

// ── Signup page — the season-dues step ──────────────────────────

/**
 * Should the league signup page show its "Season dues" step?
 *
 *   - flag off                 → never (the page renders as it always has)
 *   - no dues (`dues_cents` ≤ 0 or null) → no
 *   - the API said `payments_disabled` for this league, whether on the
 *     payments read or on a checkout bounce → no: the step is not shown
 *     at all, rather than shown and refused
 *
 * Every other outcome shows the step. The step is OPTIONAL: it never
 * blocks the signup, because a commissioner may collect in cash.
 */
export function showSignupDuesStep(input: {
  mode: PaymentsMode;
  duesCents: number | null | undefined;
  listCode?: string | null;
  payCode?: string | null;
}): boolean {
  if (input.mode === 'off') return false;
  const cents = typeof input.duesCents === 'number' ? input.duesCents : Number(input.duesCents);
  if (!Number.isFinite(cents) || cents <= 0) return false;
  if (input.listCode === 'payments_disabled' || input.payCode === 'payments_disabled') return false;
  return true;
}

/** Where a checkout started from. Only these values are honoured, and
 *  the path is rebuilt from (scope, id) — never taken from the request. */
export type CheckoutOrigin = 'event' | 'signup';

export function parseCheckoutOrigin(raw: string | null | undefined): CheckoutOrigin {
  return raw === 'signup' ? 'signup' : 'event';
}

/** `?slot=` carried back to the signup page: a small non-negative
 *  integer, or nothing. */
export function parseSlot(raw: string | null | undefined): string | null {
  if (!raw || !/^\d{1,3}$/.test(raw)) return null;
  return String(Number(raw));
}
