// Card payments — the PER-SCOPE gate. `PAYMENTS_ENABLED` is site-wide,
// but the API only takes payments for allow-listed leagues/tournaments
// (`paymentsEnabledFor(id)` in fairwayiq-api → 503 `payments_disabled`
// for everyone else, checked BEFORE auth or ownership). So with the
// flag on, a payment control renders only when the API has just said
// THIS scope is enabled.
//
// 🚨 FAIL CLOSED. `payments_disabled`, any other error, a throw, or a
// timeout → not enabled → the control renders nothing. A real league
// that is not on the allow-list sees exactly what it saw with the flag
// off.
//
// 🚨 FLAG OFF → NO CALL. `mode === 'off'` returns before the probe runs.
//
// The probe is an EXISTING read the page already makes — no new API
// endpoint:
//   • members (Pay season dues / Pay entry fee / signup step):
//     `GET /api/payments?scope=&id=` (§2.4) — any signed-in caller;
//   • owners (Set up card payments, the payments page):
//     `GET /api/merchants/{scope}/{id}` (§2.2) — owner-only, where a
//     404 `merchant_not_ready` means "enabled, never onboarded".
// The page reuses `result` for whatever it rendered from that read, so
// a page makes one payments call, not two.

import type { PaymentsMode } from './payments';
import type { ApiResult } from './paymentsServer';

export type PaymentsGate<T> =
  | { enabled: true; result: ApiResult<T> }
  | { enabled: false; result: ApiResult<T> | null };

export const GATE_TIMEOUT_MS = 4000;

/** Did the API say this scope takes payments? A 2xx, or the merchant
 *  read's "never onboarded" (which the API only reaches after its
 *  allow-list gate). Everything else is "no". */
export function enabledFrom(res: ApiResult<unknown> | null | undefined): boolean {
  if (!res) return false;
  if (res.ok) return true;
  return res.code === 'merchant_not_ready';
}

export async function paymentsGate<T>(
  mode: PaymentsMode,
  probe: () => Promise<ApiResult<T>>,
  timeoutMs: number = GATE_TIMEOUT_MS,
): Promise<PaymentsGate<T>> {
  if (mode === 'off') return { enabled: false, result: null };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), timeoutMs);
    });
    const res = await Promise.race([probe(), timeout]);
    if (res && enabledFrom(res)) return { enabled: true, result: res };
    return { enabled: false, result: res };
  } catch {
    return { enabled: false, result: null };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
