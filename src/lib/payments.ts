// Card payments (Stripe Connect) — the PURE half of the website's
// payments surfaces: W1 (set up card payments), W2 (onboarding
// refresh/return), W3 (Pay buttons), W4 (/pay/* return pages).
//
// Nothing in this file does I/O, so it is safe to import from a
// browser `<script>` as well as from server code, and it is all
// unit-tested in `payments.test.ts`. The I/O half (Railway calls and
// the dev fixtures) is `paymentsServer.ts`.
//
// The wire shapes are `docs/handoffs/PAYMENTS_API_CONTRACT_V1.md` in
// the fairwayiq-flutter repo. That contract is a v1 PROPOSAL pending
// Patrick's ack (PATRICK_BACKLOG §73) — if a shape moves, it moves
// here, in the fixtures under `__fixtures__/payments/`, and nowhere
// else.
//
// 🚨 THREE RULES THIS FILE EXISTS TO HOLD
//
//   1. The website never sends an AMOUNT. `parseCheckoutRequest`
//      accepts exactly `{scope, id, kind}` and refuses anything else,
//      so no caller of our own route can name a price — the
//      PATRICK_BACKLOG §58 transparent-proxy class.
//   2. The website never decides that anyone has PAID. Only the
//      webhook writes payment truth; `pollOutcome` reports a row the
//      SERVER returned, matched by the exact `payment_id`, and never
//      reads a status out of the URL.
//   3. Everything is OFF unless `PAYMENTS_ENABLED` says otherwise, and
//      fixtures can only ever answer in `astro dev`.

import { isSettled, parsePaymentStatus, type PaymentStatus } from './paymentStatus';

// ── Shared types (contract §1) ──────────────────────────────────

export type PaymentScope = 'league' | 'tournament';
export type PaymentKind = 'entry_fee' | 'season_dues';

export const PAYMENT_SCOPES: readonly PaymentScope[] = ['league', 'tournament'];
export const PAYMENT_KINDS: readonly PaymentKind[] = ['entry_fee', 'season_dues'];

/** Every machine code in the contract's error table. */
export type PaymentsErrorCode =
  | 'no_fee_set'
  | 'already_paid'
  | 'merchant_not_ready'
  | 'kind_not_allowed'
  | 'not_director'
  | 'payments_disabled';

export const PAYMENTS_ERROR_CODES: readonly PaymentsErrorCode[] = [
  'no_fee_set',
  'already_paid',
  'merchant_not_ready',
  'kind_not_allowed',
  'not_director',
  'payments_disabled',
];

/** §2.2 `GET /api/merchants/{scope}/{id}` — 200 body. */
export type MerchantStatusBody = {
  merchant_account_id: string;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  controller_fees_payer: string;
  requirements_due: string[];
  livemode: boolean;
};

/** §2.1 `POST /api/merchants/onboard` — 201 body. */
export type OnboardBody = {
  merchant_account_id: string;
  onboarding_url: string;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  expires_at: string;
};

/** §2.3 `POST /api/payments/checkout-session` — 201 body. */
export type CheckoutSessionBody = {
  payment_id: string;
  checkout_url: string;
  amount_cents: number;
  currency: string;
  expires_at: string;
};

