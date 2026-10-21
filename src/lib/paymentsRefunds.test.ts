// Card payments Phase 5 — refunds and disputes (Sam, 2026-10-21).
// The pure rules, the fixtures' fidelity to the frozen wire, the
// client's error mapping, and the refund route through its real
// handler.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./railway', async (orig) => {
  const real = await orig<typeof import('./railway')>();
  return { ...real, callRailway: vi.fn() };
});

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
import { errorCodeOf, pollOutcome, settledRowFor, type PaymentRow } from './payments';
import {
  canRefund,
  parseDisputeStatus,
  parseRefundAction,
  refundConfirmCopy,
  refundNotice,
  refundOutcome,
  refundResultCode,
  REFUND_ERROR_CODES,
  REFUND_RESULT_CODES,
  rowSettled,
  rowStatusView,
} from './paymentsRefunds';
import { rosterPayments, rosterSummary } from './paymentsRoster';
import { refundPayment } from './paymentsServer';
import { POST as refundPOST } from '../pages/api/payments/refund';

const FIX_DIR = 'src/lib/__fixtures__/payments';
const fixture = (name: string) =>
  JSON.parse(readFileSync(join(FIX_DIR, `${name}.json`), 'utf8')) as { http: number; body: any };

const P = (n: number) => `11ee2a3b-4c5d-4e6f-8a7b-9c0d1e2f3a${String(n).padStart(2, '0')}`;
const I = (n: number) => `9d2a6f0e-3b1c-4c7a-9e2f-5a1b2c3d4e${String(n).padStart(2, '0')}`;
const ROW_KEYS = [
  'amount_cents', 'application_fee_cents', 'created_at', 'currency', 'id', 'kind',
  'league_id', 'livemode', 'paid_at', 'profile_id', 'refunded_at', 'scope', 'status',
  'stripe_checkout_session_id', 'stripe_payment_intent_id', 'tournament_id',
  'updated_at', 'waived_by', 'waived_reason',
];
const PHASE5_KEYS = [...ROW_KEYS, 'dispute_status', 'disputed_at', 'duplicate_refunded_cents', 'refunded_cents'].sort();

const rows = () => fixture('payments_disputes_refunds').body.payments as PaymentRow[];
const byId = (n: number) => rows().find((r) => r.id === I(n))!;
const base = (over: Partial<PaymentRow> = {}): PaymentRow => ({ ...byId(21), ...over });

// ── Labels: every case ──────────────────────────────────────────

describe('rowStatusView — every Phase 5 label', () => {
  it('maps each fixture row to its label, tone and note', () => {
    const got = rows().map((r) => rowStatusView(r));
    expect(got).toEqual([
      { label: 'Paid', tone: 'good', note: null },
      { label: 'Disputed', tone: 'warn', note: null },
      { label: 'Dispute won', tone: 'good', note: null },
      { label: 'Disputed — unpaid', tone: 'bad', note: null },
      { label: 'Partially refunded $20', tone: 'warn', note: null },
      { label: 'Refunded', tone: 'neutral', note: null },
      { label: 'Paid (cash)', tone: 'good', note: 'Card payment auto-refunded $50' },
      { label: 'Waived', tone: 'good', note: 'Card payment auto-refunded $50' },
    ]);
  });

  it('a pre-Phase-5 row (fields absent) reads exactly as before', () => {
    for (const r of fixture('payments_roster').body.payments as PaymentRow[]) {
      expect(Object.keys(r)).not.toContain('dispute_status');
      const v = rowStatusView(r);
      expect(v.note).toBeNull();
      expect(v.label).toBe(
        { succeeded: 'Paid', pending: 'Pending', failed: 'Failed', refunded: 'Refunded', waived: 'Waived', paid_offline: 'Paid (cash)' }[r.status],
      );
    }
  });

  it('partial refund needs 0 < refunded_cents < amount_cents', () => {
    expect(rowStatusView(base({ refunded_cents: 0 })).label).toBe('Paid');
    expect(rowStatusView(base({ refunded_cents: 1 })).label).toBe('Partially refunded $0.01');
    expect(rowStatusView(base({ refunded_cents: 5000 })).label).toBe('Paid');
  });

  it('a lost dispute still reported as succeeded never reads as paid', () => {
    expect(rowStatusView(base({ dispute_status: 'lost' })).label).toBe('Disputed — unpaid');
  });

  it('the auto-refund note is only for cash/waived rows with a duplicate refund', () => {
    expect(rowStatusView(base({ duplicate_refunded_cents: 5000 })).note).toBeNull();
    expect(rowStatusView(base({ status: 'paid_offline', duplicate_refunded_cents: 0 })).note).toBeNull();
    expect(rowStatusView(base({ status: 'paid_offline', duplicate_refunded_cents: 2550 })).note)
      .toBe('Card payment auto-refunded $25.50');
  });

  it('unknown dispute strings are ignored', () => {
    expect(parseDisputeStatus('OPEN')).toBe('open');
    expect(parseDisputeStatus('needs_response')).toBeNull();
    expect(parseDisputeStatus(undefined)).toBeNull();
    expect(rowStatusView(base({ dispute_status: 'needs_response' })).label).toBe('Paid');
  });
});

