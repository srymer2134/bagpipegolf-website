// W5 (director roster) and the signup page's season-dues step — the
// pure rules, the fixtures' fidelity to the contract, and the routes
// exercised through their real handlers.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./railway', async (orig) => {
  const real = await orig<typeof import('./railway')>();
  return { ...real, callRailway: vi.fn() };
});

// The owner check reads `leagues.user_id` through Supabase. The fake
// client answers that one query with whatever `owner` is set to.
let owner: string | null = 'owner-1';
vi.mock('./supabase', () => ({
  createSupabaseClient: () => ({
    from: () => {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({
          data: { id: 'lg1', name: 'Test League', user_id: owner, dues_cents: 5000, dues_due_date: null },
          error: null,
        }),
      };
      return q;
    },
  }),
}));

import { callRailway, RailwayApiError } from './railway';
import { PAYMENTS_ERROR_CODES, checkoutNotice, type PaymentRow } from './payments';
import { statusLabel } from './paymentStatus';
import {
  parseCheckoutOrigin,
  parseRosterAction,
  parseSlot,
  rosterNotice,
  rosterPayments,
  rosterResultCode,
  rosterSummary,
  showSignupDuesStep,
} from './paymentsRoster';
import { signupDuesStep, type SignupDuesDeps } from './paymentsSignup';
import { withQuery } from './paymentsRoutes';
import { POST as markOfflinePOST } from '../pages/api/payments/mark-offline';
import { POST as waivePOST } from '../pages/api/payments/waive';
import { POST as checkoutPOST } from '../pages/api/payments/checkout-session';

const FIX_DIR = 'src/lib/__fixtures__/payments';
const fixture = (name: string) =>
  JSON.parse(readFileSync(join(FIX_DIR, `${name}.json`), 'utf8')) as { http: number; body: any };

const P = (n: number) => `11ee2a3b-4c5d-4e6f-8a7b-9c0d1e2f3a${String(n).padStart(2, '0')}`;
const ROW_KEYS = [
  'amount_cents', 'application_fee_cents', 'created_at', 'currency', 'id', 'kind',
  'league_id', 'livemode', 'paid_at', 'profile_id', 'refunded_at', 'scope', 'status',
  'stripe_checkout_session_id', 'stripe_payment_intent_id', 'tournament_id',
  'updated_at', 'waived_by', 'waived_reason',
];

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
      user: opts.user === undefined ? { id: 'owner-1', email: 'o@example.com' } : opts.user,
      session: { access_token: 'jwt' },
    },
  } as any;
}
const ON = { PAYMENTS_ENABLED: '1' };
const okForm = { scope: 'league', id: 'lg1', profile_id: P(7) };

// ── Roster status labels ────────────────────────────────────────

describe('roster status labels — paid_offline is not waived', () => {
  it('the six contract statuses, plus never-attempted', () => {
    expect(statusLabel('paid_offline')).toBe('Paid (cash)');
    expect(statusLabel('waived')).toBe('Waived');
    expect(statusLabel('succeeded')).toBe('Paid');
    expect(statusLabel('pending')).toBe('Pending');
    expect(statusLabel('failed')).toBe('Failed');
    expect(statusLabel('refunded')).toBe('Refunded');
    expect(statusLabel(null)).toBe('Unpaid');
    expect(statusLabel('paid_offline')).not.toBe(statusLabel('waived'));
    expect(statusLabel('paid_offline')).not.toBe(statusLabel('succeeded'));
  });

  it('the roster fixture covers every status, and the roster renders each label', () => {
    const rows = fixture('payments_roster').body.payments as PaymentRow[];
    expect(rows.map((r) => r.status).sort()).toEqual(
      ['failed', 'paid_offline', 'pending', 'refunded', 'succeeded', 'waived'],
    );
    const members = rows.map((r, i) => ({ user_id: r.profile_id, display_name: `Player ${i + 1}` }));
    const out = rosterPayments(members, rows, 'season_dues');
    const byStatus = Object.fromEntries(out.map((r) => [r.status, r.label]));
    expect(byStatus).toEqual({
      succeeded: 'Paid',
      pending: 'Pending',
      failed: 'Failed',
      refunded: 'Refunded',
      waived: 'Waived',
      paid_offline: 'Paid (cash)',
    });
    expect(out.find((r) => r.status === 'waived')!.waivedReason).toBe("Commissioner's comp");
    expect(out.find((r) => r.status === 'paid_offline')!.waivedReason).toBeNull();
    // A comp shows no money figure; a cash payment does.
    expect(out.find((r) => r.status === 'waived')!.amountLabel).toBeNull();
    expect(out.find((r) => r.status === 'paid_offline')!.amountLabel).toBe('$50');
  });
});