/** §2.4 — one element of `payments`. */
export type PaymentRow = {
  id: string;
  scope: PaymentScope;
  league_id: string | null;
  tournament_id: string | null;
  profile_id: string;
  kind: PaymentKind;
  amount_cents: number;
  application_fee_cents: number;
  currency: string;
  status: string;
  stripe_payment_intent_id: string | null;
  stripe_checkout_session_id: string | null;
  livemode: boolean;
  paid_at: string | null;
  refunded_at: string | null;
  waived_by: string | null;
  waived_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type PaymentsListBody = { payments: PaymentRow[] };

/** The contract's error envelope. */
export type PaymentsErrorBody = {
  error: string;
  code: string;
  /** Present on `already_paid`. */
  payment?: PaymentRow;
  /** Present on `merchant_not_ready` when one could be minted. The
   *  website NEVER follows this on a player's behalf — see
   *  `checkoutErrorMessage`. */
  onboarding_url?: string;
};

// ── The flag gate ───────────────────────────────────────────────

/**
 * `off`      — production today. Every payments route 404s, and no Pay
 *              button or "Set up card payments" link renders.
 * `live`     — talks to Railway with the signed-in user's JWT.
 * `fixtures` — answers from `__fixtures__/payments/*.json`. Only
 *              reachable from `astro dev`; a built Worker can never be
 *              in this mode whatever its env says.
 */
export type PaymentsMode = 'off' | 'live' | 'fixtures';

function truthy(v: unknown): boolean {
  if (typeof v !== 'string') return false;
  const s = v.trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
}

/**
 * Resolve the mode from the Worker env and whether this is a dev
 * server. `isDev` is `import.meta.env.DEV` at the call site — false in
 * every `astro build` output, which is what Cloudflare deploys — so
 * `PAYMENTS_FIXTURES` set on the production Worker by mistake still
 * resolves to `live`, not to fake data.
 */
export function paymentsMode(
  env: { PAYMENTS_ENABLED?: unknown; PAYMENTS_FIXTURES?: unknown } | null | undefined,
  isDev: boolean,
): PaymentsMode {
  if (!truthy(env?.PAYMENTS_ENABLED)) return 'off';
  if (isDev === true && truthy(env?.PAYMENTS_FIXTURES)) return 'fixtures';
  return 'live';
}

// ── Scope / kind ────────────────────────────────────────────────

export function parseScope(raw: unknown): PaymentScope | null {
  return typeof raw === 'string' && (PAYMENT_SCOPES as readonly string[]).includes(raw)
    ? (raw as PaymentScope)
    : null;
}

export function parseKind(raw: unknown): PaymentKind | null {
  return typeof raw === 'string' && (PAYMENT_KINDS as readonly string[]).includes(raw)
    ? (raw as PaymentKind)
    : null;
}

/**
 * What a card may be charged for, per scope (K4, ratified). A league
 * charges season dues; a league EVENT is a tournament, so its entry
 * fee goes through the tournament scope. Weekly pots, CTP/LD entries,
 * Calcuttas and Side Games are never payable by card and have no kind
 * at all. The server enforces this too (`kind_not_allowed`); checking
 * here means the website never renders a button the server would
 * refuse.
 */
export function kindFor(scope: PaymentScope): PaymentKind {
  return scope === 'league' ? 'season_dues' : 'entry_fee';
}

export function isKindAllowed(scope: PaymentScope, kind: PaymentKind): boolean {
  return kindFor(scope) === kind;
}

/** Ids are text on both tables (contract §1). Bounded and free of
 *  path separators, because they are interpolated into redirect paths. */
export function parseEntityId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (s.length === 0 || s.length > 200) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(s)) return null;
  return s;
}

/** The page a scope/id belongs to. Built from the pair, never from a
 *  caller-supplied URL, so the payments routes cannot be used as an
 *  open redirect. */
export function eventPath(scope: PaymentScope, id: string): string {
  const safe = encodeURIComponent(id);
  return scope === 'league' ? `/app/leagues/${safe}` : `/app/tournaments/${safe}`;
}

export function paymentsSetupPath(scope: PaymentScope, id: string): string {
  return `${eventPath(scope, id)}/payments`;
}

// ── The checkout request: exactly {scope, id, kind} ─────────────

export type CheckoutRequest = { scope: PaymentScope; id: string; kind: PaymentKind };

export type ParsedCheckout =
  | { ok: true; value: CheckoutRequest }
  | { ok: false; reason: string };

const CHECKOUT_KEYS = ['id', 'kind', 'scope'];

/**
 * Validate the body our own checkout route receives. **Exactly** the
 * three keys — an `amount`, `amount_cents`, `price` or anything else is
 * a refusal, not a field we quietly drop, because a route that
 * tolerates an amount today is one refactor from forwarding it.
 */
