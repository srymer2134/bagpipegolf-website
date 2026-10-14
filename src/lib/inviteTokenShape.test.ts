import { describe, expect, it } from 'vitest';
import { classifyJoinParam } from './inviteTokenShape';

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