describe('rosterPayments — joins league_members to §2.4', () => {
  const row = (over: Partial<PaymentRow>): PaymentRow =>
    ({ ...fixture('payments_succeeded').body.payments[0], ...over }) as PaymentRow;

  it('a member with no row is Unpaid and can be recorded', () => {
    const [r] = rosterPayments([{ user_id: P(1), display_name: 'Ann' }], [], 'season_dues');
    expect(r).toMatchObject({ name: 'Ann', status: null, label: 'Unpaid', canRecord: true, amountLabel: null });
  });

  it('settled rows (Paid, Paid (cash), Waived) offer no actions; the rest do', () => {
    const statuses = ['succeeded', 'paid_offline', 'waived', 'pending', 'failed', 'refunded'];
    const rows = statuses.map((s, i) => row({ id: `r${i}`, profile_id: P(i), status: s }));
    const members = statuses.map((_, i) => ({ user_id: P(i), display_name: `M${i}` }));
    const can = Object.fromEntries(rosterPayments(members, rows, 'season_dues').map((r) => [r.status, r.canRecord]));
    expect(can).toEqual({
      succeeded: false, paid_offline: false, waived: false,
      pending: true, failed: true, refunded: true,
    });
  });

  it('a settled row wins over a later failure — never "Failed" for someone who paid', () => {
    const rows = [
      row({ id: 'a', profile_id: P(1), status: 'paid_offline', updated_at: '2026-10-01T00:00:00Z' }),
      row({ id: 'b', profile_id: P(1), status: 'failed', updated_at: '2026-10-05T00:00:00Z' }),
    ];
    const [r] = rosterPayments([{ user_id: P(1), display_name: 'Ann' }], rows, 'season_dues');
    expect(r.label).toBe('Paid (cash)');
  });

  it('only the requested kind counts', () => {
    const rows = [row({ profile_id: P(1), kind: 'entry_fee', status: 'succeeded' })];
    const [r] = rosterPayments([{ user_id: P(1), display_name: 'Ann' }], rows, 'season_dues');
    expect(r.status).toBeNull();
  });

  it('a payer who left the roster is still listed, without actions', () => {
    const out = rosterPayments([{ user_id: P(1), display_name: 'Ann' }], [row({ profile_id: P(9), status: 'failed' })], 'season_dues');
    expect(out).toHaveLength(2);
    expect(out[1]).toMatchObject({ name: 'Not on the roster', onRoster: false });
  });

  it('summary counts settled vs owing', () => {
    const rows = fixture('payments_roster').body.payments as PaymentRow[];
    const members = rows.map((r) => ({ user_id: r.profile_id, display_name: 'x' }));
    expect(rosterSummary(rosterPayments(members, rows, 'season_dues'))).toEqual({ settled: 3, owing: 3 });
  });
});

// ── The owner actions: exactly the contract's fields ────────────