export function parseCheckoutRequest(
  entries: Iterable<[string, unknown]> | Record<string, unknown> | null | undefined,
): ParsedCheckout {
  if (!entries || typeof entries !== 'object') return { ok: false, reason: 'empty body' };
  const pairs: Array<[string, unknown]> =
    Symbol.iterator in (entries as object)
      ? [...(entries as Iterable<[string, unknown]>)]
      : Object.entries(entries as Record<string, unknown>);
  const keys = pairs.map(([k]) => k).sort();
  const unique = new Set(keys);
  if (unique.size !== keys.length) return { ok: false, reason: 'duplicate field' };
  if (keys.join(',') !== CHECKOUT_KEYS.join(',')) {
    return { ok: false, reason: `body must be exactly {scope, id, kind}; got {${keys.join(', ')}}` };
  }
  const map = Object.fromEntries(pairs);
  const scope = parseScope(map.scope);
  const kind = parseKind(map.kind);
  const id = parseEntityId(map.id);
  if (!scope) return { ok: false, reason: 'bad scope' };
  if (!kind) return { ok: false, reason: 'bad kind' };
  if (!id) return { ok: false, reason: 'bad id' };
  return { ok: true, value: { scope, id, kind } };
}

// ── W1/W2 — what the merchant status means to a director ────────

export type MerchantState = 'not_set_up' | 'finishing' | 'ready';

export type MerchantView = {
  state: MerchantState;
  label: string;
  /** Ready, but Stripe still wants something. Nag, don't block —
   *  contract §2.2 calls this normal. */
  needsAttention: boolean;
};

/**
 * Map §2.2 to the three states the app's chip also shows. `null`
 * means the 404 `merchant_not_ready` — never onboarded.
 *
 * READY IS `charges_enabled`, and only that. Landing on the return
 * page proves nothing (Stripe: return ≠ complete), and
 * `details_submitted` alone still leaves charges off during
 * verification (plan S11: ~90 seconds of `pending_verification`).
 */
export function merchantView(status: MerchantStatusBody | null): MerchantView {
  if (!status) return { state: 'not_set_up', label: 'Not set up', needsAttention: false };
  if (status.charges_enabled !== true) {
    return { state: 'finishing', label: 'Finishing setup', needsAttention: true };
  }
  const due = Array.isArray(status.requirements_due) ? status.requirements_due : [];
  return { state: 'ready', label: 'Ready', needsAttention: due.length > 0 };
}

// ── W3 — every checkout error code gets a human sentence ────────

export type CheckoutNotice = {
  tone: 'good' | 'warn' | 'bad';
  title: string;
  body: string;
  /** The contract code this notice is for, when there is one. */
  code?: string;
};

/**
 * What the player reads when checkout refuses. Keyed on `code` only —
 * the server's `error` string is not echoed, and an unknown code gets
 * a calm generic sentence rather than raw text from a URL.
 *
 * `merchant_not_ready` deliberately says nothing about setting up
 * Stripe: the person who tapped Pay is a player, and the contract's
 * optional `onboarding_url` on that error is for the owner, not for
 * them. The website never follows it.
 */
export function checkoutNotice(code: string | null | undefined, scope: PaymentScope): CheckoutNotice | null {
  if (!code) return null;
  const n = checkoutNoticeText(code, scope);
  return (PAYMENTS_ERROR_CODES as readonly string[]).includes(code) ? { ...n, code } : n;
}

function checkoutNoticeText(code: string, scope: PaymentScope): CheckoutNotice {
  const host = scope === 'league' ? 'commissioner' : 'tournament director';
  const what = scope === 'league' ? 'season dues' : 'an entry fee';
  switch (code) {
    case 'already_paid':
      return {
        tone: 'good',
        title: 'You’re paid',
        body: 'There’s nothing more to pay here.',
      };
    case 'no_fee_set':
      return {
        tone: 'warn',
        title: 'Nothing to pay yet',
        body: `The ${host} hasn’t set ${what} yet. Check back later.`,
      };
    case 'merchant_not_ready':
      return {
        tone: 'warn',
        title: 'Card payments aren’t ready yet',
        body: `This ${scope} can’t take cards yet. Nothing was charged — pay the ${host} directly, or try again later.`,
      };
    case 'kind_not_allowed':
      return {
        tone: 'warn',
        title: 'Not payable by card',
        body: `That can’t be paid by card here. Nothing was charged — settle it with the ${host}.`,
      };
    case 'payments_disabled':
      return {
        tone: 'warn',
        title: 'Card payments are off',
        body: `Card payments aren’t available for this ${scope} right now. Nothing was charged.`,
      };
    case 'not_director':
      // Not a checkout code, but a stale link can land it here.
      return {
        tone: 'bad',
        title: 'Not allowed',
        body: `Only the ${host} can do that.`,
      };
    default:
      return {
        tone: 'bad',
        title: 'Couldn’t start checkout',
        body: 'Nothing was charged. Please try again in a moment.',
      };
  }
}

