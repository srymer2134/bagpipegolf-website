// Card payments — the I/O half. Every call goes to Railway through
// `callRailway` with the signed-in user's Supabase JWT, or, in
// `astro dev` with `PAYMENTS_FIXTURES=1`, to the contract-shaped JSON
// in `__fixtures__/payments/`.
//
// 🚨 NO STRIPE HERE. No `stripe` package, no secret key, no Stripe.js.
// All Stripe logic lives in fairwayiq-api (plan §3.2); this site only
// asks Railway for a URL and sends the browser to it.
//
// The endpoints (PAYMENTS_API_CONTRACT_V1 §2.1–2.4, 2.6, 2.7) do not exist
// on Railway yet — they are Patrick's plan Phases 3–4. Until they do,
// `live` mode gets a 404 from Railway, which every caller below
// already renders as a calm "not available" rather than a failure.

import { callRailway, RailwayApiError } from './railway';
import {
  paymentsMode,
  type CheckoutRequest,
  type CheckoutSessionBody,
  type MerchantStatusBody,
  type OnboardBody,
  type PaymentScope,
  type PaymentsErrorBody,
  type PaymentsListBody,
  type PaymentsMode,
  type PaymentRow,
} from './payments';
import type { MarkOfflineRequest, WaiveRequest } from './paymentsRoster';

type Ctx = { locals: App.Locals };

export type ApiResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; code: string; error: string; body: PaymentsErrorBody | null };

/** The mode for this request. `import.meta.env.DEV` is false in every
 *  built Worker, so fixtures are unreachable in production. */
export function modeFor(locals: App.Locals | undefined): PaymentsMode {
  return paymentsMode(locals?.runtime?.env as Record<string, unknown> | undefined, import.meta.env.DEV);
}

// ── Fixtures ────────────────────────────────────────────────────

type Fixture = { http: number; body: unknown };

const FIXTURES: Record<string, Fixture> = Object.fromEntries(
  Object.entries(
    import.meta.glob<Fixture>('./__fixtures__/payments/*.json', { eager: true, import: 'default' }),
  ).map(([path, f]) => [path.replace(/^.*\/(.+)\.json$/, '$1'), f]),
);

export const FIXTURE_NAMES: readonly string[] = Object.keys(FIXTURES).sort();

/**
 * Pick a fixture: `?fixture=<name>` on the page URL when it names a
 * fixture file of the right family, otherwise the default. Unknown
 * names fall back rather than throwing, so a typo shows the default
 * state instead of a 500.
 */
export function pickFixture(
  requested: string | null | undefined,
  allowed: readonly string[],
  fallback: string,
): Fixture {
  const name = requested && allowed.includes(requested) && FIXTURES[requested] ? requested : fallback;
  const f = FIXTURES[name];
  if (!f) throw new Error(`payments fixture missing: ${name}`);
  return f;
}

function fromFixture<T>(f: Fixture): ApiResult<T> {
  if (f.http >= 200 && f.http < 300) return { ok: true, status: f.http, data: f.body as T };
  const body = f.body as PaymentsErrorBody;
  return { ok: false, status: f.http, code: body.code, error: body.error, body };
}

const ERROR_FIXTURES = FIXTURE_NAMES.filter((n) => n.startsWith('error_'));
const MERCHANT_FIXTURES = FIXTURE_NAMES.filter((n) => n.startsWith('merchant_'));
const PAYMENTS_FIXTURES = FIXTURE_NAMES.filter((n) => n.startsWith('payments_'));

// ── Live ────────────────────────────────────────────────────────

async function live<T>(ctx: Ctx, init: Parameters<typeof callRailway>[1]): Promise<ApiResult<T>> {
  try {
    const data = await callRailway<T>(ctx, init);
    return { ok: true, status: 200, data };
  } catch (err) {
    if (err instanceof RailwayApiError) {
      const body =
        err.body && typeof err.body === 'object' && 'code' in (err.body as object)
          ? (err.body as PaymentsErrorBody)
          : null;
      return {
        ok: false,
        status: err.status,
        code: body?.code ?? (err.status === 401 ? 'unauthenticated' : 'upstream_error'),
        error: body?.error ?? err.message,
        body,
      };
    }
    return { ok: false, status: 502, code: 'upstream_error', error: String(err), body: null };
  }
}

// ── The calls ──────────────────────────────────────────────

/** §2.2. A 404 `merchant_not_ready` is "never onboarded", not an error —
 *  callers check `code`. */