describe('parseRosterAction — no amount, ever', () => {
  it('accepts the required three, note optional and omitted when blank', () => {
    expect(parseRosterAction('mark_offline', okForm)).toEqual({ ok: true, value: okForm });
    expect(parseRosterAction('mark_offline', { ...okForm, note: '  ' })).toEqual({ ok: true, value: okForm });
    expect(parseRosterAction('mark_offline', { ...okForm, note: ' Venmo 10/7 ' })).toEqual({
      ok: true,
      value: { ...okForm, note: 'Venmo 10/7' },
    });
    expect(parseRosterAction('waive', { ...okForm, reason: 'Junior' })).toEqual({
      ok: true,
      value: { ...okForm, reason: 'Junior' },
    });
  });

  it.each([
    ['amount'], ['amount_cents'], ['price'], ['status'], ['waived_by'], ['kind'],
  ])('refuses an extra %s field', (k) => {
    expect(parseRosterAction('mark_offline', { ...okForm, [k]: '1' }).ok).toBe(false);
    expect(parseRosterAction('waive', { ...okForm, [k]: '1' }).ok).toBe(false);
  });

  it("refuses the other action's text field", () => {
    expect(parseRosterAction('mark_offline', { ...okForm, reason: 'x' }).ok).toBe(false);
    expect(parseRosterAction('waive', { ...okForm, note: 'x' }).ok).toBe(false);
  });

  it('refuses bad ids, duplicates and over-long text', () => {
    expect(parseRosterAction('waive', { ...okForm, profile_id: 'p_me' }).ok).toBe(false);
    expect(parseRosterAction('waive', { ...okForm, id: '../x' }).ok).toBe(false);
    expect(parseRosterAction('waive', { ...okForm, reason: 'x'.repeat(201) }).ok).toBe(false);
    expect(
      parseRosterAction('waive', [['scope', 'league'], ['id', 'lg1'], ['profile_id', P(7)], ['profile_id', P(8)]]).ok,
    ).toBe(false);
  });
});

describe('mark-offline / waive routes', () => {
  beforeEach(() => {
    vi.mocked(callRailway).mockReset();
    owner = 'owner-1';
  });

  it.each([
    ['mark-offline', markOfflinePOST],
    ['waive', waivePOST],
  ])('%s 404s with the flag off and never reaches Railway', async (path, handler) => {
    const res = await handler(ctx({ method: 'POST', url: `/api/payments/${path}`, form: okForm }));
    expect(res.status).toBe(404);
    expect(callRailway).not.toHaveBeenCalled();
  });

  it('an amount in the form is a 400, not a dropped field', async () => {
    const res = await markOfflinePOST(
      ctx({ env: ON, method: 'POST', url: '/api/payments/mark-offline', form: { ...okForm, amount_cents: '1' } }),
    );
    expect(res.status).toBe(400);
    expect(callRailway).not.toHaveBeenCalled();
  });

  it('signed out → login', async () => {
    const res = await waivePOST(ctx({ env: ON, method: 'POST', url: '/api/payments/waive', form: okForm, user: null }));
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/login?next=%2Fapp%2Fleagues%2Flg1%2Fpayments');
    expect(callRailway).not.toHaveBeenCalled();
  });

  it('OWNER ONLY: a member who is not the owner is sent to the overview and Railway is never called', async () => {
    owner = 'someone-else';
    for (const [path, handler] of [['mark-offline', markOfflinePOST], ['waive', waivePOST]] as const) {
      const res = await handler(
        ctx({ env: ON, method: 'POST', url: `/api/payments/${path}`, form: okForm, user: { id: 'member-2' } }),
      );
      expect(res.status).toBe(303);
      expect(res.headers.get('location')).toBe('/app/leagues/lg1');
    }
    expect(callRailway).not.toHaveBeenCalled();
  });

  it('the owner: Railway gets exactly the contract body, and the page says Recorded', async () => {
    vi.mocked(callRailway).mockResolvedValue(fixture('mark_offline_created').body);
    const res = await markOfflinePOST(
      ctx({ env: ON, method: 'POST', url: '/api/payments/mark-offline', form: { ...okForm, note: 'Cash wk1' } }),
    );
    expect(vi.mocked(callRailway).mock.calls[0][1]).toEqual({
      method: 'POST',
      path: '/api/payments/mark-offline',
      body: { scope: 'league', id: 'lg1', profile_id: P(7), note: 'Cash wk1' },
    });
    expect(res.headers.get('location')).toBe('/app/leagues/lg1/payments?roster=recorded_offline#roster');

    vi.mocked(callRailway).mockReset();
    vi.mocked(callRailway).mockResolvedValue(fixture('waive_created').body);
    const res2 = await waivePOST(ctx({ env: ON, method: 'POST', url: '/api/payments/waive', form: okForm }));
    expect(vi.mocked(callRailway).mock.calls[0][1]).toEqual({
      method: 'POST',
      path: '/api/payments/waive',
      body: { scope: 'league', id: 'lg1', profile_id: P(7) },
    });
    expect(res2.headers.get('location')).toBe('/app/leagues/lg1/payments?roster=recorded_waived#roster');
  });

  it('an API refusal comes back as its code', async () => {
    const f = fixture('error_already_paid');
    vi.mocked(callRailway).mockImplementation(async () => {
      throw new RailwayApiError(f.http, f.body.error, f.body);
    });
    const res = await waivePOST(ctx({ env: ON, method: 'POST', url: '/api/payments/waive', form: okForm }));
    expect(res.headers.get('location')).toBe('/app/leagues/lg1/payments?roster=already_paid#roster');
  });
});

