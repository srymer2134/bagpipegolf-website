import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CONFIRM_PHRASE, DELETED_LANDING, confirmMatches } from './accountDelete';

describe('confirmMatches', () => {
  it('accepts the phrase, ignoring surrounding spaces', () => {
    expect(confirmMatches(CONFIRM_PHRASE)).toBe(true);
    expect(confirmMatches(`  ${CONFIRM_PHRASE} `)).toBe(true);
  });
  it('rejects lower case, blanks and non-strings', () => {
    expect(confirmMatches('delete')).toBe(false);
    expect(confirmMatches('')).toBe(false);
    expect(confirmMatches(undefined)).toBe(false);
    expect(confirmMatches(1)).toBe(false);
  });
});

describe('the deletion pages', () => {
  const page = readFileSync('src/pages/delete-account.astro', 'utf8');
  const route = readFileSync('src/pages/api/account/delete.ts', 'utf8');
  const profile = readFileSync('src/pages/app/profile.astro', 'utf8');

  it('the public page names both doors and the retention windows', () => {
    expect(page).toContain('Profile → Delete Account');
    expect(page).toContain('/app/profile#delete-account');
    expect(page).toContain('30 days');
    expect(page).toContain('90 days');
  });

  it('the public page offers no email route (Sam, 2026-11-02)', () => {
    expect(page).not.toMatch(/mailto:|@bagpipegolf\.com/);
  });

  it('the route proxies the same Railway delete the app calls', () => {
    expect(route).toContain("method: 'DELETE'");
    expect(route).toContain("path: '/api/users/me'");
    expect(route).toContain('confirmMatches');
  });

  it('the profile page anchors the section the public page links to', () => {
    expect(profile).toContain('id="delete-account"');
    expect(profile).toContain('/api/account/delete');
    expect(DELETED_LANDING.startsWith('/delete-account')).toBe(true);
  });
});
