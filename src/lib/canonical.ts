// THE canonical URL rule for bagpipegolf.com — one function, three users:
// the <link rel="canonical">, og:url (BaseLayout), and the sitemap
// (astro.config.mjs). If they ever disagree, search engines see two
// "official" addresses for one page, which is the problem canonicals fix.
//
// Rule: no trailing slash, except the bare root. Every internal link on
// the site is slash-less (href="/faq"), and both /faq and /faq/ serve 200,
// so the slash-less form is the one the site already treats as real.
// Query strings and fragments are dropped — they never name a different page.

export const SITE_ORIGIN = 'https://bagpipegolf.com';

/** `/faq/` → `/faq`; `/` → `/`; `//x//` → `/x`. */
export function canonicalPath(pathname: string): string {
  const collapsed = ('/' + pathname).replace(/\/{2,}/g, '/');
  const trimmed = collapsed.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

/** Absolute canonical URL for a path or a full URL string. */
export function canonicalUrl(pathOrUrl: string, origin: string = SITE_ORIGIN): string {
  const path = /^https?:\/\//.test(pathOrUrl) ? new URL(pathOrUrl).pathname : pathOrUrl;
  return new URL(canonicalPath(path), origin).href;
}