describe('rosterNotice — recorded, never sent', () => {
  it('success says Recorded and never "sent"', () => {
    for (const c of ['recorded_offline', 'recorded_waived']) {
      const n = rosterNotice(c)!;
      expect(n.title).toBe('Recorded.');
      expect(`${n.title} ${n.body}`).not.toMatch(/\bsent\b/i);
    }
  });
  it('cash and waive read differently', () => {
    expect(rosterNotice('recorded_offline')!.body).not.toBe(rosterNotice('recorded_waived')!.body);
  });
  it('unknown codes are generic and not reflected', () => {
    expect(rosterResultCode('<script>')).toBe('error');
    expect(rosterNotice('error')!.body).not.toContain('<');
  });
});

// ── Signup step ─────────────────────────────────────────────────

function deps(over: Partial<SignupDuesDeps> = {}): SignupDuesDeps & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    mode: 'live',
    payParam: null,
    slotParam: null,
    fixture: null,
    listFixture: null,
    loadDues: async () => {
      calls.push('loadDues');
      return { duesCents: 5000, duesDueDate: '2026-04-15' };
    },
    listPayments: async () => {
      calls.push('listPayments');
      return { ok: true, status: 200, data: fixture('payments_empty').body };
    },
    withQuery,
    ...over,
  };
}

describe('signup season-dues step', () => {
  it('FLAG OFF: hidden, and nothing is loaded — the page renders as before', async () => {
    const d = deps({ mode: 'off' });
    expect(await signupDuesStep(d)).toBeNull();
    expect(d.calls).toEqual([]);
    expect(showSignupDuesStep({ mode: 'off', duesCents: 5000 })).toBe(false);
  });

  it('shows the dues (display only) and a checkout action with from=signup and no amount', async () => {
    const step = await signupDuesStep(deps({ slotParam: '3' }));
    expect(step).toMatchObject({ amountLabel: '$50 · due Apr 15', paid: false, notice: null });
    expect(step!.action).toBe('/api/payments/checkout-session?from=signup&slot=3');
    expect(step!.action).not.toMatch(/amount|price|cents/i);
  });

  it('no dues → no step', async () => {
    expect(await signupDuesStep(deps({ loadDues: async () => ({ duesCents: 0, duesDueDate: null }) }))).toBeNull();
    expect(await signupDuesStep(deps({ loadDues: async () => ({ duesCents: null, duesDueDate: null }) }))).toBeNull();
  });

  it('payments_disabled — on the read or on a bounce — hides the step entirely', async () => {
    const f = fixture('error_payments_disabled');
    expect(
      await signupDuesStep(deps({
        listPayments: async () => ({ ok: false, status: f.http, code: f.body.code, error: f.body.error, body: f.body }),
      })),
    ).toBeNull();
    expect(await signupDuesStep(deps({ payParam: 'payments_disabled' }))).toBeNull();
  });

  it('a settled row shows "You\'re paid"', async () => {
    const step = await signupDuesStep(deps({
      listPayments: async () => ({ ok: true, status: 200, data: fixture('payments_roster').body }),
    }));
    expect(step!.paid).toBe(true);
  });

  it('a failed payments read still offers Pay (the server refuses if needed)', async () => {
    const step = await signupDuesStep(deps({
      listPayments: async () => ({ ok: false, status: 404, code: 'upstream_error', error: 'x', body: null }),
    }));
    expect(step).not.toBeNull();
    expect(step!.paid).toBe(false);
  });

  it.each(['already_paid', 'merchant_not_ready', 'no_fee_set', 'kind_not_allowed', 'not_director'])(
    'a %s bounce keeps the step and carries the human message',
    async (code) => {
      const step = await signupDuesStep(deps({ payParam: code }));
      expect(step!.notice!.code).toBe(code);
    },
  );
});

