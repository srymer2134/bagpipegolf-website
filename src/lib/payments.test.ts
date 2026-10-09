// Card payments W1–W4 — the pure rules, the fixtures' fidelity to the
// contract, and the flag gate exercised through the real route
// handlers.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./railway', async (orig) => {
  const real = await orig<typeof import('./railway')>();
  return { ...real, callRailway: vi.fn() };
});

import { callRailway, RailwayApiError } from './railway';
import {
  PAYMENTS_ERROR_CODES,
  checkoutNotice,
  eventPath,
  isKindAllowed,
  kindFor,
  merchantView,
  parseCheckoutRequest,
  parseEntityId,
  payNoticeCode,
  paymentsMode,
  pollOutcome,
  readReturnParams,
  settledRowFor,
  setupNotice,
  type MerchantStatusBody,
  type PaymentRow,
} from './payments';
import { FIXTURE_NAMES, createCheckout } from './paymentsServer';
import { isStripeUrl } from './paymentsRoutes';
import { POST as checkoutPOST } from '../pages/api/payments/checkout-session';
import { GET as paymentsGET } from '../pages/api/payments/index';
import { POST as onboardPOST } from '../pages/api/merchants/onboard';
import { GET as refreshGET } from '../pages/app/payments/refresh';

const FIX_DIR = 'src/lib/__fixtures__/payments';
const fixture = (name: string) =>
  JSON.parse(readFileSync(join(FIX_DIR, `${name}.json`), 'utf8')) as { http: number; body: any };

// ── The flag gate ───────────────────────────────────────────────

describe('paymentsMode — off unless PAYMENTS_ENABLED', () => {
  it('is off with nothing set (production today)', () => {
    expect(paymentsMode(undefined, false)).toBe('off');
    expect(paymentsMode({}, false)).toBe('off');
    expect(paymentsMode({ PAYMENTS_ENABLED: '' }, true)).toBe('off');
    expect(paymentsMode({ PAYMENTS_ENABLED: '0' }, false)).toBe('off');
    expect(paymentsMode({ PAYMENTS_ENABLED: 'false' }, false)).toBe('off');
  });

  it('PAYMENTS_FIXTURES alone turns nothing on', () => {
    expect(paymentsMode({ PAYMENTS_FIXTURES: '1' }, true)).toBe('off');
  });

  it('enabled means live against Railway', () => {
    expect(paymentsMode({ PAYMENTS_ENABLED: '1' }, false)).toBe('live');
    expect(paymentsMode({ PAYMENTS_ENABLED: 'true' }, true)).toBe('live');
  });

  it('fixtures answer only in a dev server — never in a built Worker', () => {
    expect(paymentsMode({ PAYMENTS_ENABLED: '1', PAYMENTS_FIXTURES: '1' }, true)).toBe('fixtures');
    // The production Worker with PAYMENTS_FIXTURES set by mistake.
    expect(paymentsMode({ PAYMENTS_ENABLED: '1', PAYMENTS_FIXTURES: '1' }, false)).toBe('live');
  });
});

type Env = Record<string, string>;
function ctx(opts: {
  env?: Env;
  method?: string;
  url: string;
  form?: Record<string, string> | Array<[string, string]>;
  user?: { id: string; email?: string } | null;
}) {
  const url = new URL(opts.url, 'https://bagpipegolf.com');
  let body: FormData | undefined;
  if (opts.form) {
    body = new FormData();
    const pairs = Array.isArray(opts.form) ? opts.form : Object.entries(opts.form);
    for (const [k, v] of pairs) body.append(k, v);
  }
  const request = new Request(url, { method: opts.method ?? 'GET', body });
  return {
    request,
    url,
    params: {},
    cookies: { get: () => undefined, set: () => {}, delete: () => {}, has: () => false },
    locals: {
      runtime: { env: { RAILWAY_API_URL: 'https://railway.test', ...(opts.env ?? {}) } },
      user: opts.user === undefined ? { id: 'u1', email: 'p@example.com' } : opts.user,
      session: { access_token: 'jwt' },
    },
  } as any;
}