// ── Paid or not ─────────────────────────────────────────────────

describe('rowSettled — open dispute is paid, lost dispute is not', () => {
  it('per row', () => {
    expect(rowSettled(byId(21))).toBe(true);
    expect(rowSettled(byId(22))).toBe(true); // open
    expect(rowSettled(byId(23))).toBe(true); // won
    expect(rowSettled(byId(24))).toBe(false); // lost
    expect(rowSettled(base({ dispute_status: 'lost' }))).toBe(false);
    expect(rowSettled(byId(25))).toBe(true); // partial refund — still paid
    expect(rowSettled(byId(26))).toBe(false); // refunded
    expect(rowSettled(byId(27))).toBe(true);
    expect(rowSettled(byId(28))).toBe(true);
    expect(rowSettled(null)).toBe(false);
  });

  it('member Pay: a lost dispute shows Pay again; an open one stays paid', () => {
    expect(settledRowFor([byId(24)], 'season_dues')).toBeNull();
    expect(settledRowFor([base({ dispute_status: 'lost' })], 'season_dues')).toBeNull();
    expect(settledRowFor([byId(22)], 'season_dues')?.id).toBe(I(22));
  });

  it('the success page never says paid for a lost dispute', () => {
    expect(pollOutcome({ payments: [byId(24)] }, I(24))).toBe('failed');
    expect(pollOutcome({ payments: [base({ dispute_status: 'lost' })] }, I(21))).not.toBe('paid');
    expect(pollOutcome({ payments: [byId(22)] }, I(22))).toBe('paid');
  });
});

// ── Refund eligibility ──────────────────────────────────────────

describe('canRefund — settled card payments only', () => {
  it('per fixture row', () => {
    expect(rows().map((r) => [r.id, canRefund(r)])).toEqual([
      [I(21), true],
      [I(22), false], // open dispute
      [I(23), true], // dispute won — the money is the league's again
      [I(24), false], // lost
      [I(25), false], // partly refunded already — full refunds only
      [I(26), false], // refunded
      [I(27), false], // cash
      [I(28), false], // waived
    ]);
  });

  it('never pending, failed, cash, waived, or a row without a payment intent', () => {
    for (const status of ['pending', 'failed', 'refunded', 'waived', 'paid_offline']) {
      expect(canRefund(base({ status })), status).toBe(false);
    }
    expect(canRefund(base({ stripe_payment_intent_id: null }))).toBe(false);
    expect(canRefund(null)).toBe(false);
  });

  it('a pre-Phase-5 succeeded row is refundable', () => {
    const old = (fixture('payments_succeeded').body.payments as PaymentRow[])[0];
    expect(canRefund(old)).toBe(true);
  });
});

// ── The roster ──────────────────────────────────────────────────

describe('roster — labels, Refund, and the totals', () => {
  const members = () => rows().map((r, i) => ({ user_id: r.profile_id, display_name: `Player ${i + 1}` }));

  it('Refund is offered on the plain and dispute-won card rows only', () => {
    const out = rosterPayments(members(), rows(), 'season_dues');
    expect(out.filter((r) => r.refundPaymentId).map((r) => r.refundPaymentId).sort()).toEqual([I(21), I(23)]);
  });

  it('a lost dispute owes again: actions return', () => {
    const out = rosterPayments(members(), rows(), 'season_dues');
    const lost = out.find((r) => r.profileId === P(24))!;
    expect(lost).toMatchObject({ label: 'Disputed — unpaid', settled: false, canRecord: true, refundPaymentId: null });
    const open = out.find((r) => r.profileId === P(22))!;
    expect(open).toMatchObject({ label: 'Disputed', settled: true, canRecord: false, refundPaymentId: null });
  });

  it('aggregate: open/won/partial/cash/waived settled, lost owes, refunded neither', () => {
    const out = rosterPayments([...members(), { user_id: P(99), display_name: 'Never tried' }], rows(), 'season_dues');
    const s = rosterSummary(out);
    expect(s).toEqual({ settled: 6, owing: 2, refunded: 1 });
    expect(s.settled + s.owing + s.refunded).toBe(out.length);
  });

  it('a newer card payment after a lost dispute settles the line', () => {
    const out = rosterPayments(
      [{ user_id: P(24), display_name: 'Ann' }],
      [byId(24), base({ id: I(40), profile_id: P(24), updated_at: '2026-10-01T00:00:00Z' })],
      'season_dues',
    );
    expect(out[0]).toMatchObject({ label: 'Paid', settled: true });
  });
});

