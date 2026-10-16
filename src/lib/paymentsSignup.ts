// The league signup page's "Season dues" step — the decision, with its
// I/O injected so it is unit-testable (`paymentsSignup.test.ts`). The
// page (`src/pages/app/leagues/[id]/signup.astro`) calls it with the
// real loaders.
//
// 🚨 NOT ENABLED FOR THIS LEAGUE → NOTHING RENDERS. The payments read
// doubles as the per-league gate; `payments_disabled`, any error or a
// timeout hides the step (fail closed).
//
// 🚨 FLAG OFF → NOTHING RUNS. With `PAYMENTS_ENABLED` unset this
// returns null before touching a single loader, so the page renders
// exactly as it did before the step existed.

import { payDisplayFor, payStateFor, type OwnMembership } from './leagueParticipation';
import { checkoutNotice, payNoticeCode, settledRowFor, type CheckoutNotice, type PaymentsMode } from './payments';
import type { ApiResult } from './paymentsServer';
import type { PaymentsListBody } from './payments';
import { showSignupDuesStep } from './paymentsRoster';
import { paymentsGate } from './paymentsGate';

export type SignupDues = {
  /** Null only with `nothing`. */
  amountLabel: string | null;
  /** The viewer's own dues override is 0 → "Nothing to pay". */
  nothing: boolean;
  paid: boolean;
  /** The checkout form's action — `/api/payments/checkout-session`
   *  with `from=signup` (+ slot, + fixture in dev). Never an amount. */
  action: string;
  notice: CheckoutNotice | null;
};

export type SignupDuesDeps = {
  mode: PaymentsMode;
  /** `?pay=` on the page URL — a code from a checkout bounce. */
  payParam: string | null;
  /** `?slot=` on the page URL. */
  slotParam: string | null;
  /** `?fixture=` in fixture mode, else null. */
  fixture: string | null;
  /** `?payments=` in fixture mode, else null. */
  listFixture: string | null;
  loadDues: () => Promise<{ duesCents: number | null; duesDueDate: string | null } | null>;
  /** The viewer's own `league_members` row (LEAGUE_OWNER_PARTICIPATION_PLAN
   *  §2): their amount is `dues_cents ?? leagues.dues_cents`, and an
   *  organizer gets no step. Omitted → the league amount, as before. */
  loadOwn?: () => Promise<OwnMembership>;
  listPayments: (fixture: string | null) => Promise<ApiResult<PaymentsListBody>>;
  withQuery: (path: string, q: Record<string, string | null | undefined>) => string;
};

export async function signupDuesStep(d: SignupDuesDeps): Promise<SignupDues | null> {
  if (d.mode === 'off') return null;
  const payable = await d.loadDues();
  const own: OwnMembership = d.loadOwn ? await d.loadOwn() : { supported: false, row: null };
  const display = payDisplayFor(
    payStateFor({ supported: own.supported, row: own.row, leagueDuesCents: payable?.duesCents }),
    payable?.duesDueDate,
  );
  if (!display) return null;
  const payCode = payNoticeCode(d.payParam);
  // The per-scope gate (paymentsGate.ts): a league not on the API's
  // allow-list answers `payments_disabled`, and any failed read is
  // treated the same — the step does not render at all.
  const gate = await paymentsGate(d.mode, () => d.listPayments(d.listFixture));
  if (!gate.enabled) return null;
  const list = gate.result;
  const show = showSignupDuesStep({
    mode: d.mode,
    // `payDisplayFor` already decided there is something to show (an
    // amount > 0, or "Nothing to pay" for a $0 override); this call now
    // only applies the `payments_disabled` rules.
    duesCents: 1,
    listCode: list.ok ? null : list.code,
    payCode,
  });
  if (!show) return null;
  return {
    amountLabel: display.amountLabel,
    nothing: display.nothing,
    paid: list.ok ? settledRowFor(list.data.payments, 'season_dues') !== null : false,
    action: d.withQuery('/api/payments/checkout-session', {
      from: 'signup',
      slot: d.slotParam,
      fixture: d.fixture,
    }),
    notice: checkoutNotice(payCode, 'league'),
  };
}
