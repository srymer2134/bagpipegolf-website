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

  it('serves the real upload-key fingerprint, not a placeholder', async () => {
    const res = handleWellKnownRequest('/.well-known/assetlinks.json')!;
    const body = (await res.json()) as Array<{
      target: { sha256_cert_fingerprints: string[] };
    }>;
    const fingerprints = body[0].target.sha256_cert_fingerprints;

    // Read off the signed bundle for build 1.1.1 (353) with openssl, not
    // transcribed from a console — see the provenance note in wellKnown.ts.
    expect(fingerprints).toContain(
      '8B:C4:6C:38:9F:18:53:4B:95:93:17:A8:13:3A:42:09:' +
        '36:40:F1:F3:24:C4:2A:FF:80:86:61:87:74:9B:44:3A',
    );

    for (const fingerprint of fingerprints) {
      // 32 upper-case hex pairs, colon separated. Android silently fails
      // autoVerify on a malformed value rather than reporting an error.
      expect(fingerprint).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
      expect(fingerprint).not.toMatch(/^(AA:){31}AA$/);
    }
  });

  it('still lacks the Play app signing key — Play Store installs cannot autoVerify', async () => {
    // Deliberate, and the same device as the placeholder assertion this
    // replaced: Google re-signs every uploaded AAB with its own app
    // signing key, so a Play Store install presents Google's certificate
    // and not our upload certificate. Whoever appends that second
    // fingerprint gets a red test telling them to update this file too,
    // rather than one that silently kept passing. PATRICK_BACKLOG §32.
    const res = handleWellKnownRequest('/.well-known/assetlinks.json')!;
    const body = (await res.json()) as Array<{
      target: { sha256_cert_fingerprints: string[] };
    }>;
    expect(body[0].target.sha256_cert_fingerprints).toHaveLength(1);
  });
});
