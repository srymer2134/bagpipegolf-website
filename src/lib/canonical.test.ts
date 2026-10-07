import { describe, expect, it } from 'vitest';
import { canonicalPath, canonicalUrl } from './canonical';

describe('canonical URL rule', () => {
  it('drops the trailing slash, keeps the root', () => {
    expect(canonicalPath('/faq/')).toBe('/faq');
    expect(canonicalPath('/faq')).toBe('/faq');
    expect(canonicalPath('/side-games/skins/')).toBe('/side-games/skins');
    expect(canonicalPath('/')).toBe('/');
    expect(canonicalPath('')).toBe('/');
    expect(canonicalPath('//faq//')).toBe('/faq');
  });

  it('both forms of a page name the SAME canonical', () => {
    expect(canonicalUrl('/faq/')).toBe(canonicalUrl('/faq'));
    expect(canonicalUrl('/faq')).toBe('https://bagpipegolf.com/faq');
    expect(canonicalUrl('/')).toBe('https://bagpipegolf.com/');
  });

  it('accepts a full URL (the sitemap passes those) and drops query + hash', () => {
    expect(canonicalUrl('https://bagpipegolf.com/pricing/')).toBe('https://bagpipegolf.com/pricing');
    expect(canonicalUrl('https://bagpipegolf.com/faq/?utm_source=x#top')).toBe('https://bagpipegolf.com/faq');
    expect(canonicalUrl('https://bagpipegolf.com/')).toBe('https://bagpipegolf.com/');
  });
});
