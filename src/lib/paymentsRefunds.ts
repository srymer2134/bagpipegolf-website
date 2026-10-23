// Card payments — Phase 5: refunds and disputes. PURE: no I/O,
// unit-tested in `paymentsRefunds.test.ts`. The I/O is `refundPayment`
// in `paymentsServer.ts`; the route is `/api/payments/refund`.
//
// Sam's decisions (2026-10-21), which this file encodes:
//
//   1. FULL REFUNDS ONLY. Bagpipe keeps its application fee and Stripe
//      keeps its processing fee, so the confirm step says plainly that
//      the league does not get those back.
//   2. A LOST DISPUTE means the player owes again — their Pay shows
//      again. An OPEN dispute still counts as paid.
//   3. A card payment that lands after the director already marked the
//      player paid in cash / waived is auto-refunded by the server, and
//      the roster says so.
//
// Wire (frozen 2026-10-21): every §2.4 row gains `dispute_status`
// (null | "open" | "won" | "lost"), `disputed_at`, `refunded_cents`
// and `duplicate_refunded_cents`. An older API omits all four, so every
// reader here treats "absent" as "none" rather than throwing.

import {
  formatAmountCents,
  isSettled,
  parsePaymentStatus,
  statusLabel,
  statusTone,
  type PaymentStatus,
  type StatusTone,
} from './paymentStatus';
import type { CheckoutNotice, PaymentRow } from './payments';

export type DisputeStatus = 'open' | 'won' | 'lost';
export const DISPUTE_STATUSES: readonly DisputeStatus[] = ['open', 'won', 'lost'];

/** Unknown or absent → null. A server that learns a new dispute state
 *  must not blank the roster. */
export function parseDisputeStatus(raw: unknown): DisputeStatus | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim().toLowerCase();
  return (DISPUTE_STATUSES as readonly string[]).includes(s) ? (s as DisputeStatus) : null;
}