// ── Confirm copy ────────────────────────────────────────────────

describe('refundConfirmCopy', () => {
  it('names the amount and player, and says the fees are not returned', () => {
    const c = refundConfirmCopy({ name: 'Ann', amountCents: 5000, applicationFeeCents: 150, scope: 'league' });
    expect(c.title).toBe('Refund $50 to Ann?');
    expect(c.body).toBe(
      'Ann gets the full $50 back on their card. The league does not get back Stripe’s processing fee ' +
        'or Bagpipe’s fee ($1.50) — both are kept when a payment is refunded. This can’t be undone.',
    );
    expect(c.button).toBe('Refund $50');
  });
  it('without a fee figure it still names both fees', () => {
    const c = refundConfirmCopy({ name: 'Bo', amountCents: 2550, applicationFeeCents: 0, scope: 'tournament' });
    expect(c.body).toMatch(/The tournament does not get back Stripe’s processing fee or Bagpipe’s fee —/);
  });
});

// ── Client: error mapping and the call ──────────────────────────

describe('errorCodeOf — both body shapes', () => {
  it('reads the envelope code, or a code-shaped `error`', () => {
    expect(errorCodeOf({ error: 'Only the owner.', code: 'not_director' }, 'x')).toBe('not_director');
    for (const c of REFUND_ERROR_CODES) expect(errorCodeOf({ error: c }, 'x')).toBe(c);
    expect(errorCodeOf({ error: 'Something broke badly' }, 'upstream_error')).toBe('upstream_error');
    expect(errorCodeOf(null, 'upstream_error')).toBe('upstream_error');
    expect(errorCodeOf('<html>', 'upstream_error')).toBe('upstream_error');
  });
});

const Env = { RAILWAY_API_URL: 'https://railway.test', PAYMENTS_ENABLED: '1' };
function ctx(opts: { url: string; form?: Array<[string, string]> | Record<string, string>; env?: Record<string, string>; user?: { id: string } | null }) {
  const url = new URL(opts.url, 'https://bagpipegolf.com');
  let body: FormData | undefined;
  if (opts.form) {
    body = new FormData();
    for (const [k, v] of Array.isArray(opts.form) ? opts.form : Object.entries(opts.form)) body.append(k, v);
  }
  return {
    request: new Request(url, { method: 'POST', body }),
    url,
    params: {},
    cookies: { get: () => undefined, set: () => {}, delete: () => {}, has: () => false },
    locals: {
      runtime: { env: opts.env ?? Env },
      user: opts.user === undefined ? { id: 'owner-1', email: 'o@example.com' } : opts.user,
      session: { access_token: 'jwt' },
    },
  } as any;
}

