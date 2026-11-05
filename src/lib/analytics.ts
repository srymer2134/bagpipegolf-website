// Google Tag Manager on bagpipegolf.com (Sam, 2026-11-05).
//
// GTM is the ONE analytics tag in the site code. GA4 (G-M85W8RCVYM) and
// anything after it are configured INSIDE the container, not here, so a
// new tag is a GTM publish, not a deploy.
//
// THE PAGE RULE IS THE SECURITY BOUNDARY. A GTM container can run any
// script on any page it loads on, and its publishers can change that
// without a code review. So it loads on the public marketing site only —
// never on signed-in pages, payment pages, invite links, or password pages:
//
//   /app, /pay, /api      signed-in surfaces, billing, Stripe redirects
//   /join                 invite links carry their token in the URL, and
//                         GA records page URLs
//   /login, /forgot-password, /reset-password, /delete-account
//                         password and account forms
//
// `/signup` IS tracked on purpose: the course email's buttons land there
// with UTM tags, and excluding it would lose the campaign attribution.
//
// Hostname is checked in the browser too (see BaseLayout), so a preview
// deploy or localhost never sends a hit even on a page that renders the tag.

export const GTM_CONTAINER_ID = 'GTM-N98KQ7BX';

/** Hostnames whose traffic counts. */
export const GTM_HOSTNAMES = ['bagpipegolf.com', 'www.bagpipegolf.com'];

const EXCLUDED_PREFIXES = [
  '/app',
  '/pay',
  '/api',
  '/join',
  '/login',
  '/forgot-password',
  '/reset-password',
  '/delete-account',
];

/** Should this path render the GTM tag? */
export function gtmAllowedPath(pathname: string): boolean {
  const p = (pathname || '/').toLowerCase();
  return !EXCLUDED_PREFIXES.some((x) => p === x || p.startsWith(x + '/') || p.startsWith(x + '.'));
}

/**
 * The inline loader. Google's standard snippet, wrapped in a hostname guard,
 * plus one listener that forwards the site's existing `bpg:social_click`
 * events (SocialLinks.astro) into the dataLayer.
 */
export function gtmLoaderScript(id: string = GTM_CONTAINER_ID): string {
  const hosts = JSON.stringify(GTM_HOSTNAMES);
  return `(function(w,d,s,l,i){if(${hosts}.indexOf(w.location.hostname)<0)return;
w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});
var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';
j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
w.addEventListener('bpg:social_click',function(e){w[l].push(Object.assign({event:'social_click'},e.detail||{}));});
})(window,document,'script','dataLayer',${JSON.stringify(id)});`;
}
