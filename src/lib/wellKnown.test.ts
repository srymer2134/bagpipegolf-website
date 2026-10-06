import { describe, expect, it } from 'vitest';
import { handleWellKnownRequest } from './wellKnown';

type Aasa = {
  applinks: {
    details: Array<{ appIDs: string[]; components: Array<Record<string, string>> }>;
  };
};

const aasa = async (): Promise<Aasa> => {
  const res = handleWellKnownRequest('/.well-known/apple-app-site-association');
  expect(res).not.toBeNull();
  return (await res!.json()) as Aasa;
};

describe('handleWellKnownRequest routing', () => {
  it('claims only the two .well-known paths', () => {
    expect(handleWellKnownRequest('/.well-known/apple-app-site-association')).not.toBeNull();
    expect(handleWellKnownRequest('/.well-known/assetlinks.json')).not.toBeNull();
    expect(handleWellKnownRequest('/')).toBeNull();
    expect(handleWellKnownRequest('/join/ABC123')).toBeNull();
    expect(handleWellKnownRequest('/.well-known/')).toBeNull();
  });

  it('serves application/json and a 200 — iOS rejects a redirect outright', () => {
    for (const p of [
      '/.well-known/apple-app-site-association',
      '/.well-known/assetlinks.json',
    ]) {
      const res = handleWellKnownRequest(p)!;
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('application/json');
    }
  });
});

describe('apple-app-site-association paths', () => {
  it('still carries the invite deep link', async () => {
    const paths = (await aasa()).applinks.details[0].components.map((c) => c['/']);
    expect(paths).toContain('/join/*');
  });

  it('carries the Stripe checkout return paths', async () => {
    const paths = (await aasa()).applinks.details[0].components.map((c) => c['/']);
    expect(paths).toContain('/pay/success');
    expect(paths).toContain('/pay/cancel');
  });

  it('every component is a path with a comment, under one app id', async () => {
    const details = (await aasa()).applinks.details;
    expect(details).toHaveLength(1);
    expect(details[0].appIDs).toEqual(['5X8U8RN3FJ.com.taybuta.bagpipe']);
    for (const c of details[0].components) {
      expect(typeof c['/']).toBe('string');
      expect(c['/'].startsWith('/')).toBe(true);
      expect(c.comment?.length ?? 0).toBeGreaterThan(0);
    }
  });
});

describe('assetlinks.json', () => {
  it('names the production package', async () => {
    const res = handleWellKnownRequest('/.well-known/assetlinks.json')!;
    const body = (await res.json()) as Array<{
      target: { package_name: string; sha256_cert_fingerprints: string[] };
    }>;
    expect(body[0].target.package_name).toBe('com.taybuta.bagpipe');
  });

  it('is still on the placeholder fingerprint — Android autoVerify cannot pass', async () => {
    // Deliberate: this asserts the KNOWN-BROKEN state so that whoever
    // fills in the real SHA-256 from Play Console (PATRICK_BACKLOG §32)
    // is told by a red test to update it here too, rather than leaving
    // a test that silently kept passing. Flip it to a real-value
    // assertion in that same PR.
    const res = handleWellKnownRequest('/.well-known/assetlinks.json')!;
    const body = (await res.json()) as Array<{
      target: { sha256_cert_fingerprints: string[] };
    }>;
    expect(body[0].target.sha256_cert_fingerprints[0]).toMatch(/^(AA:){31}AA$/);
  });
});
