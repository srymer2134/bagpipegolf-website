// Payment status vocabulary — the ONE place the website names these.
//
// Mirrors `TournamentPaymentStatus` in the Flutter repo
// (`lib/core/models/tournament_payment.dart`) and the `PaymentStatus`
// section of `docs/handoffs/PAYMENTS_API_CONTRACT_V1.md` §1.
//
// WHY A SHARED MODULE RATHER THAN LABELS INLINE IN EACH PAGE. The
// director reads the roster on their phone and then on a laptop at the
// end of the night, and a status that reads "Paid" in one place and
// "Paid (cash)" in the other is a reconciliation question they cannot
// answer. Step W5's whole job is parity, and parity is a vocabulary
// problem before it is a layout problem.
//
// 🚨 `waived` and `paidOffline` are DIFFERENT and must stay so.
// `waived` means no money moved. `paidOffline` means money moved and
// Stripe never saw it. Collapsing them loses the difference between a
// comp and a cash sale, which is exactly what a treasurer needs when
// a Stripe payout does not match the season's takings.

export type PaymentStatus =
  | 'pending'
  | 'succeeded'
  | 'failed'
  | 'refunded'
  | 'waived'
  | 'paid_offline';

export const PAYMENT_STATUSES: readonly PaymentStatus[] = [
  'pending',
  'succeeded',
  'failed',
  'refunded',
  'waived',
  'paid_offline',
] as const;

/** Statuses that mean the player owes nothing more. */
const SETTLED: readonly PaymentStatus[] = [
  'succeeded',
  'waived',
  'paid_offline',
] as const;

/**
 * True when the obligation is satisfied — by card, by comp, or by cash.
 *
 * `refunded` is NOT settled: the money went back, so they owe it again.
 * Mirrors `TournamentPaymentStatusX.isSettled`.
 */
export function isSettled(status: PaymentStatus | null | undefined): boolean {
  return status != null && SETTLED.includes(status);
}

/** The label a director sees. Identical to the app's, by design. */
export function statusLabel(
  status: PaymentStatus | null | undefined,
): string {
  switch (status) {
    // Null is "never attempted", and it is deliberately NOT an error
    // word. A director needs "hasn't tried yet" to read differently
    // from "tried and failed".
    case null:
    case undefined:
      return 'Unpaid';
    case 'pending':
      return 'Pending';
    case 'succeeded':
      return 'Paid';
    case 'failed':
      return 'Failed';
    case 'refunded':
      return 'Refunded';
    case 'waived':
      return 'Waived';
    case 'paid_offline':
      // Not plain "Paid". Showing it as Paid would make the Stripe
      // payout look short by exactly these rows.
      return 'Paid (cash)';
  }
}

/** Severity bucket, for colour. Separate from the label so a page can
 *  restyle without renaming anything. */
export type StatusTone = 'neutral' | 'good' | 'warn' | 'bad';

export function statusTone(
  status: PaymentStatus | null | undefined,
): StatusTone {
  switch (status) {
    case null:
    case undefined:
      return 'neutral';
    case 'pending':
      return 'warn';
    case 'succeeded':
    case 'paid_offline':
    case 'waived':
      return 'good';
    case 'failed':
      return 'bad';
    case 'refunded':
      return 'neutral';
  }
}

/** Parse a status off the wire, or null. Unknown strings are null
 *  rather than thrown: a server that learns a new status must not blank
 *  a director's whole roster. */
export function parsePaymentStatus(raw: unknown): PaymentStatus | null {
  if (typeof raw !== 'string') return null;
  const lower = raw.toLowerCase().trim();
  return (PAYMENT_STATUSES as readonly string[]).includes(lower)
    ? (lower as PaymentStatus)
    : null;
}

/** `5000` → `"$50"`, `5050` → `"$50.50"`. Mirrors `formatDuesCents`
 *  but returns a string for 0, because a $0 payment row is a real
 *  thing (a full comp) where $0 dues are not. */
export function formatAmountCents(cents: unknown): string {
  const n = typeof cents === 'number' ? cents : Number(cents);
  if (!Number.isFinite(n)) return '—';
  const whole = Math.round(n);
  return whole % 100 === 0
    ? `$${whole / 100}`
    : `$${(whole / 100).toFixed(2)}`;
}
