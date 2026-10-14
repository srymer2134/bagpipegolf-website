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

/**
 * The accept PROXY must hand the page a league id.
 *
 * Railway returns `{ kind: 'league', league: <row>, alreadyJoined }`.
 * The proxy originally forwarded only `tournament_id`, so an emailed
 * league invite arrived at the page with nothing to redirect on — and
 * a page-side fix keyed on `body.league_id` was a SILENT NO-OP. Found
 * by tracing the response shape before merging that fix, not after.
 */
const PROXY = new URL('../pages/api/invites/[token]/accept.ts', import.meta.url);

describe('accept proxy forwards the league id', () => {
  const proxy = scriptBodies(readFileSync(PROXY, 'utf8'));

  it('reads the id out of Railway\'s league row', () => {
    expect(proxy).toMatch(/result\?\.league\?\.id/);
  });

  it('returns league_id to the browser', () => {
    expect(proxy).toMatch(/league_id:/);
  });

  it('still returns tournament_id', () => {
    // The tournament path worked; narrowing must not break it.
    expect(proxy).toMatch(/tournament_id:/);
  });

  it('treats Railway\'s alreadyJoined as already_accepted', () => {
    // The league envelope says alreadyJoined; the tournament one says
    // alreadyAccepted. Reading only the latter reports every repeat
    // league accept as brand new.
    expect(proxy).toMatch(/alreadyJoined/);
  });
});

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
