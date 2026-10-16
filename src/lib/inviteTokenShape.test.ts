import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { classifyJoinParam, isInviteToken } from './inviteTokenShape';

describe('classifyJoinParam', () => {
  it('accepts the token the API actually mints (32 hex, no dashes)', () => {
    // The real token from a real invite that dead-ended on 2026-10-13.
    expect(classifyJoinParam('859e918830debe5f29eff89ec560e0a9')).toBe('invite');
  });

  it('accepts 32-hex regardless of case', () => {
    expect(classifyJoinParam('859E918830DEBE5F29EFF89EC560E0A9')).toBe('invite');
  });

  it('still accepts a UUID', () => {
    expect(classifyJoinParam('3f2504e0-4f89-11d3-9a0c-0305e82c3301')).toBe('invite');
  });

  it('still accepts a 6-character join code', () => {
    expect(classifyJoinParam('ZSG8D5')).toBe('code');
    expect(classifyJoinParam('abc123')).toBe('code');
  });

  it('rejects what is neither', () => {
    for (const bad of ['', '   ', 'nope', 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz', '859e9188']) {
      expect(classifyJoinParam(bad)).toBe('invalid');
    }
  });

  it('a 32-char NON-hex string is not a token', () => {
    // Length alone must not qualify — that would send junk to the API.
    expect(classifyJoinParam('g'.repeat(32))).toBe('invalid');
  });

  it('trims surrounding whitespace, as a pasted link often carries', () => {
    expect(classifyJoinParam(' 859e918830debe5f29eff89ec560e0a9 ')).toBe('invite');
  });

  it('null and undefined are invalid, not a crash', () => {
    expect(classifyJoinParam(null)).toBe('invalid');
    expect(classifyJoinParam(undefined)).toBe('invalid');
  });
});

/**
 * ONE route accepts both kinds.
 *
 * `/join/[code]` posts to `/api/invites/<token>/accept` whenever the
 * parameter is an invite token — league or tournament alike; only the
 * 6-char code path diverges. So the proxy's token gate is a
 * single point of failure for both, and it had its own
 * `/^[0-9a-fA-F-]{36}$/` (a UUID length) while the API mints 32 hex.
 *
 * #163 widened the page and left the proxy behind: the invite rendered
 * "You're invited" perfectly and Accept returned "Missing or malformed
 * invite token". A half-fix reads worse than the original break,
 * because it looks like it should work.
 */
describe('isInviteToken — shared by the page and the accept proxy', () => {
  it('accepts a league invite token', () => {
    expect(isInviteToken('859e918830debe5f29eff89ec560e0a9')).toBe(true);
  });

  it('accepts a tournament invite token — same shape, same route', () => {
    // routes/tournaments.ts:937 mints randomBytes(16).toString('hex'),
    // identical to routes/leagues.ts:123.
    expect(isInviteToken('0f1e2d3c4b5a69788796a5b4c3d2e1f0')).toBe(true);
  });

  it('rejects a 6-char join code — that is the other route', () => {
    expect(isInviteToken('ZSG8D5')).toBe(false);
  });

  it('the accept proxy uses the shared predicate, not its own regex', () => {
    const proxy = readFileSync(
      new URL('../pages/api/invites/[token]/accept.ts', import.meta.url),
      'utf8',
    ).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    expect(proxy).toContain('isInviteToken(token)');
    // The old gate must be gone from CODE (the comment explaining it
    // may stay — comments are stripped above).
    expect(proxy).not.toContain('{36}');
  });
});