describe('refundPayment — the Railway call', () => {
  beforeEach(() => vi.mocked(callRailway).mockReset());

  it('POSTs /api/payments/:id/refund with NO body', async () => {
    vi.mocked(callRailway).mockResolvedValue(fixture('refund_refunded').body);
    const res = await refundPayment(ctx({ url: '/' }), 'live', I(21));
    expect(vi.mocked(callRailway).mock.calls[0][1]).toEqual({ method: 'POST', path: `/api/payments/${I(21)}/refund` });
    expect(res.ok && res.data.payment.status).toBe('refunded');
  });

  it('maps every refusal fixture to its code', async () => {
    for (const c of REFUND_ERROR_CODES) {
      const f = fixture(`error_${c}`);
      vi.mocked(callRailway).mockImplementationOnce(async () => {
        throw new RailwayApiError(f.http, f.body.error, f.body);
      });
      const res = await refundPayment(ctx({ url: '/' }), 'live', I(21));
      expect(res).toMatchObject({ ok: false, status: f.http, code: c });
    }
  });

  it('a body with no recognisable code is upstream_error, 401 unauthenticated', async () => {
    vi.mocked(callRailway).mockImplementationOnce(async () => {
      throw new RailwayApiError(500, 'boom', 'Internal Server Error');
    });
    expect(await refundPayment(ctx({ url: '/' }), 'live', I(21))).toMatchObject({ code: 'upstream_error' });
    vi.mocked(callRailway).mockImplementationOnce(async () => {
      throw new RailwayApiError(401, 'no', null);
    });
    expect(await refundPayment(ctx({ url: '/' }), 'live', I(21))).toMatchObject({ code: 'unauthenticated' });
  });

  it('fixture mode answers from refund_* and error_* fixtures', async () => {
    expect(await refundPayment(ctx({ url: '/' }), 'fixtures', I(21), 'refund_pending')).toMatchObject({ ok: true });
    expect(await refundPayment(ctx({ url: '/' }), 'fixtures', I(21), 'error_not_refundable')).toMatchObject({
      ok: false,
      code: 'not_refundable',
    });
  });
});

describe('refundOutcome / refundResultCode / refundNotice', () => {
  it('refunded only when the row says so; otherwise pending', () => {
    expect(refundOutcome(fixture('refund_refunded').body.payment)).toBe('refunded');
    expect(refundOutcome(fixture('refund_pending').body.payment)).toBe('refund_pending');
    expect(refundOutcome(null)).toBe('refund_pending');
  });
  it('only known codes ride the query string', () => {
    for (const c of REFUND_RESULT_CODES) expect(refundResultCode(c)).toBe(c);
    expect(refundResultCode('<script>')).toBe('error');
    expect(refundResultCode(null)).toBeNull();
  });
  it('each code has its own sentence', () => {
    expect(refundNotice('refunded')).toMatchObject({ tone: 'good', title: 'Refunded.' });
    expect(refundNotice('refund_pending')).toMatchObject({ tone: 'warn', title: 'Refund pending.' });
    expect(refundNotice('not_owner')!.title).toBe('Owner only.');
    expect(refundNotice('not_found')!.title).toBe('Payment not found.');
    expect(refundNotice('not_refundable')!.title).toBe('Can’t refund this one.');
    expect(refundNotice('stripe_error')!.title).toBe('Stripe didn’t take the refund.');
    expect(refundNotice('error')!.title).toBe('Nothing was refunded.');
    for (const c of REFUND_ERROR_CODES) expect(refundNotice(c)!.body).toMatch(/Nothing was refunded/);
  });
});

// ── The route ───────────────────────────────────────────────────

describe('POST /api/payments/refund', () => {
  const okForm = { scope: 'league', id: 'lg1', payment_id: I(21) };
  beforeEach(() => {
    owner = 'owner-1';
    vi.mocked(callRailway).mockReset();
  });

  it('404s with the flag off, before anything else', async () => {
    const res = await refundPOST(ctx({ url: '/api/payments/refund', form: okForm, env: { RAILWAY_API_URL: 'x' } }));
    expect(res.status).toBe(404);
  });

  it('refuses an amount, a reason, or a bad id — Railway never called', async () => {
    for (const form of [
      { ...okForm, amount_cents: '100' },
      { ...okForm, reason: 'x' },
      { scope: 'league', id: 'lg1' },
      { ...okForm, payment_id: '../../x' },
    ]) {
      const res = await refundPOST(ctx({ url: '/api/payments/refund', form }));
      expect(res.status, JSON.stringify(form)).toBe(400);
    }
    expect(parseRefundAction(okForm)).toEqual({ ok: true, value: okForm });
    expect(callRailway).not.toHaveBeenCalled();
  });

  it('a non-owner bounces to the league page', async () => {
    owner = 'someone-else';
    const res = await refundPOST(ctx({ url: '/api/payments/refund', form: okForm, user: { id: 'member-2' } }));
    expect(res.headers.get('location')).toBe('/app/leagues/lg1');
    expect(callRailway).not.toHaveBeenCalled();
  });

  it('refunded / pending / error land back on the roster', async () => {
    vi.mocked(callRailway).mockResolvedValueOnce(fixture('refund_refunded').body);
    let res = await refundPOST(ctx({ url: '/api/payments/refund', form: okForm }));
    expect(res.headers.get('location')).toBe('/app/leagues/lg1/payments?refund=refunded#roster');

    vi.mocked(callRailway).mockResolvedValueOnce(fixture('refund_pending').body);
    res = await refundPOST(ctx({ url: '/api/payments/refund', form: okForm }));
    expect(res.headers.get('location')).toBe('/app/leagues/lg1/payments?refund=refund_pending#roster');

    const f = fixture('error_not_refundable');
    vi.mocked(callRailway).mockImplementationOnce(async () => {
      throw new RailwayApiError(f.http, f.body.error, f.body);
    });
    res = await refundPOST(ctx({ url: '/api/payments/refund', form: okForm }));
    expect(res.headers.get('location')).toBe('/app/leagues/lg1/payments?refund=not_refundable#roster');
  });
});

