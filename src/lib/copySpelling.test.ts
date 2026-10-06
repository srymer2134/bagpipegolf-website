// ============================================================
// The site's visible copy does not misspell things
// ============================================================
// Sam asked for a spell check of the whole site on 2026-10-06. A full
// dictionary pass found the site clean apart from one non-word
// ("scorekeep"), and the word he asked us to add arrived misspelled
// twice over ("its fully customizeable").
//
// That pass used `/usr/share/dict/words`, which a CI runner does not
// have. A guard that silently skips is worth nothing — the curated
// drift guard in the API repo skipped for weeks and green CI never
// meant parity (project_curated_stub_drift_guard_gap). So this file
// carries its OWN list instead of depending on the host: every entry
// is a string that must never appear in reader-facing copy, and the
// scan fails loudly if it finds no pages to read.
//
// It is a ratchet, not a dictionary. Add a line when a misspelling is
// found in review; it can then never come back.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/** Wrong spelling → what it should be. Case-insensitive, word-bounded. */
const MISSPELLINGS: Record<string, string> = {
  // The two from Sam's own 2026-10-06 request, so the corrected form
  // cannot be undone by a later copy edit.
  customizeable: 'customizable',
  customizeably: 'customizably',
  // Not a word. Was "Games you scorekeep" on /app/side-games.
  scorekeep: 'keep score for',
  scorekeeps: 'keeps score for',
  // The classics, in rough order of how often they reach marketing copy.
  seperate: 'separate',
  seperately: 'separately',
  recieve: 'receive',
  occured: 'occurred',
  occurance: 'occurrence',
  occurence: 'occurrence',
  definately: 'definitely',
  accomodate: 'accommodate',
  acheive: 'achieve',
  calender: 'calendar',
  cancelation: 'cancellation',
  commitee: 'committee',
  enviroment: 'environment',
  existance: 'existence',
  independant: 'independent',
  maintainance: 'maintenance',
  maintenence: 'maintenance',
  neccessary: 'necessary',
  noticable: 'noticeable',
  persistant: 'persistent',
  prefered: 'preferred',
  publically: 'publicly',
  recomend: 'recommend',
  recomendation: 'recommendation',
  refered: 'referred',
  relevent: 'relevant',
  succesful: 'successful',
  sucess: 'success',
  supercede: 'supersede',
  tendancy: 'tendency',
  untill: 'until',
  wierd: 'weird',
  begining: 'beginning',
  beleive: 'believe',
  buisness: 'business',
  comming: 'coming',
  commited: 'committed',
  compatable: 'compatible',
  completly: 'completely',
  dependant: 'dependent',
  immediatly: 'immediately',
  knowlege: 'knowledge',
  lenght: 'length',
  peice: 'piece',
  posible: 'possible',
  reciept: 'receipt',
  seperator: 'separator',
  similer: 'similar',
  suprise: 'surprise',
  threshhold: 'threshold',
  truely: 'truly',
  unfortunatly: 'unfortunately',
  visable: 'visible',
  yeild: 'yield',
  // Golf and product terms we have got wrong before or could.
  birdy: 'birdie',
  bogie: 'bogey',
  bogies: 'bogeys',
  handicaped: 'handicapped',
  leaderbord: 'leaderboard',
  tournment: 'tournament',
  tournamnet: 'tournament',
  scorcard: 'scorecard',
  scorecad: 'scorecard',
  comissioner: 'commissioner',
  commisioner: 'commissioner',
  subsitute: 'substitute',
  substitue: 'substitute',
};

/** Phrases a reader sees that are wrong as a phrase, not as a word. */
const PHRASES: Array<[RegExp, string]> = [
  [/\bits\s+fully\s+customizable\b/i, "it's fully customizable"],
  [/\bshould\s+of\b/i, 'should have'],
  [/\bcould\s+of\b/i, 'could have'],
  [/\bwould\s+of\b/i, 'would have'],
  [/\bper\s+say\b/i, 'per se'],
  [/\b(?:more|less|fewer|better|worse|lower|higher|rather)\s+then\b/i,
    '… than'],
  [/\bto\s+(?:many|much|few|late|early)\b/i, 'too …'],
  [/\bloose\s+(?:the|a|your)\b/i, 'lose …'],
  [/\b(?:the|an|no|any|side)\s+affect\b/i, '… effect'],
  [/\balot\b/i, 'a lot'],
];

function astroFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...astroFiles(full));
    else if (full.endsWith('.astro')) out.push(full);
  }
  return out;
}

