import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { enabledFrom, paymentsGate } from './paymentsGate';
import type { ApiResult } from './paymentsServer';

function fixture(name: string): ApiResult<unknown> {
  const f = JSON.parse(readFileSync(`src/lib/__fixtures__/payments/${name}.json`, 'utf8')) as {
    http: number;
    body: { code?: string; error?: string };
  };
  if (f.http >= 200 && f.http < 300) return { ok: true, status: f.http, data: f.body };
  return { ok: false, status: f.http, code: f.body.code!, error: f.body.error!, body: f.body as never };
}

function probe(res: ApiResult<unknown> | (() => Promise<ApiResult<unknown>>)) {
  const calls: number[] = [];
  const fn = () => {
    calls.push(1);
    return typeof res === 'function' ? res() : Promise.resolve(res);
  };
  return { fn, calls };
}

describe('paymentsGate — per-scope, fail closed', () => {
  it('enabled: a 2xx payments read shows the control and hands back the result', async () => {
    const res = fixture('payments_empty');
    const p = probe(res);
    const g = await paymentsGate('live', p.fn);
    expect(g.enabled).toBe(true);
    expect(g.result).toBe(res);
    expect(p.calls).toHaveLength(1);
  });

  it('enabled: an owner merchant read that is ready, or never onboarded, shows set-up', async () => {
    expect((await paymentsGate('live', probe(fixture('merchant_ready')).fn)).enabled).toBe(true);
    // 404 merchant_not_ready is only reachable past the API allow-list gate.
    expect((await paymentsGate('live', probe(fixture('merchant_not_set_up')).fn)).enabled).toBe(true);
  });

  it('payments_disabled (503) → hidden', async () => {
    const g = await paymentsGate('live', probe(fixture('error_payments_disabled')).fn);
    expect(g.enabled).toBe(false);
  });

  it.each(['not_director', 'upstream_error', 'unauthenticated', 'not_found', 'internal_error'])(
    '%s → hidden (any non-enabled answer fails closed)',
    async (code) => {
      const g = await paymentsGate('live', probe({ ok: false, status: 500, code, error: 'x', body: null }).fn);
      expect(g.enabled).toBe(false);
    },
  );

  it('network error (the probe throws) → hidden, no throw out of the page', async () => {
    const g = await paymentsGate('live', () => Promise.reject(new Error('fetch failed')));
    expect(g).toEqual({ enabled: false, result: null });
  });

  it('timeout → hidden', async () => {
    const never = () => new Promise<ApiResult<unknown>>(() => {});
    const g = await paymentsGate('live', never, 10);
    expect(g).toEqual({ enabled: false, result: null });
  });

  it('flag OFF → hidden and the probe is never called', async () => {
    const p = probe(fixture('payments_empty'));
    const g = await paymentsGate('off', p.fn);
    expect(g).toEqual({ enabled: false, result: null });
    expect(p.calls).toEqual([]);
  });

  it('fixtures mode behaves like live (so astro dev can show both states)', async () => {
    expect((await paymentsGate('fixtures', probe(fixture('payments_empty')).fn)).enabled).toBe(true);
    expect((await paymentsGate('fixtures', probe(fixture('error_payments_disabled')).fn)).enabled).toBe(false);
  });

  it('enabledFrom: null/undefined is not enabled', () => {
    expect(enabledFrom(null)).toBe(false);
    expect(enabledFrom(undefined)).toBe(false);
  });
});
