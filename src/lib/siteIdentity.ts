// Who Bagpipe Golf is, in one place: the footer's social icons and the
// site-wide schema.org JSON-LD both read from here, so a new account or
// a new side game can't leave one of them stale.
import { sideGames } from './sideGames';

export const SITE_URL = 'https://bagpipegolf.com/';
export const APP_STORE_URL = 'https://apps.apple.com/app/id6775045734';

export const SOCIAL_PROFILE_URLS = {
  tiktok: 'https://www.tiktok.com/@bagpipegolf',
  instagram: 'https://www.instagram.com/bagpipegolfapp/',
  youtube: 'https://www.youtube.com/@bagpipegolf',
  threads: 'https://www.threads.net/@bagpipegolfapp',
  x: 'https://x.com/bagpipegolf1',
} as const;

export type SocialPlatform = keyof typeof SOCIAL_PROFILE_URLS;

/** schema.org Organization + SoftwareApplication, rendered in every
 *  page's <head> by BaseLayout. Facts checked 2026-10-07: price 0, iPhone
 *  and iPad (TARGETED_DEVICE_FAMILY 1,2), seller Taybuta, Inc. The game
 *  count is the website library's — it matches the app's GameType.values. */
export function siteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${SITE_URL}#org`,
        name: 'Bagpipe Golf',
        legalName: 'Taybuta, Inc.',
        url: SITE_URL,
        logo: `${SITE_URL}bagpipe-golf-logo.jpg`,
        email: 'hello@bagpipegolf.com',
        sameAs: [
          SOCIAL_PROFILE_URLS.instagram,
          SOCIAL_PROFILE_URLS.tiktok,
          SOCIAL_PROFILE_URLS.youtube,
          SOCIAL_PROFILE_URLS.threads,
          SOCIAL_PROFILE_URLS.x,
          APP_STORE_URL,
        ],
      },
      {
        '@type': 'SoftwareApplication',
        '@id': `${SITE_URL}#app`,
        name: 'Bagpipe Golf',
        description:
          `Golf scorecard and side-game app: ${sideGames.length} side games ` +
          'with automatic settlement, buddies-trip Cup templates, ' +
          'tournaments and leagues.',
        applicationCategory: 'SportsApplication',
        operatingSystem: 'iOS, iPadOS',
        url: SITE_URL,
        downloadUrl: APP_STORE_URL,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        publisher: { '@id': `${SITE_URL}#org` },
      },
    ],
  };
}
