import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * After accepting an invite you land on the thing you joined.
 *
 * 2026-10-13 — accepting a TOURNAMENT invite sent you to that
 * tournament; accepting a LEAGUE invite sent you to `/app/leagues`, the
 * LIST, even though `league_id` is in the accept response. A new member
 * finished on a page that neither names the league they joined nor
 * carries "Pay season dues", which lives on `/app/leagues/<id>`.
 *
 * Scanned from source rather than unit-tested, because the handler
 * lives in an `is:inline` script: Astro does not bundle it, so it
 * cannot import a tested helper. A source scan is the weaker tool and
 * the only one available here — which is itself the argument for not
 * putting logic in inline scripts.
 */
const PAGE = new URL('../pages/join/[code].astro', import.meta.url);

function scriptBodies(src: string): string {
  // Comments stripped so the guard cannot match its own explanation —
  // that trap bit four separate guards on 2026-10-13.
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('join accept redirect', () => {
  const raw = readFileSync(PAGE, 'utf8');
  const code = scriptBodies(raw);

  it('the scanner sees the accept handler', () => {
    // Guard against a vacuous pass if the page is restructured.
    expect(code).toContain('doneLink.setAttribute');
    expect(code).toContain('league_id');
  });

  it('a league accept does NOT send you to the bare list', () => {
    expect(code).not.toMatch(/setAttribute\(\s*'href'\s*,\s*'\/app\/leagues'\s*\)/);
  });

  it('a league accept builds a per-league path', () => {
    expect(code).toMatch(/\/app\/leagues\/\$\{encodeURIComponent\(body\.league_id\)\}/);
  });

  it('a tournament accept still goes to that tournament', () => {
    expect(code).toMatch(/\/app\/tournaments\/\$\{body\.tournament_id\}/);
  });
});