/** A non-negative integer count of cents, or 0 when absent/garbled. */
export function centsOf(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

type RowLike = Pick<PaymentRow, 'status'> & Partial<PaymentRow>;

/**
 * Does this ROW satisfy the obligation? `isSettled(status)`, except a
 * lost dispute never does — even if a server mid-transition still
 * reports `succeeded` beside `dispute_status: "lost"`. The contract
 * says a lost dispute is `failed` + `lost`; this holds either way, so
 * nothing ever claims a player paid when the bank took the money back.
 *
 * An OPEN dispute is still paid (Sam, 2026-10-21).
 */
export function rowSettled(row: RowLike | null | undefined): boolean {
  if (!row) return false;
  if (parseDisputeStatus(row.dispute_status) === 'lost') return false;
  return isSettled(parsePaymentStatus(row.status));
}

// ── Does this player owe? ONE rule, roster header and member Pay ──

/**
 * Sam, 2026-10-21: three states, not two.
 *
 *   paid     — `rowSettled`: card, cash, comp, or an OPEN dispute.
 *   refunded — the money went back, usually because the player dropped
 *              out. They owe NOTHING: no Pay button, and nothing says
 *              "paid" either. Neither owed nor collected.
 *   owes     — no row, pending, failed, or a LOST dispute (owes again).
 */
export type DuesState = 'paid' | 'refunded' | 'owes';

export function duesState(row: RowLike | null | undefined): DuesState {
  if (!row) return 'owes';
  if (rowSettled(row)) return 'paid';
  if (parsePaymentStatus(row.status) === 'refunded' && parseDisputeStatus(row.dispute_status) !== 'lost') {
    return 'refunded';
  }
  return 'owes';
}

function stamp(r: Partial<PaymentRow>): string {
  return String(r.updated_at ?? r.created_at ?? '');
}

/**
 * Of several rows for ONE player and kind, the one that decides their
 * line: a settled row if there is one (never "Failed" for someone who
 * has since paid), otherwise the most recently updated. The roster and
 * the member's Pay section both pick through this, so they cannot
 * disagree about whether someone owes.
 */
export function betterRow<T extends RowLike>(cur: T | null | undefined, r: T): T {
  if (!cur) return r;
  const curSettled = rowSettled(cur);
  const newSettled = rowSettled(r);
  if (newSettled && !curSettled) return r;
  if (newSettled === curSettled && stamp(r) > stamp(cur)) return r;
  return cur;
}

/** The member's own dues state for a kind, from the rows the server
 *  returned for them (RLS: only their own). */
export function memberDuesState(
  rows: readonly PaymentRow[] | null | undefined,
  kind: PaymentRow['kind'],
): DuesState {
  let pick: PaymentRow | null = null;
  for (const r of rows ?? []) {
    if (r?.kind === kind) pick = betterRow(pick, r);
  }
  return duesState(pick);
}

export type RowStatusView = {
  label: string;
  tone: StatusTone;
  /** A second line under the player's name — e.g. the auto-refund of a
   *  duplicate card payment. Null when there is nothing to add. */
  note: string | null;
};

/**
 * The roster label for one row, given the Phase 5 fields.
 *
 *   refunded                                  → "Refunded"
 *   succeeded + dispute open                  → "Disputed"       (still paid)
 *   succeeded + dispute won                   → "Dispute won"
 *   failed|succeeded + dispute lost           → "Disputed — unpaid" (owes again)
 *   succeeded, 0 < refunded_cents < amount    → "Partially refunded $X"
 *   paid_offline / waived + duplicate refund  → their usual label, with the
 *                                               note "Card payment auto-refunded $X"
 *   anything else                             → `statusLabel(status)`, unchanged
 */
export function rowStatusView(row: RowLike): RowStatusView {
  const status: PaymentStatus | null = parsePaymentStatus(row.status);
  const dispute = parseDisputeStatus(row.dispute_status);
  const dup = centsOf(row.duplicate_refunded_cents);
  const note =
    (status === 'paid_offline' || status === 'waived') && dup > 0
      ? `Card payment auto-refunded ${formatAmountCents(dup)}`
      : null;

  if (status === 'refunded') return { label: 'Refunded', tone: 'neutral', note };
  if (dispute === 'lost' && (status === 'failed' || status === 'succeeded')) {
    return { label: 'Disputed — unpaid', tone: 'bad', note };
  }
  if (status === 'succeeded') {
    if (dispute === 'open') return { label: 'Disputed', tone: 'warn', note };
    if (dispute === 'won') return { label: 'Dispute won', tone: 'good', note };
    const refunded = centsOf(row.refunded_cents);
    const amount = centsOf(row.amount_cents);
    if (refunded > 0 && refunded < amount) {
      return { label: `Partially refunded ${formatAmountCents(refunded)}`, tone: 'warn', note };
    }
  }
  return { label: statusLabel(status), tone: statusTone(status), note };
}

/**
 * May the director refund this row? Only a settled CARD payment:
 *
 *   - status `succeeded` (not cash, not waived, not pending, not
 *     already refunded, not a lost dispute);
 *   - it went through Stripe (`stripe_payment_intent_id` present);
 *   - no dispute is OPEN — the money is with the bank until it rules,
 *     and a refund on top would pay the player twice;
 *   - nothing has been refunded yet: refunds are full-only, so a row
 *     already partly refunded in Stripe's dashboard is the server's to
 *     refuse, not a button we offer.
 *
 * The server is the authority (`not_refundable`); this only keeps the
 * page from offering a button it would refuse.
 */
export function canRefund(row: RowLike | null | undefined): boolean {
  if (!row) return false;
  if (parsePaymentStatus(row.status) !== 'succeeded') return false;
  const dispute = parseDisputeStatus(row.dispute_status);
  if (dispute === 'open' || dispute === 'lost') return false;
  if (typeof row.stripe_payment_intent_id !== 'string' || row.stripe_payment_intent_id === '') return false;
  if (centsOf(row.refunded_cents) > 0) return false;
  return true;
}

/** The confirm step, stated in full before the button. */
export function refundConfirmCopy(input: {
  name: string;
  amountCents: number;
  applicationFeeCents?: number | null;
  scope: 'league' | 'tournament';
}): { title: string; body: string; button: string } {
  const amt = formatAmountCents(input.amountCents);
  const host = input.scope === 'league' ? 'league' : 'tournament';
  const fee = centsOf(input.applicationFeeCents);
  const bagpipe = fee > 0 ? `Bagpipe’s fee (${formatAmountCents(fee)})` : 'Bagpipe’s fee';
  return {
    title: `Refund ${amt} to ${input.name}?`,
    body:
      `${input.name} gets the full ${amt} back on their card. ` +
      `The ${host} does not get back Stripe’s processing fee or ${bagpipe} — ` +
      `both are kept when a payment is refunded. ` +
      `This can’t be undone.`,
    button: `Refund ${amt}`,
  };
}

// ── The route: exactly {scope, id, payment_id} ──────────────────

/** Our own row ids are uuids; refuse anything else before it is
 *  interpolated into a Railway path. */
export function parsePaymentId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s) ? s : null;
}