export function getMerchant(
  ctx: Ctx,
  mode: PaymentsMode,
  scope: PaymentScope,
  id: string,
  fixture?: string | null,
): Promise<ApiResult<MerchantStatusBody>> {
  if (mode === 'fixtures') {
    return Promise.resolve(fromFixture(pickFixture(fixture, MERCHANT_FIXTURES, 'merchant_not_set_up')));
  }
  return live(ctx, {
    method: 'GET',
    path: `/api/merchants/${encodeURIComponent(scope)}/${encodeURIComponent(id)}`,
  });
}

/** §2.1. Called ONLY from a POST handler or Stripe's refresh redirect —
 *  never while rendering a page, because the link is single-use and a
 *  link-preview bot would burn it. `owner_email` comes from the
 *  session, never from the form (F5: one designated login). */
export function onboard(
  ctx: Ctx,
  mode: PaymentsMode,
  scope: PaymentScope,
  id: string,
  ownerEmail: string,
  fixture?: string | null,
): Promise<ApiResult<OnboardBody>> {
  if (mode === 'fixtures') {
    return Promise.resolve(
      fromFixture(pickFixture(fixture, ['onboard_created', ...ERROR_FIXTURES], 'onboard_created')),
    );
  }
  return live(ctx, {
    method: 'POST',
    path: '/api/merchants/onboard',
    body: { scope, id, owner_email: ownerEmail },
  });
}

/** §2.3. The body is built here from a validated `CheckoutRequest` —
 *  three fields, no amount, by construction. */
export function createCheckout(
  ctx: Ctx,
  mode: PaymentsMode,
  req: CheckoutRequest,
  fixture?: string | null,
): Promise<ApiResult<CheckoutSessionBody>> {
  if (mode === 'fixtures') {
    return Promise.resolve(
      fromFixture(pickFixture(fixture, ['checkout_created', ...ERROR_FIXTURES], 'checkout_created')),
    );
  }
  const body: CheckoutRequest = { scope: req.scope, id: req.id, kind: req.kind };
  return live(ctx, { method: 'POST', path: '/api/payments/checkout-session', body });
}

/** §2.4. RLS on the API side decides which rows come back; a player
 *  sees only their own. */
export function listPayments(
  ctx: Ctx,
  mode: PaymentsMode,
  scope: PaymentScope,
  id: string,
  fixture?: string | null,
): Promise<ApiResult<PaymentsListBody>> {
  if (mode === 'fixtures') {
    // An error fixture is allowed too, so `payments_disabled` on the
    // read (which hides the signup page's dues step) is viewable.
    return Promise.resolve(
      fromFixture(pickFixture(fixture, [...PAYMENTS_FIXTURES, ...ERROR_FIXTURES], 'payments_empty')),
    );
  }
  return live(ctx, { method: 'GET', path: '/api/payments', query: { scope, id } });
}

/** §2.6 — the director collected cash. No Stripe call on the API side
 *  either. The body is rebuilt from the validated request: the
 *  contract's fields and nothing else, never an amount. */
export function markOffline(
  ctx: Ctx,
  mode: PaymentsMode,
  req: MarkOfflineRequest,
  fixture?: string | null,
): Promise<ApiResult<{ payment: PaymentRow }>> {
  if (mode === 'fixtures') {
    return Promise.resolve(
      fromFixture(pickFixture(fixture, ['mark_offline_created', ...ERROR_FIXTURES], 'mark_offline_created')),
    );
  }
  const body: MarkOfflineRequest = { scope: req.scope, id: req.id, profile_id: req.profile_id };
  if (req.note) body.note = req.note;
  return live(ctx, { method: 'POST', path: '/api/payments/mark-offline', body });
}

/** §2.7 — the director comped them. Same shape as §2.6 with `reason`. */
export function waive(
  ctx: Ctx,
  mode: PaymentsMode,
  req: WaiveRequest,
  fixture?: string | null,
): Promise<ApiResult<{ payment: PaymentRow }>> {
  if (mode === 'fixtures') {
    return Promise.resolve(
      fromFixture(pickFixture(fixture, ['waive_created', ...ERROR_FIXTURES], 'waive_created')),
    );
  }
  const body: WaiveRequest = { scope: req.scope, id: req.id, profile_id: req.profile_id };
  if (req.reason) body.reason = req.reason;
  return live(ctx, { method: 'POST', path: '/api/payments/waive', body });
}

/** 404 the way the repo's other gated surfaces do (`env-diag`, the
 *  admin plan page): a prober learns nothing. */
export function notFound(): Response {
  return new Response('Not found', { status: 404 });
}

/** In fixture mode only, the `?fixture=` the page was opened with. */
export function fixtureParam(mode: PaymentsMode, url: URL): string | null {
  return mode === 'fixtures' ? url.searchParams.get('fixture') : null;
}
