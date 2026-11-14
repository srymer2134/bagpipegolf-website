// ============================================================
// Every link in the site navigation goes somewhere
// ============================================================
// A nav entry pointing at a page nobody built is a 404 served from the
// most trusted place on the site. It also fails silently: the menu
// renders, the link looks right, and only a visitor finds out.
//
// This reads the hrefs out of SiteNav and asks the filesystem whether
// each one has a page. Static paths only — a dynamic href (clubHref(…),
// an interpolated id) is the routing layer's job, not this test's.
import { existsSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const nav = readFileSync('src/components/SiteNav.astro', 'utf8');

/** Every `href: '/…'` literal in the nav's link arrays. */
const paths = [...nav.matchAll(/href:\s*'(\/[^']*)'/g)].map((m) => m[1]);

/**
 * Does this path have a page? Astro resolves `/a/b` from `a/b.astro`,
 * `a/b/index.astro`, or an endpoint of the same name — so all three
 * count, and a [param] route is a different question this skips.
 */
function resolves(path: string): boolean {
  const rel = path === '/' ? 'index' : path.replace(/^\/+|\/+$/g, '');
  return [
    `src/pages/${rel}.astro`,
    `src/pages/${rel}/index.astro`,
    `src/pages/${rel}.ts`,
  ].some(existsSync);
}

describe('site navigation', () => {
  it('found the links to check', () => {
    // A scan that silently finds nothing is worse than no scan: it
    // passes forever. (project_curated_stub_drift_guard_gap)
    expect(paths.length).toBeGreaterThan(10);
  });

  it('points every static link at a page that exists', () => {
    const dangling = [...new Set(paths)].filter((p) => !resolves(p));
    expect(dangling, `nav links with no page: ${dangling.join(', ')}`).toEqual([]);
  });

  it('includes the Clubs explainer, which the Club plan is sold against', () => {
    // The plan was on /pricing with no page explaining what a club IS
    // (Sam, 2026-11-13).
    expect(paths).toContain('/clubs');
    expect(existsSync('src/pages/clubs.astro')).toBe(true);
  });
});