export type RefundRequest = { scope: 'league' | 'tournament'; id: string; payment_id: string };

/**
 * Validate the form behind the roster's Refund button: EXACTLY
 * `scope`, `id`, `payment_id`. An `amount`, `amount_cents`, `reason` or
 * anything else refuses the whole request — full refunds only, so there
 * is no field a caller could use to name a figure.
 */
export function parseRefundAction(
  entries: Iterable<[string, unknown]> | Record<string, unknown> | null | undefined,
): { ok: true; value: RefundRequest } | { ok: false; reason: string } {
  if (!entries || typeof entries !== 'object') return { ok: false, reason: 'empty body' };
  const pairs: Array<[string, unknown]> =
    Symbol.iterator in (entries as object)
      ? [...(entries as Iterable<[string, unknown]>)]
      : Object.entries(entries as Record<string, unknown>);
  const keys = pairs.map(([k]) => k).sort();
  if (new Set(keys).size !== keys.length) return { ok: false, reason: 'duplicate field' };
  if (keys.join(',') !== 'id,payment_id,scope') {
    return { ok: false, reason: `body must be exactly {scope, id, payment_id}; got {${keys.join(', ')}}` };
  }
  const map = Object.fromEntries(pairs);
  const scope = map.scope === 'league' || map.scope === 'tournament' ? map.scope : null;
  const id = typeof map.id === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(map.id.trim()) ? map.id.trim() : null;
  const paymentId = parsePaymentId(map.payment_id);
  if (!scope) return { ok: false, reason: 'bad scope' };
  if (!id) return { ok: false, reason: 'bad id' };
  if (!paymentId) return { ok: false, reason: 'bad payment_id' };
  return { ok: true, value: { scope, id, payment_id: paymentId } };
}

// ── Result codes back on the page ───────────────────────────────

/** The refund endpoint's error codes (frozen 2026-10-21). */
export const REFUND_ERROR_CODES = ['not_owner', 'not_found', 'not_refundable', 'stripe_error'] as const;
export type RefundErrorCode = (typeof REFUND_ERROR_CODES)[number];

/** Only these may ride in `?refund=` back to the page. */
export const REFUND_RESULT_CODES = [
  'refunded',
  'refund_pending',
  ...REFUND_ERROR_CODES,
  'not_director',
  'payments_disabled',
] as const;

export function refundResultCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return (REFUND_RESULT_CODES as readonly string[]).includes(raw) ? raw : 'error';
}

/** A 200 means Stripe accepted it. `refunded` when it settled right
 *  away; otherwise the row is unchanged and the webhook finishes it. */
export function refundOutcome(payment: { status?: unknown } | null | undefined): 'refunded' | 'refund_pending' {
  return parsePaymentStatus(payment?.status) === 'refunded' ? 'refunded' : 'refund_pending';
}

/** What the owner reads after Refund. Keyed on code only. */
export function refundNotice(code: string | null | undefined): CheckoutNotice | null {
  if (!code) return null;
  switch (code) {
    case 'refunded':
      return { tone: 'good', title: 'Refunded.', body: 'The full amount is on its way back to the player’s card. It can take 5–10 days to show.', code };
    case 'refund_pending':
      return { tone: 'warn', title: 'Refund pending.', body: 'Stripe accepted the refund and is finishing it. The roster updates when it’s done.', code };
    case 'not_owner':
    case 'not_director':
      return { tone: 'bad', title: 'Owner only.', body: 'Only the league’s owner can refund a payment. Nothing was refunded.', code };
    case 'not_found':
      return { tone: 'bad', title: 'Payment not found.', body: 'We couldn’t find that payment. Nothing was refunded — reload and try again.', code };
    case 'not_refundable':
      return { tone: 'warn', title: 'Can’t refund this one.', body: 'This payment is already refunded, disputed, or wasn’t made by card. Nothing was refunded.', code };
    case 'stripe_error':
      return { tone: 'bad', title: 'Stripe didn’t take the refund.', body: 'Nothing was refunded. Please try again in a moment.', code };
    case 'payments_disabled':
      return { tone: 'warn', title: 'Not available yet.', body: 'Card payments aren’t switched on for this league, so nothing was refunded.', code };
    default:
      return { tone: 'bad', title: 'Nothing was refunded.', body: 'Something went wrong. Please try again in a moment.' };
  }
}
