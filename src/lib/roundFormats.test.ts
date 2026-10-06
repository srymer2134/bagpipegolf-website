// ============================================================
// The public format catalog cannot fall behind the app
// ============================================================
// On 2026-10-02 Sam opened /app/leagues/new and found copy the app
// had corrected the day before. The sweep that followed turned up a
// bigger version of the same thing: /tournaments listed 12 round
// formats, the app had 20, and `buddies-trips.astro` linked to that
// page as "See all tournament formats". Two-Man Total had shipped the
// previous day and never arrived. Three pages said "30+ side games"
// against an app that ships 32.
//
// None of it was noticed by a test, because the website had no way to
// know what the app contained.
//
// Now it does: `__generated__/formats.json` is generated from the
// Dart enum by `test/parity/round_formats_catalog_test.dart` in
// fairwayiq-flutter and copied here. These tests read it.
//
// 🚨 THIS FILE MUST NEVER SKIP. The curated-course drift guard in the
// API repo silently skips when it cannot find the Flutter source,
// which is why green CI there never meant parity
// (project_curated_stub_drift_guard_gap). A missing or empty
// generated file FAILS here.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import generated from './__generated__/formats.json';
import {
  ROUND_FORMATS,
  ROUND_FORMAT_COUNT,
  SIDE_GAME_COUNT,
  roundFormatLabels,
} from './roundFormats';

// Prose claims only. The first run of this guard flagged
// `grid--2 formats-grid` in schools.astro — a CSS class, not a
// sentence. So the number may not be preceded by a hyphen or word
// character (ruling out `grid--2`) and the noun may not be followed
// by one (ruling out `formats-grid`).
const COUNT_GAMES = /(?<![-\w])(\d+)\+?\s+(?:side\s+)?games\b(?![-\w])/gi;
const VAGUE_GAMES = /(?<![-\w])\d+\+\s+(?:side\s+)?games\b(?![-\w])/gi;
const COUNT_FORMATS =
  /(?<![-\w])(\d+)\+?\s+(?:round\s+|tournament\s+)?formats\b(?![-\w])/gi;

function pageFiles(dir = 'src/pages'): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...pageFiles(full));
    else if (full.endsWith('.astro')) out.push(full);
  }
  return out;
}

describe('the generated catalog is actually present', () => {
  it('has formats, a format count and a side-game count', () => {
    // The skip-instead-of-fail trap. If the copy step was missed, this
    // is where it stops.
    expect(Array.isArray(generated.formats)).toBe(true);
    expect(generated.formats.length).toBeGreaterThan(0);
    expect(generated.formatCount).toBe(generated.formats.length);
    expect(generated.sideGameCount).toBeGreaterThan(0);
  });

  it('every format carries the fields the page renders', () => {
    for (const f of generated.formats) {
      expect(typeof f.code, `code on ${JSON.stringify(f)}`).toBe('string');
      expect(typeof f.label, `label on ${f.code}`).toBe('string');
      expect(typeof f.teamSize, `teamSize on ${f.code}`).toBe('number');
      expect(typeof f.segmentable, `segmentable on ${f.code}`).toBe('boolean');
    }
  });
});

describe('the public catalog covers the app', () => {
  it('every format the app ships has web copy', () => {
    // `roundFormats.ts` throws on a missing entry at import time, so
    // reaching this line already proves it. Asserted anyway, because
    // the throw is easy to turn into a filter by someone trying to
    // make a red build green.
    const covered = new Set(ROUND_FORMATS.map((f) => f.code));
    const missing = generated.formats
      .map((f) => f.code)
      .filter((c) => !covered.has(c));
    expect(missing, 'formats with no entry in roundFormats.ts PROSE').toEqual(
      [],
    );
    expect(ROUND_FORMATS).toHaveLength(ROUND_FORMAT_COUNT);
  });

  it('includes the formats that were missing when this guard was written',
    () => {
      // Named rather than counted. A count can be satisfied by any 20
      // entries; these are the eight that were actually absent.
      const codes = new Set(ROUND_FORMATS.map((f) => f.code));
      for (const code of [
        'two_man_total',
        'best_ball_four_man',
        'scramble_two_man',
        'best_three_of_four',
        'high_low_2v2',
        'twelves',
        'bramble',
        'yellow_ball',
      ]) {
        expect(codes.has(code), `${code} missing from the public catalog`)
          .toBe(true);
      }
    });

  it('every format has a body and a display name', () => {
    for (const f of ROUND_FORMATS) {
      expect(f.name.length, `${f.code} name`).toBeGreaterThan(2);
      expect(f.body.length, `${f.code} body`).toBeGreaterThan(40);
    }
  });

  it('labels are derived, so a second list cannot drift from the first', () => {
    expect(Object.keys(roundFormatLabels).sort()).toEqual(
      ROUND_FORMATS.map((f) => f.code).sort(),
    );
  });

  it('team vs individual follows team size, not the app internal flag', () => {
    // `isTeamFormat` is narrower than the reader's sense of the word —
    // Round Robin, Six-Six-Six and Bloodsome are all false there and
    // all played in pairs. Deriving kind from the flag would move
    // three partner formats under "Individual formats".
    for (const f of ROUND_FORMATS) {
      expect(f.kind, `${f.code} kind`).toBe(
        f.teamSize > 1 ? 'team' : 'individual',
      );
    }
    const robin = ROUND_FORMATS.find((f) => f.code === 'round_robin');
    expect(robin?.kind).toBe('team');
  });
});

