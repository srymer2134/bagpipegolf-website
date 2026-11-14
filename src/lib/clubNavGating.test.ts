// ============================================================
// A club is optional. Nobody without one sees club navigation.
// ============================================================
// Sam, 2026-11-13: "a league can exist without a club. a tournament can
// exist without a club. Club is a super user feature."
//
// So every club affordance is gated on membership, and the gate is
// easy to drop later by accident — an unconditional menu entry or a
// dashboard card with an empty state would quietly advertise a $2,970
// plan from inside a player's own navigation. These checks read the
// source rather than render it, which is enough to catch the gate
// being removed.
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(p, 'utf8');

describe('club navigation is conditional', () => {
  it('the menu adds a club entry only when the viewer is in one', () => {
    const nav = read('src/components/SiteNav.astro');
    expect(nav).toMatch(/const clubs = Astro\.locals\.clubs \?\? \[\];/);
    expect(nav).toMatch(/clubs\.length === 1/);
    expect(nav).toMatch(/clubs\.length > 1/);
    // The single-club case deep-links to that club, not to the router.
    expect(nav).toMatch(/clubHref\(clubs\[0\]\.orgId\)/);
  });

  it('the dashboard renders no club section at all without a club', () => {
    const dash = read('src/pages/app/index.astro');
    expect(dash).toMatch(/\{clubs\.length > 0 && \(/);
    // No upsell, no empty state: the absence has to be total.
    expect(dash).not.toMatch(/No clubs yet|Start a club|Buy the Club plan/i);
  });

  it('a league page links up only when that league has a club', () => {
    const page = read('src/pages/app/leagues/[id]/index.astro');
    expect(page).toMatch(/clubFor\(/);
    expect(page).toMatch(/\{club \? <>League ·/);
    // org_id has to survive the query, or `club` is always null.
    expect(read('src/lib/leaguePortal.ts')).toMatch(/created_at, org_id'\)/);
  });

  it('the club page itself says a club is optional', () => {
    expect(read('src/pages/app/club/index.astro')).toMatch(
      /don’t need one to run a league or a tournament/,
    );
  });

  it('every club link goes through clubHref, so there is one address', () => {
    for (const f of [
      'src/components/SiteNav.astro',
      'src/pages/app/index.astro',
      'src/pages/app/leagues/[id]/index.astro',
    ]) {
      expect(read(f), `${f} hand-builds a club URL`).not.toMatch(/["'`]\/app\/club\/\$\{/);
      expect(read(f)).toMatch(/clubHref\(/);
    }
  });
});

describe('the dashboard says what it means', () => {
  it('does not label shipped features "coming soon"', () => {
    // It said that from the site's first commit (2026-06-09) until
    // 2026-11-13, above four links that all answer 200.
    const dash = readFileSync('src/pages/app/index.astro', 'utf8');
    const copy = dash.replace(/<!--[\s\S]*?-->/g, '');
    expect(copy).not.toMatch(/Coming soon/i);
    expect(copy).toMatch(/<h2 class="block__title">Manage<\/h2>/);
  });
});