describe('with the flag OFF every payments route 404s', () => {
  beforeEach(() => vi.mocked(callRailway).mockReset());

  it('checkout-session', async () => {
    const res = await checkoutPOST(
      ctx({ method: 'POST', url: '/api/payments/checkout-session', form: { scope: 'league', id: 'lg1', kind: 'season_dues' } }),
    );
    expect(res.status).toBe(404);
  });
  it('payments list', async () => {
    const res = await paymentsGET(ctx({ url: '/api/payments?scope=league&id=lg1' }));
    expect(res.status).toBe(404);
  });
  it('onboard', async () => {
    const res = await onboardPOST(
      ctx({ method: 'POST', url: '/api/merchants/onboard', form: { scope: 'league', id: 'lg1' } }),
    );
    expect(res.status).toBe(404);
  });
  it('refresh', async () => {
    const res = await refreshGET(ctx({ url: '/app/payments/refresh?scope=league&id=lg1' }));
    expect(res.status).toBe(404);
  });
  it('none of them reached Railway', () => {
    expect(callRailway).not.toHaveBeenCalled();
  });
  it('fixtures env without PAYMENTS_ENABLED is still off', async () => {
    const res = await paymentsGET(
      ctx({ env: { PAYMENTS_FIXTURES: '1' }, url: '/api/payments?scope=league&id=lg1' }),
    );
    expect(res.status).toBe(404);
  });
});

// ── No amount on the wire ───────────────────────────────────────

