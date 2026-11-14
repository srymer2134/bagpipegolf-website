import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { clubPublicPath, looksLikeOrgId } from './clubPublic';

describe('clubPublicPath', () => {
  it('sits beside /l/ and /t/, the other share links', () => {
    expect(clubPublicPath('pine-valley')).toBe('/c/pine-valley');
  });

  it('escapes anything a slug should not contain', () => {
    expect(clubPublicPath('a/b')).toBe('/c/a%2Fb');
  });
});

describe('looksLikeOrgId', () => {
  it('spots the old address so it can be redirected, not 404ed', () => {
    // Links were handed out before slugs existed — the id was the only
    // address a club had.
    expect(looksLikeOrgId('club_1c379ec0d0256900a036')).toBe(true);
    expect(looksLikeOrgId('pine-valley')).toBe(false);
    expect(looksLikeOrgId(undefined)).toBe(false);
  });
});

describe('the public page keeps members-only data out', () => {
  const raw = readFileSync('src/pages/c/[slug].astro', 'utf8');
  // Comments explain what is deliberately absent, so they name the
  // very fields the check forbids. Scan the code, not the prose.
  const page = raw
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*\/\//.test(l))
    .join('\n');

  it('reads only through club_public, never the org tables', () => {
    expect(page).toMatch(/rpc\('club_public'/);
    // The one exception is the id -> slug lookup, which reads a single
    // column and is allowed to return nothing.
    expect(page).not.toMatch(/from\('org_members'\)/);
    expect(page).not.toMatch(/from\('leagues'\)/);
    expect(page).not.toMatch(/from\('tournaments'\)/);
  });

  it('never renders a member-only field, even if one arrived', () => {
    for (const forbidden of ['seats_used', 'seats_max', 'plan_payer', 'invites', 'members', 'covered']) {
      expect(page, `${forbidden} must not appear on a public page`).not.toContain(forbidden);
    }
  });

  it('stays out of search until it has something to show', () => {
    expect(page).toMatch(/noindex=\{!hasPublicContent\}/);
    expect(page).toMatch(/const hasPublicContent =/);
  });

  it('404s an unknown club rather than rendering an empty shell', () => {
    expect(page).toMatch(/return new Response\(null, \{ status: 404 \}\)/);
  });

  it('301s the old id address to the slug', () => {
    expect(page).toMatch(/Astro\.redirect\(clubPublicPath\(target\), 301\)/);
  });
});
