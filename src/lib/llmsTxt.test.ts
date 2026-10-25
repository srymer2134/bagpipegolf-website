import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CUP_TEMPLATE_LIST } from './cupTemplates';
import { LLMS_KEY_PAGES, buildLlmsTxt } from './llmsTxt';
import { sideGames } from './sideGames';

describe('/llms.txt', () => {
  const txt = buildLlmsTxt();

  it('states the real side-game count and current names', () => {
    expect(txt).toContain(`${sideGames.length} side games`);
    expect(txt).toContain('Sixes');
    expect(txt).not.toMatch(/six[- ]six[- ]six/i);
  });

  it('names every Cup template the app ships', () => {
    for (const t of CUP_TEMPLATE_LIST) expect(txt).toContain(t.name);
  });

  it('links only pages that exist', () => {
    for (const [, path] of LLMS_KEY_PAGES) {
      const base = `src/pages${path}`;
      expect(existsSync(`${base}.astro`) || existsSync(`${base}/index.astro`), path).toBe(true);
    }
  });

  it('matches the pricing page: players and tournaments free, leagues $2,000 a year', () => {
    expect(txt).toContain('Free for players. Free for tournament hosts.');
    expect(txt).toContain('$2,000 per league');
    expect(txt).not.toMatch(/for a limited time/i);
    expect(txt).not.toMatch(/during beta/i);
  });
});
