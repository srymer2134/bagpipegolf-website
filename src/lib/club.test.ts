import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { clubCall, clubDone, clubMessage } from './club';

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
  it('the club page says who pays', () => {
    const page = readFileSync('src/pages/app/club/index.astro', 'utf8');
    expect(page).toContain('You pay for this club’s plan.');
    expect(page).toContain('pays for this club’s plan.');
  });
  it('the action route never puts the token in the redirect', () => {
    const route = readFileSync('src/pages/api/clubs/action.ts', 'utf8');
    expect(route).not.toMatch(/token:/);
  });
});
