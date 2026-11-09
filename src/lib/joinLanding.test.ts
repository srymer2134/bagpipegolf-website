import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The Android manifest claims `pathPrefix:/join` for autoVerify, so Play
// Console probes `https://bagpipegolf.com/join` itself and reports a 404
// there as "Link not working" — next to, and easily confused with, the
// assetlinks fingerprint problem. Both join pages are pinned here so
// neither regression can come back quietly.

const INDEX = 'src/pages/join/index.astro';
const CODE = 'src/pages/join/[code].astro';

const PLAY = 'https://play.google.com/store/apps/details?id=com.taybuta.bagpipe';
const APPLE = 'https://apps.apple.com/app/id6775045734';

describe('bare /join', () => {
  it('has a page, so the URL Play Console probes is not a 404', () => {
    expect(existsSync(INDEX)).toBe(true);
  });

  // Read lazily inside each test: at describe scope a missing file throws
  // during collection, which reports as "no tests" instead of naming the
  // assertion that failed.
  const read = () => readFileSync(INDEX, 'utf8');

  it('takes a code and hands off to /join/<CODE>', () => {
    const page = read();
    expect(page).toContain('/join/${encodeURIComponent(');
    // The handoff target owns validation for every shape — 6-char codes,
    // UUID invite tokens, malformed. Re-implementing it here would mean
    // two places to keep in step.
    expect(page).toContain("classifyJoinParam");
  });

  it('still works without JavaScript', () => {
    const page = read();
    // The form GETs /join?code=… and the server redirects, so the page
    // is not dependent on the progressive-enhancement script below it.
    expect(page).toContain('method="get"');
    expect(page).toContain('Astro.redirect(');
    expect(page).toContain("searchParams.get('code')");
  });
});

describe('store links on the join pages', () => {
  for (const [label, path] of [
    ['the code landing page', CODE],
    ['the bare /join page', INDEX],
  ] as const) {
    it(`${label} offers Google Play as well as the App Store`, () => {
      const page = readFileSync(path, 'utf8');
      expect(page).toContain(APPLE);
      // Android shipped after this page did. Until the assetlinks
      // fingerprint is right, EVERY Android user falls through to this
      // page — sending them to the iPhone store is a dead end.
      expect(page).toContain(PLAY);
    });
  }

  it('every App Store button on the code page has a Play sibling', () => {
    const page = readFileSync(CODE, 'utf8');
    const apple = page.match(/href=\{appStoreHref\}/g) ?? [];
    const play = page.match(/href=\{playStoreHref\}/g) ?? [];
    expect(apple.length).toBeGreaterThan(0);
    expect(play.length).toBe(apple.length);
  });
});
