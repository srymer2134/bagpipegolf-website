import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Sentry must stay WIRED, not merely installed.
 *
 * The whole integration — `@sentry/astro` for the browser,
 * `@sentry/cloudflare` + `sentryServer.ts` for the Worker, PII
 * opt-outs, `tracesSampleRate: 0`, source-map hooks, a documented
 * `.dev.vars` contract — was fully built and received ZERO events,
 * because no DSN was ever supplied. The Flutter app had the identical
 * shape: `sentry_flutter` wired, `SENTRY_DSN` secret absent, and a
 * comment claiming it "closes the App Store launch gate".
 *
 * Both SDKs no-op SILENTLY on a missing DSN. That is the right runtime
 * behaviour and a terrible failure mode to rely on a human noticing, so
 * the browser DSN now has a committed default and this test guards it.
 */
describe('Sentry browser DSN', () => {
  const config = readFileSync('astro.config.mjs', 'utf8');

  it('astro.config.mjs carries a concrete ingest DSN, not only an env read', () => {
    // Env-only is what shipped unwired for months. A literal cannot be
    // forgotten in a dashboard field nobody knew to fill in.
    expect(config).toMatch(
      /dsn:\s*\n?\s*process\.env\.PUBLIC_SENTRY_DSN\s*\|\|/,
    );
    expect(config).toMatch(/https:\/\/[0-9a-f]+@o\d+\.ingest\.[a-z.]+\/\d+/);
  });

  it('the env var still overrides the default', () => {
    // A hardcoded DSN with no override would block a staging project.
    const i = config.indexOf('process.env.PUBLIC_SENTRY_DSN');
    const j = config.search(/https:\/\/[0-9a-f]+@o\d+\.ingest\./);
    expect(i).toBeGreaterThan(-1);
    expect(j).toBeGreaterThan(i);
  });

  it('PII collection stays off and perf tracing stays at zero', () => {
    expect(config).toMatch(/sendDefaultPii:\s*false/);
    expect(config).toMatch(/tracesSampleRate:\s*0\b/);
  });

  it('the Worker half reads its DSN from the env binding', () => {
    // Deliberately NOT committed: unlike the browser DSN this value is
    // not otherwise public, and this repo is public. It stays a
    // Cloudflare variable.
    const mw = readFileSync('src/middleware.ts', 'utf8');
    expect(mw).toMatch(/dsn:\s*locals\.env\?\.SENTRY_DSN/);
  });
});
