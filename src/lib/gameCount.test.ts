// ============================================================
// Every game count on the site comes from sideGames.length
// ============================================================
// On 2026-10-07 the FAQ answered "How many side games are supported?"
// with "30+", the home page named nine games "and 21 more" (30 total),
// and a rules page linked to "All 34+ side games" — while the library,
// and the app's GameType enum, both held 34. Every one of those was a
// number someone typed. The fix derives each from `sideGames.length`;
// this file keeps it that way.
//
// Two checks:
//   1. No page, component or layout contains a typed count next to
//      "games" / "side games" / "more" — a digit there means someone
//      wrote a number instead of `{sideGames.length}`.
//   2. The derived counts are honest: the home page's "N more" names
//      only games that exist, and the /side-games page's own catalog
//      has exactly as many entries as the library.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { sideGames } from './sideGames';

const ROOTS = ['src/pages', 'src/components', 'src/layouts'];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return walk(p);
    return /\.(astro|ts|md|mdx)$/.test(p) && !p.endsWith('.test.ts') ? [p] : [];
  });
}

/** "34 side games", "30+ games", "34+ side games", "21 more" — any typed count. */
const TYPED_COUNT = /\b\d{1,3}\+?\s+(?:side[- ])?games\b|\b\d{1,3}\+\s*(?:—|-)|\band\s+\d{1,3}\s+more\b/i;

describe('site game counts', () => {
  const files = ROOTS.flatMap(walk);

  it('scans a real page set (cannot pass vacuously)', () => {
    expect(files.length).toBeGreaterThan(20);
    expect(files).toContain(join('src/pages', 'faq.astro'));
  });

  it('no page hard-codes a game count', () => {
    const bad: string[] = [];
    for (const f of files) {
      readFileSync(f, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          // Code comments may record history ("it said 30+"); copy may not.
          if (/^\s*(\/\/|\*)/.test(line)) return;
          if (TYPED_COUNT.test(line)) bad.push(`${f}:${i + 1}  ${line.trim()}`);
        });
    }
    expect(bad, `typed game count(s) — use {sideGames.length} (currently ${sideGames.length}):\n${bad.join('\n')}`).toEqual([]);
  });

  it('the FAQ answer is derived from the library', () => {
    const faq = readFileSync('src/pages/faq.astro', 'utf8');
    expect(faq).toMatch(/How many side games are supported\?/);
    expect(faq).toMatch(/a: `\$\{sideGames\.length\} —/);
  });

  it("the home page's \"N more\" names only real games", () => {
    const index = readFileSync('src/pages/index.astro', 'utf8');
    const m = index.match(/const featuredGames = \[([^\]]*)\]/);
    expect(m, 'featuredGames list not found in index.astro').not.toBeNull();
    const featured = [...m![1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
    const names = new Set(sideGames.map((g) => g.name));
    expect(featured.filter((n) => !names.has(n))).toEqual([]);
    expect(new Set(featured).size).toBe(featured.length);
    expect(index).toMatch(/const moreGames = sideGames\.length - featuredGames\.length;/);
    expect(sideGames.length - featured.length).toBeGreaterThan(0);
  });

  it('the /side-games catalog lists every game in the library', () => {
    const page = readFileSync('src/pages/side-games.astro', 'utf8');
    const start = page.indexOf('const games: Game[] = [');
    const end = page.indexOf('\n];', start);
    expect(start).toBeGreaterThan(-1);
    const entries = page.slice(start, end).match(/^ {4}name: /gm) ?? [];
    expect(entries.length).toBe(sideGames.length);
  });
});