describe('checkout request is exactly {scope, id, kind}', () => {
  it('accepts the three fields', () => {
    expect(parseCheckoutRequest({ scope: 'league', id: 'lg_1', kind: 'season_dues' })).toEqual({
      ok: true,
      value: { scope: 'league', id: 'lg_1', kind: 'season_dues' },
    });
  });

  it.each([
    [{ scope: 'league', id: 'lg1', kind: 'season_dues', amount: '1' }],
    [{ scope: 'league', id: 'lg1', kind: 'season_dues', amount_cents: '1' }],
    [{ scope: 'league', id: 'lg1', kind: 'season_dues', price: '1' }],
    [{ scope: 'league', id: 'lg1' }],
    [{}],
  ])('refuses %j', (body) => {
    expect(parseCheckoutRequest(body).ok).toBe(false);
  });

  it('refuses a duplicated field rather than picking one', () => {
    const fd = new FormData();
    fd.append('scope', 'league');
    fd.append('id', 'lg1');
    fd.append('kind', 'season_dues');
    fd.append('kind', 'entry_fee');
    expect(parseCheckoutRequest(fd.entries()).ok).toBe(false);
  });

  it.each([
    [{ scope: 'club', id: 'x', kind: 'season_dues' }],
    [{ scope: 'league', id: 'x', kind: 'weekly_pot' }],
    [{ scope: 'league', id: '../etc', kind: 'season_dues' }],
    [{ scope: 'league', id: '', kind: 'season_dues' }],
  ])('refuses bad values %j', (body) => {
    expect(parseCheckoutRequest(body).ok).toBe(false);
  });

  it('the route 400s on an amount and never calls Railway', async () => {
    vi.mocked(callRailway).mockReset();
    const res = await checkoutPOST(
      ctx({
        env: { PAYMENTS_ENABLED: '1' },
        method: 'POST',
        url: '/api/payments/checkout-session',
        form: { scope: 'league', id: 'lg1', kind: 'season_dues', amount_cents: '1' },
      }),
    );
    expect(res.status).toBe(400);
    expect(callRailway).not.toHaveBeenCalled();
  });

  it('the Railway body is exactly the three fields, and the browser goes to Stripe', async () => {
    vi.mocked(callRailway).mockReset();
    vi.mocked(callRailway).mockResolvedValue(fixture('checkout_created').body);
    const res = await checkoutPOST(
      ctx({
        env: { PAYMENTS_ENABLED: '1' },
        method: 'POST',
        url: '/api/payments/checkout-session',
        form: { scope: 'league', id: 'lg1', kind: 'season_dues' },
      }),
    );
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toMatch(/^https:\/\/checkout\.stripe\.com\//);
    const init = vi.mocked(callRailway).mock.calls[0][1];
    expect(init).toEqual({
      method: 'POST',
      path: '/api/payments/checkout-session',
      body: { scope: 'league', id: 'lg1', kind: 'season_dues' },
    });
  });

  it('a refusal goes back to the event page with the code, never to a caller URL', async () => {
    vi.mocked(callRailway).mockReset();
    const f = fixture('error_merchant_not_ready');
    vi.mocked(callRailway).mockRejectedValue(new RailwayApiError(f.http, f.body.error, f.body));
    const res = await checkoutPOST(
      ctx({
        env: { PAYMENTS_ENABLED: '1' },
        method: 'POST',
        url: '/api/payments/checkout-session',
        form: { scope: 'tournament', id: 'tourney_1', kind: 'entry_fee' },
      }),
    );
    expect(res.status).toBe(303);
    // Back to the event page — a player is never sent toward Stripe setup.
    expect(res.headers.get('location')).toBe('/app/tournaments/tourney_1?pay=merchant_not_ready#pay');
  });

  it('createCheckout copies only the three fields even if handed more', async () => {
    vi.mocked(callRailway).mockReset();
    vi.mocked(callRailway).mockResolvedValue(fixture('checkout_created').body);
    await createCheckout(
      { locals: {} as App.Locals },
      'live',
      { scope: 'league', id: 'lg1', kind: 'season_dues', amount_cents: 1 } as any,
    );
    expect(Object.keys(vi.mocked(callRailway).mock.calls[0][1].body as object).sort()).toEqual([
      'id',
      'kind',
      'scope',
    ]);
  });
});

describe('K4 — what a card may pay for, per scope', () => {
  it('league pays season dues; a tournament pays an entry fee', () => {
    expect(kindFor('league')).toBe('season_dues');
    expect(kindFor('tournament')).toBe('entry_fee');
    expect(isKindAllowed('league', 'entry_fee')).toBe(false);
    expect(isKindAllowed('tournament', 'season_dues')).toBe(false);
  });
});

// ── W1/W2 status mapping ────────────────────────────────────────

describe('merchantView — return ≠ complete', () => {
  const base = fixture('merchant_ready').body as MerchantStatusBody;

  it('never onboarded → Not set up', () => {
    expect(merchantView(null).state).toBe('not_set_up');
  });
  it('charges off → Finishing setup, even with details submitted', () => {
    expect(merchantView({ ...base, charges_enabled: false, details_submitted: true }).state).toBe('finishing');
    expect(merchantView(fixture('merchant_finishing').body).label).toBe('Finishing setup');
  });
  it('charges on → Ready', () => {
    expect(merchantView(base)).toEqual({ state: 'ready', label: 'Ready', needsAttention: false });
  });
  it('Ready with requirements due nags without blocking', () => {
    const v = merchantView(fixture('merchant_ready_requirements_due').body);
    expect(v.state).toBe('ready');
    expect(v.needsAttention).toBe(true);
  });
});

// ── W3 error codes ──────────────────────────────────────────────

describe('checkoutNotice — every contract code has a human sentence', () => {
  it.each(PAYMENTS_ERROR_CODES)('%s', (code) => {
    const n = checkoutNotice(code, 'league')!;
    expect(n.title.length).toBeGreaterThan(3);
    expect(n.body.length).toBeGreaterThan(10);
    expect(n.code).toBe(code);
  });

  it('the checkout codes all read differently', () => {
    const codes = ['no_fee_set', 'already_paid', 'merchant_not_ready', 'kind_not_allowed', 'payments_disabled'];
    const titles = new Set(codes.map((c) => checkoutNotice(c, 'tournament')!.title));
    expect(titles.size).toBe(codes.length);
  });

  it('already_paid says "You’re paid"', () => {
    expect(checkoutNotice('already_paid', 'league')!.title).toMatch(/You’re paid/);
  });

  it('merchant_not_ready does not send a player toward Stripe setup', () => {
    expect(checkoutNotice('merchant_not_ready', 'league')!.body).not.toMatch(/set up|onboard|stripe/i);
  });

  it('an unknown code is generic and does not echo the code', () => {
    const n = checkoutNotice('<script>', 'league')!;
    expect(n.body).not.toContain('<script>');
    expect(n.code).toBeUndefined();
  });

  it('only contract codes ride in ?pay=', () => {
    expect(payNoticeCode('already_paid')).toBe('already_paid');
    expect(payNoticeCode('anything else')).toBe('error');
    expect(payNoticeCode(null)).toBeNull();
  });

  it('setup notices exist for the owner-side codes', () => {
    expect(setupNotice('not_director')!.title).toMatch(/Owner/);
    expect(setupNotice('weird')!.body).toMatch(/try again/i);
    expect(setupNotice(null)).toBeNull();
  });

  it('no notice says a payment failed', () => {
    for (const c of [...PAYMENTS_ERROR_CODES, 'x']) {
      const n = checkoutNotice(c, 'league')!;
      expect(`${n.title} ${n.body}`).not.toMatch(/payment failed/i);
    }
  });
});

describe('settledRowFor — "You’re paid" comes from the server list', () => {
  const rows = (fixture('payments_succeeded').body.payments as PaymentRow[]);
  it('finds a settled row of the kind', () => {
    expect(settledRowFor(rows, 'season_dues')).not.toBeNull();
    expect(settledRowFor(rows, 'entry_fee')).toBeNull();
  });
  it('pending, failed and refunded are not paid', () => {
    expect(settledRowFor(fixture('payments_pending').body.payments, 'season_dues')).toBeNull();
    expect(settledRowFor(fixture('payments_failed').body.payments, 'season_dues')).toBeNull();
    expect(settledRowFor([{ ...rows[0], status: 'refunded' }], 'season_dues')).toBeNull();
  });
  it('waived and paid_offline satisfy the obligation', () => {
    expect(settledRowFor([{ ...rows[0], status: 'waived' }], 'season_dues')).not.toBeNull();
    expect(settledRowFor([{ ...rows[0], status: 'paid_offline' }], 'season_dues')).not.toBeNull();
  });
});

// ── W4 — never paid from the URL ────────────────────────────────

describe('pollOutcome — never "paid" from the URL alone', () => {
  const ok = fixture('payments_succeeded').body;
  const pid = ok.payments[0].id as string;

  it('paid only for the exact payment_id the server reports settled', () => {
    expect(pollOutcome(ok, pid)).toBe('paid');
  });
  it('no payment_id → waiting, even when a settled row exists', () => {
    expect(pollOutcome(ok, null)).toBe('waiting');
    expect(pollOutcome(ok, '')).toBe('waiting');
  });
  it('a different payment_id → waiting', () => {
    expect(pollOutcome(ok, 'not-this-one')).toBe('waiting');
  });
  it('pending → waiting; failed → failed', () => {
    expect(pollOutcome(fixture('payments_pending').body, pid)).toBe('waiting');
    expect(pollOutcome(fixture('payments_failed').body, pid)).toBe('failed');
  });
  it('an error body or garbage → waiting, not failed', () => {
    expect(pollOutcome(fixture('error_payments_disabled').body, pid)).toBe('waiting');
    expect(pollOutcome(null, pid)).toBe('waiting');
    expect(pollOutcome('<html>', pid)).toBe('waiting');
  });
  it('takes no status from the query string', () => {
    // The signature has nowhere to put one; prove the return params
    // carry only the three ids.
    const p = readReturnParams(new URLSearchParams('payment_id=x&scope=league&id=lg1&status=succeeded&redirect_status=succeeded'));
    expect(Object.keys(p).sort()).toEqual(['id', 'paymentId', 'scope']);
  });
});

describe('/pay/* pages', () => {
  const success = readFileSync('src/pages/pay/success.astro', 'utf8');
  const cancel = readFileSync('src/pages/pay/cancel.astro', 'utf8');

  it('both have a neutral flag-off branch with no payment claim', () => {
    for (const page of [success, cancel]) {
      expect(page).toContain('Returning you to Bagpipe…');
      expect(page).toContain("modeFor(");
    }
    const neutral = success.slice(success.indexOf(') : ('), success.indexOf('</BaseLayout>'));
    expect(neutral).not.toMatch(/paid|charge|payment/i);
    const neutralC = cancel.slice(cancel.indexOf(') : ('), cancel.indexOf('</BaseLayout>'));
    expect(neutralC).not.toMatch(/paid|charge|payment/i);
  });

  it('success decides through pollOutcome', () => {
    expect(success).toContain('pollOutcome(');
  });

  it('cancel says pay any time', () => {
    expect(cancel).toMatch(/pay any time/);
  });
});

// ── Fixtures match the contract ─────────────────────────────────

describe('fixtures are contract-shaped', () => {
  const names = readdirSync(FIX_DIR).filter((f: string) => f.endsWith('.json')).map((f: string) => f.replace('.json', ''));

  it('the server sees every fixture file', () => {
    expect([...FIXTURE_NAMES].sort()).toEqual(names.sort());
  });

  it('every contract error code has a fixture with the envelope', () => {
    for (const code of PAYMENTS_ERROR_CODES) {
      const f = fixture(`error_${code}`);
      expect(f.http).toBeGreaterThanOrEqual(400);
      expect(f.body).toEqual(expect.objectContaining({ code, error: expect.any(String) }));
    }
    expect(fixture('error_already_paid').body.payment.id).toBeTruthy();
    // Contract amendment 2026-10-07 (§78): checkout is a player's call,
    // so merchant_not_ready carries no Account Link.
    expect(fixture('error_merchant_not_ready').body).not.toHaveProperty('onboarding_url');
    expect(Object.keys(fixture('error_merchant_not_ready').body).sort()).toEqual(['code', 'error']);
  });

  it('HTTP statuses match the contract table', () => {
    expect(fixture('error_no_fee_set').http).toBe(400);
    expect(fixture('error_already_paid').http).toBe(409);
    expect(fixture('error_merchant_not_ready').http).toBe(409);
    expect(fixture('error_kind_not_allowed').http).toBe(400);
    expect(fixture('error_not_director').http).toBe(403);
    expect(fixture('error_payments_disabled').http).toBe(503);
    expect(fixture('merchant_not_set_up').http).toBe(404);
    expect(fixture('onboard_created').http).toBe(201);
    expect(fixture('checkout_created').http).toBe(201);
  });

  it('§2.1 / §2.2 / §2.3 / §2.4 keys', () => {
    expect(Object.keys(fixture('onboard_created').body).sort()).toEqual(
      ['charges_enabled', 'expires_at', 'merchant_account_id', 'onboarding_url', 'payouts_enabled'],
    );
    expect(Object.keys(fixture('merchant_ready').body).sort()).toEqual([
      'charges_enabled', 'controller_fees_payer', 'details_submitted', 'livemode',
      'merchant_account_id', 'payouts_enabled', 'requirements_due',
    ]);
    expect(Object.keys(fixture('checkout_created').body).sort()).toEqual(
      ['amount_cents', 'checkout_url', 'currency', 'expires_at', 'payment_id'],
    );
    expect(Object.keys(fixture('payments_succeeded').body.payments[0]).sort()).toEqual([
      'amount_cents', 'application_fee_cents', 'created_at', 'currency', 'id', 'kind',
      'league_id', 'livemode', 'paid_at', 'profile_id', 'refunded_at', 'scope', 'status',
      'stripe_checkout_session_id', 'stripe_payment_intent_id', 'tournament_id',
      'updated_at', 'waived_by', 'waived_reason',
    ]);
  });

  it('Stripe URLs in fixtures pass the redirect guard', () => {
    expect(isStripeUrl(fixture('onboard_created').body.onboarding_url, 'connect')).toBe(true);
    expect(isStripeUrl(fixture('checkout_created').body.checkout_url, 'checkout')).toBe(true);
  });
});

describe('redirect guards', () => {
  it('only Stripe-hosted https URLs', () => {
    expect(isStripeUrl('https://checkout.stripe.com/c/pay/x', 'checkout')).toBe(true);
    expect(isStripeUrl('http://checkout.stripe.com/c/pay/x', 'checkout')).toBe(false);
    expect(isStripeUrl('https://checkout.stripe.com.evil.test/', 'checkout')).toBe(false);
    expect(isStripeUrl('https://connect.stripe.com/x', 'checkout')).toBe(false);
    expect(isStripeUrl('/app', 'connect')).toBe(false);
  });
  it('event paths are built from the pair', () => {
    expect(eventPath('league', 'lg_1')).toBe('/app/leagues/lg_1');
    expect(eventPath('tournament', 'tourney_1')).toBe('/app/tournaments/tourney_1');
    expect(parseEntityId('a/b')).toBeNull();
    expect(parseEntityId('//evil.test')).toBeNull();
  });
});

// ── No Stripe in this repo ──────────────────────────────────────

describe('no Stripe SDK, no secret key', () => {
  it('package.json has no stripe dependency', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    expect(Object.keys(deps).filter((d) => /stripe/i.test(d))).toEqual([]);
  });
  it('no source file carries a Stripe secret key or loads Stripe.js', () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e: any) =>
        e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
      );
    for (const f of walk('src')) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/\b(sk|rk)_(live|test)_[A-Za-z0-9]/);
      expect(src, f).not.toMatch(/js\.stripe\.com/);
    }
  });
});
