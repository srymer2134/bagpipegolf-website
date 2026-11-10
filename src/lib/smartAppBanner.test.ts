import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { APP_STORE_ID, APP_STORE_URL } from './siteIdentity';

// Safari's Smart App Banner ("Open in app" on iPhone) is one meta tag in
// the shared layout. If it is dropped or the id drifts, the banner just
// silently stops appearing — nothing else fails.
const layout = readFileSync('src/layouts/BaseLayout.astro', 'utf8');

describe('Smart App Banner', () => {
  it('the layout declares apple-itunes-app with our App Store id', () => {
    expect(layout).toContain('name="apple-itunes-app"');
    expect(layout).toMatch(/app-id=\$\{APP_STORE_ID\}/);
  });

  it('the id is the one the App Store link uses', () => {
    expect(APP_STORE_ID).toMatch(/^\d{9,10}$/);
    expect(APP_STORE_URL).toBe(`https://apps.apple.com/app/id${APP_STORE_ID}`);
  });

  it('never passes the query string, which can carry one-time tokens', () => {
    const tag = layout.slice(layout.indexOf('name="apple-itunes-app"'));
    const content = tag.slice(0, tag.indexOf('/>'));
    expect(content).not.toContain('Astro.url.search');
  });
});
