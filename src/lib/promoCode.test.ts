import { describe, expect, it } from 'vitest';
import { PROMO_COOKIE, parsePromoCode, rememberPromo, rememberedPromo, type CookieJar } from './promoCode';

function jar(): CookieJar & { store: Map<string, { value: string; options: Record<string, unknown> }> } {
  const store = new Map<string, { value: string; options: Record<string, unknown> }>();
  return {
    store,
    get: (name) => store.get(name),
    set: (name, value, options) => void store.set(name, { value, options }),
  };
}

describe('parsePromoCode', () => {
  it('accepts a code as typed and trims it', () => {
    expect(parsePromoCode('Bagpipe50')).toBe('Bagpipe50');
    expect(parsePromoCode('  bagpipe50 ')).toBe('bagpipe50');
  });
  it('refuses anything that is not a plain code', () => {
    for (const v of ['', 'x', 'a b', '<script>', 'a'.repeat(41), null, 42]) {
      expect(parsePromoCode(v)).toBeNull();
    }
  });
});

describe('rememberPromo', () => {
  it('stores ?promo= from the email link in an httpOnly cookie', () => {
    const c = jar();
    rememberPromo(new URL('https://bagpipegolf.com/signup?promo=Bagpipe50&utm_source=email'), c);
    const got = c.store.get(PROMO_COOKIE);
    expect(got?.value).toBe('Bagpipe50');
    expect(got?.options).toMatchObject({ path: '/', httpOnly: true, secure: true, sameSite: 'lax' });
    expect(rememberedPromo(c)).toBe('Bagpipe50');
  });
  it('leaves the cookie alone without a well-formed code', () => {
    const c = jar();
    rememberPromo(new URL('https://bagpipegolf.com/signup'), c);
    rememberPromo(new URL('https://bagpipegolf.com/signup?promo=%3Cx%3E'), c);
    expect(c.store.size).toBe(0);
    expect(rememberedPromo(c)).toBeNull();
  });
  it('a tampered cookie reads back as no code', () => {
    const c = jar();
    c.set(PROMO_COOKIE, 'not a code!', {});
    expect(rememberedPromo(c)).toBeNull();
  });
});