/**
 * W1/W2 — what the owner reads when "Set up card payments" bounced
 * back with `?setup=<code>`. Keyed on code only; an unknown code gets
 * a generic sentence, never reflected text.
 */
export function setupNotice(code: string | null | undefined): CheckoutNotice | null {
  if (!code) return null;
  switch (code) {
    case 'not_director':
      return { tone: 'bad', title: 'Owner only.', body: 'Only the person who owns this can set up card payments.' };
    case 'payments_disabled':
      return { tone: 'warn', title: 'Not available yet.', body: 'Card payments aren’t switched on for this one yet.' };
    case 'no_email':
      return { tone: 'warn', title: 'No email on your account.', body: 'Stripe needs an email for the login. Add one to your profile and try again.' };
    default:
      return { tone: 'bad', title: 'Couldn’t reach Stripe.', body: 'Nothing was set up. Please try again in a moment.' };
  }
}

/** Only codes from the contract may ride in a `?pay=` query param;
 *  anything else is dropped rather than reflected. */
export function payNoticeCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if ((PAYMENTS_ERROR_CODES as readonly string[]).includes(raw)) return raw;
  return 'error';
}

/** Is there a settled row of this kind for the viewer? Used to swap a
 *  Pay button for "You're paid" — read from the server's list, never
 *  assumed. */
export function settledRowFor(rows: readonly PaymentRow[] | null | undefined, kind: PaymentKind): PaymentRow | null {
  for (const r of rows ?? []) {
    if (r?.kind === kind && isSettled(parsePaymentStatus(r.status))) return r;
  }
  return null;
}

// ── W4 — the /pay/success poll ──────────────────────────────────

export type PollOutcome = 'paid' | 'failed' | 'waiting';

/**
 * Decide what the success page may say from ONE server response.
 *
 * 🚨 NEVER PAID FROM THE URL. The only input that can produce `paid`
 * is a row the server returned whose `id` equals the `payment_id` the
 * page was given. No `payment_id` → `waiting` forever (the page then
 * says the calm thing), because "some settled row exists" could be
 * last season's dues, not the payment just made. Nothing about
 * `status`, `redirect_status` or any other query param is consulted —
 * the function does not even receive them.
 */
export function pollOutcome(
  body: unknown,
  paymentId: string | null | undefined,
): PollOutcome {
  if (!paymentId) return 'waiting';
  const rows = (body as { payments?: unknown } | null)?.payments;
  if (!Array.isArray(rows)) return 'waiting';
  const row = rows.find((r) => (r as { id?: unknown } | null)?.id === paymentId) as
    | { status?: unknown }
    | undefined;
  if (!row) return 'waiting';
  const status: PaymentStatus | null = parsePaymentStatus(row.status);
  if (isSettled(status)) return 'paid';
  if (status === 'failed') return 'failed';
  // pending, refunded (not a fresh outcome of this checkout), unknown.
  return 'waiting';
}

/** The query params the return pages keep intact — the app's
 *  universal-link handler reads the same three. */
export type ReturnParams = { paymentId: string | null; scope: PaymentScope | null; id: string | null };

export function readReturnParams(search: URLSearchParams): ReturnParams {
  return {
    paymentId: search.get('payment_id'),
    scope: parseScope(search.get('scope')),
    id: parseEntityId(search.get('id')),
  };
}
