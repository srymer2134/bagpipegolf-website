import { describe, expect, it } from 'vitest';
import {
  MIN_PASSWORD_LENGTH,
  readRecoveryParams,
  validateNewPassword,
} from './passwordReset';

const u = (q: string) => new URL(`https://bagpipegolf.com/reset-password${q}`);

describe('readRecoveryParams', () => {
  it('reads a PKCE code', () => {
    expect(readRecoveryParams(u('?code=abc'))).toEqual({ kind: 'code', code: 'abc' });
  });
  it('reads a recovery token hash', () => {
    expect(readRecoveryParams(u('?token_hash=th&type=recovery'))).toEqual({
      kind: 'token_hash',
      tokenHash: 'th',
    });
  });
  it('ignores a token hash for another flow', () => {
    expect(readRecoveryParams(u('?token_hash=th&type=signup'))).toEqual({ kind: 'none' });
  });
  it('surfaces a Supabase error ahead of anything else', () => {
    expect(
      readRecoveryParams(u('?code=abc&error_description=Email+link+is+invalid+or+has+expired')),
    ).toEqual({ kind: 'error', message: 'Email link is invalid or has expired' });
  });
  it('is none with no params', () => {
    expect(readRecoveryParams(u(''))).toEqual({ kind: 'none' });
  });
});

describe('validateNewPassword', () => {
  const ok = 'x'.repeat(MIN_PASSWORD_LENGTH);
  it('accepts a matching pair at the minimum length', () => {
    expect(validateNewPassword(ok, ok)).toBeNull();
  });
  it('rejects a short password', () => {
    expect(validateNewPassword('short', 'short')).toMatch(/at least/);
  });
  it('rejects a mismatch', () => {
    expect(validateNewPassword(ok, ok + 'y')).toMatch(/match/);
  });
  it('rejects a blank field', () => {
    expect(validateNewPassword('', ok)).toMatch(/twice/);
  });
});
