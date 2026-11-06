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
//
// A remembered code is applied up front, and Stripe Checkout then shows no
// code box (a session takes `discounts` or `allow_promotion_codes`, never
// both). So every place that says a code is saved also offers "Use a
// different code": `?promo=none` forgets it, and checkout opens with the box
// (Sam, 2026-11-06 — he could not use a $1 test code over Bagpipe50).

/** Minimal slice of Astro's cookie API, so the helpers test without Astro. */
export interface CookieJar {
  get(name: string): { value: string } | undefined;
  set(name: string, value: string, options: Record<string, unknown>): void;
  delete(name: string, options: Record<string, unknown>): void;
}

/** `?promo=none` forgets the remembered code. */
export const PROMO_CLEAR = 'none';

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
  const raw = url.searchParams.get('promo');
  if (raw?.trim().toLowerCase() === PROMO_CLEAR) {
    cookies.delete(PROMO_COOKIE, { path: '/' });
    return;
  }
  const code = parsePromoCode(raw);
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

/**
 * This page again, with the remembered code forgotten — the "Use a different
 * code" link. Keeps the page's own query (league_id, tournament_id) and drops
 * a stale `billing=` notice.
 */
export function differentCodeHref(url: URL): string {
  const q = new URLSearchParams(url.search);
  q.delete('billing');
  q.set('promo', PROMO_CLEAR);
  return `${url.pathname}?${q.toString()}`;
}
