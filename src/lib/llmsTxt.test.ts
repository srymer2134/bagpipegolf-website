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

  it('matches the pricing page wording for hosts', () => {
    expect(txt).toContain('free for tournament and league hosts for a limited time');
    expect(txt).not.toMatch(/during beta/i);
  });
});
