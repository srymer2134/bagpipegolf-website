import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { sideGames } from './sideGames';
import { APP_STORE_URL, SOCIAL_PROFILE_URLS, siteJsonLd } from './siteIdentity';

describe('site JSON-LD', () => {
  const ld = siteJsonLd();
  const [org, app] = ld['@graph'] as any[];

  it('is the agreed Organization + SoftwareApplication pair', () => {
    expect(org['@type']).toBe('Organization');
    expect(org.legalName).toBe('Taybuta, Inc.');
    expect(app['@type']).toBe('SoftwareApplication');
    expect(app.publisher['@id']).toBe(org['@id']);
    expect(app.offers).toEqual({ '@type': 'Offer', price: '0', priceCurrency: 'USD' });
  });

  it('counts the side games from the library, not from memory', () => {
    expect(app.description).toContain(`${sideGames.length} side games`);
    expect(sideGames.length).toBe(34); // bump with the library; the description follows on its own
  });

  it('lists every social profile the footer shows, plus the App Store', () => {
    expect(new Set(org.sameAs)).toEqual(
      new Set([...Object.values(SOCIAL_PROFILE_URLS), APP_STORE_URL]),
    );
  });

  it('the footer icons read the same URLs', () => {
    const footer = readFileSync('src/components/SocialLinks.astro', 'utf8');
    expect(footer).not.toMatch(/href: 'https:\/\//); // no hard-coded copies
    for (const p of Object.keys(SOCIAL_PROFILE_URLS)) {
      expect(footer).toContain(`SOCIAL_PROFILE_URLS.${p}`);
    }
  });

  it('serialises without anything that could close the <script> tag', () => {
    expect(JSON.stringify(ld)).not.toMatch(/<\/script/i);
  });
});
