import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { clubBack, clubCall, clubDone, clubMessage } from './club';

// Club plan B2 on the website. lib/club.ts is the allowlist between a form
// post and the API: exactly one call per known action, from checked fields.
const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const form = (o: Record<string, string>) => ({ get: (k: string) => o[k] ?? null });

describe('clubCall', () => {
  it('maps each action to one API call', () => {
    expect(clubCall(form({ action: 'create', name: ' Pine Valley ' }), ME)).toEqual({ method: 'POST', path: '/api/clubs', body: { name: 'Pine Valley' } });
    expect(clubCall(form({ action: 'invite', org_id: 'club_1', email: 'Pat@Example.com' }), ME)).toEqual({ method: 'POST', path: '/api/clubs/club_1/invites', body: { email: 'pat@example.com' } });
    expect(clubCall(form({ action: 'accept', token: 'a'.repeat(48) }), ME)).toEqual({ method: 'POST', path: '/api/clubs/accept', body: { token: 'a'.repeat(48) } });
    expect(clubCall(form({ action: 'remove', org_id: 'club_1', user_id: OTHER }), ME)).toEqual({ method: 'DELETE', path: `/api/clubs/club_1/members/${OTHER}` });
    expect(clubCall(form({ action: 'transfer', org_id: 'club_1', user_id: OTHER }), ME)).toEqual({ method: 'POST', path: '/api/clubs/club_1/transfer', body: { user_id: OTHER } });
    expect(clubCall(form({ action: 'attach', org_id: 'club_1', league_id: 'league_17' }), ME)).toEqual({ method: 'POST', path: '/api/clubs/club_1/leagues', body: { league_id: 'league_17' } });
    expect(clubCall(form({ action: 'detach', org_id: 'club_1', league_id: 'league_17' }), ME)).toEqual({ method: 'DELETE', path: '/api/clubs/club_1/leagues/league_17' });
  });

  it('"leave" always names the signed-in user, whatever the form says', () => {
    expect(clubCall(form({ action: 'leave', org_id: 'club_1', user_id: OTHER }), ME)).toEqual({ method: 'DELETE', path: `/api/clubs/club_1/members/${ME}` });
  });

  it('refuses unknown actions and bad fields before the API sees them', () => {
    expect(clubCall(form({ action: 'grant_comp', org_id: 'club_1' }), ME)).toEqual({ refuse: 'unknown_action' });
    expect(clubCall(form({ action: 'create', name: '  ' }), ME)).toEqual({ refuse: 'club_name_required' });
    expect(clubCall(form({ action: 'invite', org_id: 'club_1', email: 'nope' }), ME)).toEqual({ refuse: 'email_required' });
    expect(clubCall(form({ action: 'invite', org_id: '../billing', email: 'a@b.co' }), ME)).toEqual({ refuse: 'club_not_found' });
    expect(clubCall(form({ action: 'accept', token: '<script>' }), ME)).toEqual({ refuse: 'invite_invalid' });
    expect(clubCall(form({ action: 'remove', org_id: 'club_1', user_id: 'x' }), ME)).toEqual({ refuse: 'club_member_not_found' });
    expect(clubCall(form({ action: 'dissolve', org_id: 'club_1' }), ME)).toEqual({ refuse: 'confirm_required' });
    expect(clubCall(form({ action: 'dissolve', org_id: 'club_1', confirm: 'yes' }), ME)).toEqual({ method: 'DELETE', path: '/api/clubs/club_1' });
  });
});

describe('clubMessage / clubDone', () => {
  it('turns codes into sentences, never the raw code', () => {
    expect(clubMessage('club_seats_full')?.text).toMatch(/4 admin seats/);
    expect(clubMessage('joined')?.good).toBe(true);
    expect(clubMessage('some_new_code')?.text).toMatch(/nothing was changed/);
    expect(clubMessage(null)).toBeNull();
  });
  it('a transfer tells the outgoing owner when they are still paying', () => {
    expect(clubDone('transfer')).toBe('transferred');
    expect(clubDone('transfer', undefined, false)).toBe('transferred');
    expect(clubDone('transfer', undefined, true)).toBe('transferred_paying');
    const m = clubMessage('transferred_paying');
    expect(m?.good).toBe(true);
    expect(m?.text).toMatch(/still billed to you/);
  });
  it('an invite whose email failed says so', () => {
    expect(clubDone('invite', false)).toBe('invited_not_emailed');
    expect(clubDone('invite', true)).toBe('invited');
  });
});

