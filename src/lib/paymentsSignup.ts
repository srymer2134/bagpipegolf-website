// The league signup page's "Season dues" step — the decision, with its
// I/O injected so it is unit-testable (`paymentsSignup.test.ts`). The
// page (`src/pages/app/leagues/[id]/signup.astro`) calls it with the
// real loaders.
//
// 🚨 FLAG OFF → NOTHING RUNS. With `PAYMENTS_ENABLED` unset this
// returns null before touching a single loader, so the page renders
// exactly as it did before the step existed.

import { formatDuesLine } from './leagueDues';
import { checkoutNotice, payNoticeCode, settledRowFor, type CheckoutNotice, type PaymentsMode } from './payments';
import type { ApiResult } from './paymentsServer';
import type { PaymentsListBody } from './payments';
import { showSignupDuesStep } from './paymentsRoster';

export type SignupDues = {
  amountLabel: string;
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
  listPayments: (fixture: string | null) => Promise<ApiResult<PaymentsListBody>>;
  withQuery: (path: string, q: Record<string, string | null | undefined>) => string;
};

export async function signupDuesStep(d: SignupDuesDeps): Promise<SignupDues | null> {
  if (d.mode === 'off') return null;
  const payable = await d.loadDues();
  const amountLabel = formatDuesLine(payable?.duesCents, payable?.duesDueDate);
  if (!amountLabel) return null;
  const payCode = payNoticeCode(d.payParam);
  const list = await d.listPayments(d.listFixture);
  const show = showSignupDuesStep({
    mode: d.mode,
    duesCents: payable?.duesCents,
    listCode: list.ok ? null : list.code,
    payCode,
  });
  if (!show) return null;
  return {
    amountLabel,
    paid: list.ok ? settledRowFor(list.data.payments, 'season_dues') !== null : false,
    action: d.withQuery('/api/payments/checkout-session', {
      from: 'signup',
      slot: d.slotParam,
      fixture: d.fixture,
    }),
    notice: checkoutNotice(payCode, 'league'),
  };
}