// ── Fixtures match the frozen wire ──────────────────────────────

describe('Phase 5 fixtures are contract-shaped', () => {
  it('refund errors: the frozen `{error: "<code>"}` body at the frozen status', () => {
    const http = { not_owner: 403, not_found: 404, not_refundable: 409, stripe_error: 502 } as const;
    for (const c of REFUND_ERROR_CODES) {
      const f = fixture(`error_${c}`);
      expect(f.http).toBe(http[c]);
      expect(f.body).toEqual({ error: c });
    }
  });

  it('refund 200s are {payment} rows carrying every Phase 5 field', () => {
    for (const [name, status] of [['refund_refunded', 'refunded'], ['refund_pending', 'succeeded']] as const) {
      const f = fixture(name);
      expect(f.http).toBe(200);
      expect(Object.keys(f.body)).toEqual(['payment']);
      expect(Object.keys(f.body.payment).sort()).toEqual(PHASE5_KEYS);
      expect(f.body.payment.status).toBe(status);
    }
  });

  it('the disputes/refunds list: every row has the four new fields, typed', () => {
    for (const r of rows()) {
      expect(Object.keys(r).sort()).toEqual(PHASE5_KEYS);
      expect([null, 'open', 'won', 'lost']).toContain(r.dispute_status);
      expect(r.dispute_status === null ? r.disputed_at === null : typeof r.disputed_at === 'string').toBe(true);
      expect(Number.isInteger(r.refunded_cents)).toBe(true);
      expect(Number.isInteger(r.duplicate_refunded_cents)).toBe(true);
      expect(['pending', 'succeeded', 'failed', 'refunded', 'waived', 'paid_offline']).toContain(r.status);
    }
    // A lost dispute is status failed + lost (frozen).
    expect(byId(24)).toMatchObject({ status: 'failed', dispute_status: 'lost' });
  });

  it('every refund_* fixture is on disk and loadable', () => {
    const names = readdirSync(FIX_DIR).filter((f) => f.startsWith('refund_')).sort();
    expect(names).toEqual(['refund_pending.json', 'refund_refunded.json']);
  });
});

describe('CSP still lets the Refund form post', () => {
  it("form-action keeps 'self' — the refund route and its 303 are same-origin", async () => {
    const { CONTENT_SECURITY_POLICY } = await import('./csp');
    const fa = CONTENT_SECURITY_POLICY.split('; ').find((d) => d.startsWith('form-action'))!;
    expect(fa.split(' ')).toContain("'self'");
  });
});

describe('the roster component wires Refund to canRefund only', () => {
  const src = readFileSync('src/components/payments/PaymentsRoster.astro', 'utf8');
  it('renders Refund only for rows with refundPaymentId, posting exactly scope/id/payment_id', () => {
    expect(src).toMatch(/refundAction && r\.refundPaymentId/);
    const form = src.slice(src.indexOf('action={refundAction}'), src.indexOf('</form>', src.indexOf('action={refundAction}')));
    const names = [...form.matchAll(/name="([a-z_]+)"/g)].map((m) => m[1]).sort();
    expect(names).toEqual(['id', 'payment_id', 'scope']);
    expect(form).toMatch(/refundConfirmCopy|confirmFor/);
  });
  it('the payments page passes the refund route and the ?refund= code', () => {
    const page = readFileSync('src/pages/app/leagues/[id]/payments.astro', 'utf8');
    expect(page).toMatch(/refundAction=\{withQuery\('\/api\/payments\/refund'/);
    expect(page).toMatch(/refundResultCode\(Astro\.url\.searchParams\.get\('refund'\)\)/);
  });
});
