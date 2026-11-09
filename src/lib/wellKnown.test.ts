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

  it('carries all three Play App Signing certificates', async () => {
    // Downloaded from Play Console on 2026-11-09 and fingerprinted with
    // openssl locally, never transcribed. Google GENERATED this key --
    // all three are issued to O=Google Inc., CN=Android -- so a Play
    // Store install presents one of these, never our upload cert.
    //
    // Play signs with a hybrid scheme as well as the classical one, and
    // which certificate a device sees depends on the delivery, so all
    // three are listed.
    const res = handleWellKnownRequest('/.well-known/assetlinks.json')!;
    const body = (await res.json()) as Array<{
      target: { sha256_cert_fingerprints: string[] };
    }>;
    const fingerprints = body[0].target.sha256_cert_fingerprints;

    for (const expected of [
      // deployment_cert.der
      'C5:DF:79:FC:05:91:75:F2:2D:21:CB:10:0D:62:F9:54:' +
        'A0:F7:BC:BC:5E:10:12:BB:CA:F1:05:F0:4D:14:45:46',
      // hybrid_classical_cert.der
      'C0:34:40:26:05:77:70:06:00:17:1E:80:E8:BA:73:E6:' +
        '46:84:A3:15:4C:47:35:E8:3E:9F:1B:28:94:A7:AF:20',
      // hybrid_pqc_cert.der
      '79:98:E8:15:DA:D6:93:B3:D7:A8:A9:BE:4B:EA:15:82:' +
        '4F:CA:70:1F:30:83:75:05:D8:E8:E5:87:1D:D2:B1:0D',
    ]) {
      expect(fingerprints).toContain(expected);
    }
  });

  it('lists exactly the four certificates that can sign a build', async () => {
    // Pinned on purpose: Play Store delivery (three Google certs) plus
    // Firebase App Distribution and local release builds (our upload
    // key). Adding or dropping one goes red here so it cannot change
    // quietly -- the sentinel value this file used to serve failed
    // silently for months precisely because nothing watched it.
    const res = handleWellKnownRequest('/.well-known/assetlinks.json')!;
    const body = (await res.json()) as Array<{
      target: { sha256_cert_fingerprints: string[] };
    }>;
    expect(body[0].target.sha256_cert_fingerprints).toHaveLength(4);
  });
});