describe('each contract error code → the message a player reads', () => {
  it('already_paid → You’re paid', () => {
    expect(checkoutNotice('already_paid', 'league')!.title).toBe('You’re paid');
  });
  it('merchant_not_ready → pay the commissioner directly for now, no setup ask', () => {
    const n = checkoutNotice('merchant_not_ready', 'league')!;
    expect(n.body).toMatch(/hasn’t finished setting up card payments/);
    expect(n.body).toMatch(/pay the commissioner directly for now/);
    expect(n.body).not.toMatch(/stripe|onboard|connect/i);
  });
  it.each(PAYMENTS_ERROR_CODES)('%s has its own sentence', (code) => {
    const n = checkoutNotice(code, 'league')!;
    expect(n.code).toBe(code);
    expect(n.body.length).toBeGreaterThan(10);
  });
});

describe('checkout from the signup page', () => {
  // Braces matter: a beforeEach that RETURNS a function has it run as
  // teardown — and `mockReset()` returns the mock itself.
  beforeEach(() => {
    vi.mocked(callRailway).mockReset();
  });

  it('a refusal returns to the signup page (rebuilt from scope+id), not a caller URL', async () => {
    const f = fixture('error_merchant_not_ready');
    vi.mocked(callRailway).mockImplementation(async () => {
      throw new RailwayApiError(f.http, f.body.error, f.body);
    });
    const res = await checkoutPOST(
      ctx({
        env: ON,
        method: 'POST',
        url: '/api/payments/checkout-session?from=signup&slot=2',
        form: { scope: 'league', id: 'lg1', kind: 'season_dues' },
      }),
    );
    expect(res.headers.get('location')).toBe('/app/leagues/lg1/signup?slot=2&pay=merchant_not_ready#pay');
    // The body is still exactly three fields.
    expect(vi.mocked(callRailway).mock.calls[0][1].body).toEqual({ scope: 'league', id: 'lg1', kind: 'season_dues' });
  });

  it('only "signup" and a small integer slot are honoured', () => {
    expect(parseCheckoutOrigin('https://evil.test')).toBe('event');
    expect(parseCheckoutOrigin('signup')).toBe('signup');
    expect(parseSlot('//evil')).toBeNull();
    expect(parseSlot('12')).toBe('12');
    expect(parseSlot('1234')).toBeNull();
  });
});

// ── Fixtures ────────────────────────────────────────────────────

describe('W5 fixtures are contract-shaped', () => {
  it('§2.6 / §2.7 — 201 with {payment}, nullable Stripe ids', () => {
    for (const [name, status] of [['mark_offline_created', 'paid_offline'], ['waive_created', 'waived']] as const) {
      const f = fixture(name);
      expect(f.http).toBe(201);
      expect(Object.keys(f.body)).toEqual(['payment']);
      expect(Object.keys(f.body.payment).sort()).toEqual(ROW_KEYS);
      expect(f.body.payment.status).toBe(status);
      expect(f.body.payment.stripe_payment_intent_id).toBeNull();
    }
    expect(fixture('waive_created').body.payment.waived_by).toBeTruthy();
    expect(fixture('mark_offline_created').body.payment.waived_by).toBeNull();
  });
  it('§2.4 roster list rows have exactly the contract keys', () => {
    for (const r of fixture('payments_roster').body.payments) expect(Object.keys(r).sort()).toEqual(ROW_KEYS);
  });
});
