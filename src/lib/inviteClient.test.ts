import { describe, expect, it, vi } from 'vitest';
import {
  chunkEmails,
  emailedCount,
  failedCount,
  INVITE_CHUNK_SIZE,
  sendInvites,
  unsentCount,
  type InviteResult,
} from './inviteClient';

const addrs = (n: number) => Array.from({ length: n }, (_, i) => `p${i}@x.com`);

/** A fetch stub that answers each call from a queued response. */
function stubFetch(
  responses: Array<{ ok: boolean; body: unknown } | 'throw'>,
): { impl: typeof fetch; calls: string[][] } {
  const calls: string[][] = [];
  let i = 0;
  const impl = (async (_url: string, init: RequestInit) => {
    calls.push(JSON.parse(String(init.body)).emails);
    const r = responses[i++];
    if (r === 'throw' || r === undefined) throw new Error('network');
    return { ok: r.ok, json: async () => r.body } as unknown as Response;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const ok = (emails: string[]) => ({
  ok: true,
  body: { invites: emails.map((email) => ({ email, sent: true, token: 't' })) },
});

describe('chunkEmails', () => {
  it('leaves a list that fits in one chunk alone', () => {
    expect(chunkEmails(['a', 'b'])).toEqual([['a', 'b']]);
  });

  it('splits exactly on the chunk boundary with no empty tail', () => {
    const out = chunkEmails(addrs(INVITE_CHUNK_SIZE * 2));
    expect(out).toHaveLength(2);
    expect(out.every((c) => c.length === INVITE_CHUNK_SIZE)).toBe(true);
  });

  it('puts the remainder in a short final chunk', () => {
    const out = chunkEmails(addrs(INVITE_CHUNK_SIZE + 1));
    expect(out.map((c) => c.length)).toEqual([INVITE_CHUNK_SIZE, 1]);
  });

  it('returns nothing for an empty list', () => {
    expect(chunkEmails([])).toEqual([]);
  });

  it('refuses a zero chunk size rather than looping forever', () => {
    expect(() => chunkEmails(['a'], 0)).toThrow(RangeError);
  });

  it('stays under the route cap of 50 per request', () => {
    expect(INVITE_CHUNK_SIZE).toBeLessThanOrEqual(50);
  });
});

describe('sendInvites', () => {
  it('sends one request for a small list and returns its results', async () => {
    const emails = addrs(3);
    const { impl, calls } = stubFetch([ok(emails)]);
    const out = await sendInvites('league_1', emails, impl);
    expect(calls).toEqual([emails]);
    expect(out.failed).toBeNull();
    expect(out.invites).toHaveLength(3);
  });

  it('chunks a long list and concatenates every chunk', async () => {
    const emails = addrs(60);
    const { impl, calls } = stubFetch([
      ok(emails.slice(0, 25)),
      ok(emails.slice(25, 50)),
      ok(emails.slice(50)),
    ]);
    const out = await sendInvites('league_1', emails, impl);
    expect(calls.map((c) => c.length)).toEqual([25, 25, 10]);
    expect(out.invites.map((r) => r.email)).toEqual(emails);
    expect(out.failed).toBeNull();
  });

  it('keeps the chunks that landed when a later one fails, and stops', async () => {
    const emails = addrs(60);
    const { impl, calls } = stubFetch([
      ok(emails.slice(0, 25)),
      { ok: false, body: { error: 'Only the league commissioner can invite' } },
      ok(emails.slice(50)),
    ]);
    const out = await sendInvites('league_1', emails, impl);
    // The third chunk is never attempted — a 403 repeats.
    expect(calls).toHaveLength(2);
    expect(out.invites).toHaveLength(25);
    expect(out.failed).toBe('Only the league commissioner can invite');
  });

  it('reports a network failure without losing earlier results', async () => {
    const emails = addrs(30);
    const { impl } = stubFetch([ok(emails.slice(0, 25)), 'throw']);
    const out = await sendInvites('league_1', emails, impl);
    expect(out.invites).toHaveLength(25);
    expect(out.failed).toBe('Could not reach the server.');
  });

  it('falls back to a generic message when the error body is unreadable', async () => {
    const impl = (async () => ({ ok: false, json: async () => { throw new Error('html'); } })) as unknown as typeof fetch;
    const out = await sendInvites('league_1', addrs(1), impl);
    expect(out.failed).toBe('Could not create those invites.');
  });

  it('does not call the server for an empty list', async () => {
    const spy = vi.fn();
    await sendInvites('league_1', [], spy as unknown as typeof fetch);
    expect(spy).not.toHaveBeenCalled();
  });

  it('url-encodes the league id', async () => {
    let seen = '';
    const impl = (async (url: string) => {
      seen = url;
      return { ok: true, json: async () => ({ invites: [] }) } as unknown as Response;
    }) as unknown as typeof fetch;
    await sendInvites('league/1 2', ['a@x.com'], impl);
    expect(seen).toBe('/api/leagues/league%2F1%202/invites');
  });
});

describe('result tallies', () => {
  const results: InviteResult[] = [
    { email: 'a@x.com', sent: true, token: 't1' },
    { email: 'b@x.com', sent: false, token: 't2' },
    { email: 'c@x.com', sent: false, error: 'insert_failed' },
    // `sent: true` alongside an error should never happen, but if the
    // API ever says it, an errored row is not a delivered email.
    { email: 'd@x.com', sent: true, error: 'insert_failed' },
  ];

  it('counts only error-free rows the API confirmed as emailed', () => {
    expect(emailedCount(results)).toBe(1);
  });

  it('counts created-but-not-emailed rows separately', () => {
    expect(unsentCount(results)).toBe(1);
  });

  it('counts the rows that were not created', () => {
    expect(failedCount(results)).toBe(2);
  });
});
