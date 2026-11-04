// A promotion code carried in from a link — the course intro email sends
// directors to `/signup?promo=Bagpipe50` (Sam, 2026-11-04).
//
// The middleware remembers a well-formed `?promo=` in a cookie on whatever
// page it lands, because the director signs up, creates a league, and only
// then reaches checkout: the query string is long gone by then. The billing
// checkout proxy reads it back and hands it to the API as `promo_code`.
//
// The cookie is a convenience, not an entitlement. The API looks the code up
// in Stripe on every checkout and opens the ordinary code box when it is
// unknown or expired, so a stale or forged cookie can do nothing a typed code
// could not.

/** Minimal slice of Astro's cookie API, so the helpers test without Astro. */
export interface CookieJar {
  get(name: string): { value: string } | undefined;
  set(name: string, value: string, options: Record<string, unknown>): void;
}

export const PROMO_COOKIE = 'bp_promo';
const PROMO_MAX_AGE_S = 60 * 24 * 60 * 60; // 60 days

/** Letters, digits, `-` and `_`, 2–40 long — the API applies the same rule. */
export function parsePromoCode(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return /^[A-Za-z0-9_-]{2,40}$/.test(s) ? s : null;
}

/** Store `?promo=` from this request's URL, if it carries a well-formed one. */
export function rememberPromo(url: URL, cookies: CookieJar): void {
  const code = parsePromoCode(url.searchParams.get('promo'));
  if (!code) return;
  cookies.set(PROMO_COOKIE, code, {
    path: '/',
    httpOnly: true,
    secure: url.protocol === 'https:',
    sameSite: 'lax',
    maxAge: PROMO_MAX_AGE_S,
  });
}

/** The remembered code, or null. */
export function rememberedPromo(cookies: CookieJar): string | null {
  return parsePromoCode(cookies.get(PROMO_COOKIE)?.value);
}
