// The open redirect fixed on 2026-10-04 (Patrick's audit, PA-S6).
//
// `next.startsWith('/')` passed `//evil.com`, which a browser reads as
// a different ORIGIN — so a user who had just typed their password on
// a real page was handed to an attacker's, from a link showing our own
// domain.

import { describe, expect, it } from 'vitest';

import { safeNext } from './safeNext';

// Built with fromCharCode so the source carries no literal control
// characters — an actual tab or newline in a string literal does not
// survive the parser, which is how the first version of this file
// failed to compile at all.
const TAB = String.fromCharCode(9);
const LF = String.fromCharCode(10);
const CONTROL_TAB = `/${TAB}javascript:alert(1)`;
const CONTROL_NEWLINE = `/app${LF}Set-Cookie: x=y`;

describe('safeNext allows real same-origin paths', () => {
  for (const ok of [
    '/app',
    '/app/tournaments',
    '/app/leagues/league_123/signup?slot=2',
    '/app/profile#bag',
    '/t/ABC123',
    // Hyphens, dots and tildes are legal in a path. The character
    // class that rejects control bytes must be written with escape
    // sequences; the raw-byte spelling degrades to a literal "-" in
    // the class and rejects every one of these.
    '/app/leagues/city-park-players-club',
    '/app/round/r-2026-10-04',
    '/app/profile/bag~1',
  ]) {
    it(`allows ${ok}`, () => expect(safeNext(ok)).toBe(ok));
  }
});

describe('safeNext refuses anything that leaves this origin', () => {
  it('REGRESSION: refuses a protocol-relative URL', () => {
    // The actual bug — starts with "/" and so passed the old check.
    expect(safeNext('//evil.com')).toBe('/app');
    expect(safeNext('//evil.com/login')).toBe('/app');
  });

  it('refuses the backslash spelling browsers normalise to //', () => {
    expect(safeNext('/\\evil.com')).toBe('/app');
  });

  it('refuses three or more leading slashes', () => {
    expect(safeNext('///evil.com')).toBe('/app');
  });

  it('refuses an absolute URL', () => {
    expect(safeNext('https://evil.com')).toBe('/app');
    expect(safeNext('http://evil.com')).toBe('/app');
  });

  it('refuses a smuggled scheme behind a slash', () => {
    expect(safeNext('/javascript:alert(1)')).toBe('/app');
    expect(safeNext(CONTROL_TAB)).toBe('/app');
    expect(safeNext('/data:text/html,x')).toBe('/app');
  });

  it('refuses control characters and whitespace', () => {
    // A newline can split a Location header.
    expect(safeNext(CONTROL_NEWLINE)).toBe('/app');
    expect(safeNext('/app ')).toBe('/app');
    expect(safeNext('/ap p')).toBe('/app');
  });

  it('refuses a bare path with no leading slash', () => {
    expect(safeNext('evil.com')).toBe('/app');
    expect(safeNext('app/tournaments')).toBe('/app');
  });

  it('refuses non-strings and empties', () => {
    expect(safeNext(undefined)).toBe('/app');
    expect(safeNext(null)).toBe('/app');
    expect(safeNext('')).toBe('/app');
    expect(safeNext(42)).toBe('/app');
    // An object that stringifies to something safe must still be
    // refused — only an actual string is trusted.
    expect(safeNext({ toString: () => '/app' })).toBe('/app');
  });

  it('honours a custom fallback', () => {
    expect(safeNext('//evil.com', '/login')).toBe('/login');
  });
});