describe('hand-written counts match what the app ships', () => {
  const files = pageFiles();

  it('no page claims a side-game count other than the real one', () => {
    const wrong: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      // Any "<number> side games" or "<number> games" claim.
      for (const m of text.matchAll(COUNT_GAMES)) {
        if (Number(m[1]) !== SIDE_GAME_COUNT) {
          wrong.push(`${file}: "${m[0]}" — the app ships ${SIDE_GAME_COUNT}`);
        }
      }
    }
    expect(wrong).toEqual([]);
  });

  it('no page uses a vague "N+" games claim', () => {
    // "30+" was true of 32 and will be true of 40. It is also how the
    // number stopped being maintained. An exact figure goes stale
    // loudly; a vague one never does.
    const vague: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(VAGUE_GAMES)) {
        vague.push(`${file}: "${m[0]}"`);
      }
    }
    expect(vague).toEqual([]);
  });

  it('no page claims a round-format count other than the real one', () => {
    const wrong: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(COUNT_FORMATS)) {
        if (Number(m[1]) !== ROUND_FORMAT_COUNT) {
          wrong.push(
            `${file}: "${m[0]}" — the app ships ${ROUND_FORMAT_COUNT}`,
          );
        }
      }
    }
    expect(wrong).toEqual([]);
  });
});

describe('the side-game library matches the app', () => {
  // The count guard below checks what pages CLAIM. It did not check
  // what the library CONTAINS — so when Bunker Hunt shipped as the
  // 33rd game on 2026-10-02, every page correctly read "33 side games"
  // off the generated catalog while the library held 32 and the game
  // had no page at all. Found by Sam, 2026-10-05, not by this file.
  const lib = readFileSync('src/lib/sideGames.ts', 'utf8');
  const catalog = readFileSync('src/pages/side-games.astro', 'utf8');

  it('the rules library has one entry per game the app ships', () => {
    const slugs = [...lib.matchAll(/^    slug: '([a-z0-9-]+)',$/gm)].map(
      (m) => m[1],
    );
    expect(new Set(slugs).size, 'duplicate slug').toBe(slugs.length);
    expect(slugs).toHaveLength(SIDE_GAME_COUNT);
  });

  it('the catalog page lists one card per game', () => {
    const start = catalog.indexOf('const games: Game[] = [');
    const end = catalog.indexOf('\n];', start);
    expect(start, 'games array not found').toBeGreaterThan(-1);
    const names = [
      ...catalog.slice(start, end).matchAll(/^    name: '(.+)',$/gm),
    ].map((m) => m[1]);
    expect(new Set(names).size, 'duplicate card').toBe(names.length);
    expect(names).toHaveLength(SIDE_GAME_COUNT);
  });

  it('every catalog card resolves to a rules page', () => {
    // The page maps card name → slug by lowercasing. A card with no
    // matching library entry renders as plain text with no link, which
    // looks deliberate and is not.
    const start = catalog.indexOf('const games: Game[] = [');
    const end = catalog.indexOf('\n];', start);
    const names = [
      ...catalog.slice(start, end).matchAll(/^    name: '(.+)',$/gm),
    ].map((m) => m[1].replace(/\s*\(.*\)\s*$/, '').toLowerCase());
    const libNames = new Set(
      [...lib.matchAll(/^    name: '(.+)',$/gm)].map((m) => m[1].toLowerCase()),
    );
    expect(names.filter((n) => !libNames.has(n))).toEqual([]);
  });

  it('Bunker Hunt is present and is not the same game as Bunkers', () => {
    // These are two different bets that both read the bunker toggle.
    // The app labels `GameType.sandies` "Bunkers" (flat per-hole
    // penalty) and `GameType.bunkers` "Bunker Hunt" (bimodal, holder
    // or count). Conflating them would tell a reader the wrong rules.
    expect(lib).toContain("slug: 'bunker-hunt'");
    expect(lib).toContain("slug: 'bunkers'");
    expect(catalog).toContain("name: 'Bunker Hunt'");
    expect(catalog).toContain("name: 'Bunkers'");
  });
});

describe('the tournaments page does not keep its own list', () => {
  const page = readFileSync('src/pages/tournaments.astro', 'utf8');

  it('imports the shared catalog', () => {
    expect(page).toContain("from '../lib/roundFormats'");
  });

  it('does not re-declare a format array or a label map', () => {
    // Both existed here and both were incomplete, in different ways.
    expect(page).not.toMatch(/const\s+formats\s*:\s*Format\[\]/);
    expect(page).not.toMatch(/const\s+roundFormatLabels\s*:/);
  });
});