/**
 * Reader-facing text only. `<style>` and `<script>` go first, then HTML
 * tags and `{...}` expressions, so a class name or an identifier can
 * never be read as a word. Frontmatter keeps only its string literals,
 * with comments stripped — an apostrophe in a comment would otherwise
 * open a string that swallows the code after it.
 */
export function visibleProse(source: string): string {
  let text = source;
  let frontmatter = '';
  if (text.startsWith('---')) {
    const end = text.indexOf('\n---', 3);
    if (end !== -1) {
      frontmatter = text.slice(3, end);
      text = text.slice(end + 4);
    }
  }
  frontmatter = frontmatter
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(?<![:/])\/\/[^\n]*/g, ' ');
  const literals = [...frontmatter.matchAll(
    /'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g,
  )]
    .map((m) => m[1] ?? m[2] ?? m[3] ?? '')
    .filter((v) => v.includes(' '))
    .join('\n');

  const body = text
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/\{[^{}]*\}/g, ' ')
    .replace(/<[^>]+>/g, '\n');

  return `${literals}\n${body}`;
}

const PAGES = astroFiles('src/pages');
const COMPONENTS = astroFiles('src/components');
const LAYOUTS = astroFiles('src/layouts');
const COPY_MODULES = [
  'src/lib/sideGames.ts',
  'src/lib/roundFormats.ts',
  'src/lib/leagueCreate.ts',
  'src/lib/leagueFieldLanguage.ts',
  'src/lib/leagueEvents.ts',
];

describe('the spell-check guard can actually see the site', () => {
  it('finds pages, components and copy modules', () => {
    // The skip-instead-of-fail trap. If a refactor moves the pages,
    // this fails rather than passing on an empty scan.
    expect(PAGES.length, 'no .astro pages found').toBeGreaterThan(20);
    expect(COMPONENTS.length).toBeGreaterThan(3);
    expect(LAYOUTS.length).toBeGreaterThan(0);
    for (const m of COPY_MODULES) {
      expect(readFileSync(m, 'utf8').length, m).toBeGreaterThan(100);
    }
  });

  it('reads prose and not code', () => {
    const sample = visibleProse(
      '---\n// the app\'s thing\nconst x = toFixed(1);\n' +
      "const copy = 'Each event picks its own format.';\n---\n" +
      '<p class="hero__sub">Visible words here.</p>\n' +
      '<style>.hero__sub { color: red; }</style>',
    );
    expect(sample).toContain('Each event picks its own format.');
    expect(sample).toContain('Visible words here.');
    expect(sample).not.toContain('toFixed');
    expect(sample).not.toContain('hero__sub');
    expect(sample).not.toContain('color: red');
  });
});

describe('no misspelling reaches the reader', () => {
  const sources: Array<[string, string]> = [
    ...[...PAGES, ...COMPONENTS, ...LAYOUTS].map(
      (f) => [f, visibleProse(readFileSync(f, 'utf8'))] as [string, string],
    ),
    ...COPY_MODULES.map(
      (f) => [f, readFileSync(f, 'utf8')] as [string, string],
    ),
  ];

  it('no word from the misspelling ratchet appears', () => {
    const found: string[] = [];
    for (const [file, text] of sources) {
      for (const [wrong, right] of Object.entries(MISSPELLINGS)) {
        const rx = new RegExp(`\\b${wrong}\\b`, 'gi');
        if (rx.test(text)) found.push(`${file}: "${wrong}" -> "${right}"`);
      }
    }
    expect(found).toEqual([]);
  });

  it('no wrong-as-a-phrase construction appears', () => {
    const found: string[] = [];
    for (const [file, text] of sources) {
      for (const [rx, right] of PHRASES) {
        const m = rx.exec(text);
        if (m) found.push(`${file}: "${m[0]}" -> "${right}"`);
      }
    }
    expect(found).toEqual([]);
  });

  it('the ratchet is wired up — a planted misspelling is caught', () => {
    // Proves the regex and the extractor, not just that today is clean.
    const planted = visibleProse(
      '---\nconst copy = \'its fully customizeable\';\n---\n<p>ok</p>',
    );
    const hits = Object.keys(MISSPELLINGS).filter((w) =>
      new RegExp(`\\b${w}\\b`, 'i').test(planted),
    );
    expect(hits).toContain('customizeable');
    expect(PHRASES.some(([rx]) => rx.test('its fully customizable'))).toBe(true);
  });
});