describe('the pages', () => {
  it('the accept page spends nothing on GET — only a button POSTs the token', () => {
    const page = readFileSync('src/pages/app/club/accept.astro', 'utf8');
    expect(page).toContain('method="POST" action="/api/clubs/action"');
    expect(page).not.toMatch(/callRailway/);
  });
  it('the action route reads the payer from the transfer result, not the form', () => {
    const route = readFileSync('src/pages/api/clubs/action.ts', 'utf8');
    expect(route).toMatch(/data\?\.plan_payer === locals\.user\.id/);
  });
  it('the club panel says who pays', () => {
    // Moved out of /app/club into ClubPanel.astro on 2026-11-13, when a
    // club gained an address of its own (/app/club/<id>) and the list
    // and the detail page started sharing one set of markup.
    const panel = readFileSync('src/components/ClubPanel.astro', 'utf8');
    expect(panel).toContain('You pay for this club’s plan.');
    expect(panel).toContain('pays for this club’s plan.');
  });
  it('/app/club still answers, because every club link and 303 lands there', () => {
    const page = readFileSync('src/pages/app/club/index.astro', 'utf8');
    // It routes now: one club goes straight to its own page, with the
    // query string intact so ?welcome=1 and ?club=<code> survive.
    expect(page).toMatch(/clubs\.length === 1/);
    expect(page).toMatch(/Astro\.redirect\(`\$\{clubHref\(clubs\[0\]\.org_id\)\}\$\{search\}`/);
    // The 303 target is no longer a constant — see `clubBack` below — but
    // /app/club is still its default and still has to route.
    expect(readFileSync('src/pages/api/clubs/action.ts', 'utf8')).toMatch(/clubBack\(form\)/);
  });
  it('the action route never puts the token in the redirect', () => {
    const route = readFileSync('src/pages/api/clubs/action.ts', 'utf8');
    expect(route).not.toMatch(/token:/);
  });
});

describe('clubBack — where an action returns you', () => {
  const form = (o: Record<string, string>) => ({ get: (k: string) => o[k] ?? null });

  it('returns to the club the action named, not to a list', () => {
    // With one club this was invisible (the list forwards). With two it was
    // wrong: inviting an admin to club B landed you on the list.
    expect(clubBack(form({ org_id: 'club_abc' }))).toBe('/app/club/club_abc');
  });

  it('honours a back the button asked for', () => {
    // /app/billing's "Attach to your club" is the first button that lives
    // somewhere other than the club page.
    expect(clubBack(form({ back: '/app/billing', org_id: 'club_abc' }))).toBe('/app/billing');
    expect(clubBack(form({ back: '/app/club' }))).toBe('/app/club');
    expect(clubBack(form({ back: '/app/club/club_abc' }))).toBe('/app/club/club_abc');
  });

  it('falls back to the list when there is nothing to go on', () => {
    expect(clubBack(form({}))).toBe('/app/club');
  });

  it('is NOT an open redirect', () => {
    for (const evil of [
      'https://evil.example/app/club',
      '//evil.example',
      '/app/club/../../logout',
      '/app/billing?x=1',
      '/app/billing#x',
      '/login?next=/app/club',
      '/app/clubs',
      '\\evil.example',
      '/app/club/club_abc/../../..',
    ]) {
      expect(clubBack(form({ back: evil })), evil).toBe('/app/club');
    }
    // …and an evil `back` does not stop a valid org_id working.
    expect(clubBack(form({ back: 'https://evil.example', org_id: 'club_abc' }))).toBe('/app/club/club_abc');
  });
});
