// ============================================================
// Font sizes must be rem, so iOS large-font settings work
// ============================================================
// A hard-coded `font-size: 14px` ignores the reader's chosen text
// size. On iOS, Settings → Display & Brightness → Text Size (and
// Accessibility → Larger Text) scales the browser's root font size —
// so `rem` honours it and `px` silently overrides it.
//
// 531 declarations across 54 files were converted in one pass. Without
// a guard, the next page added brings px back and nobody notices,
// because nothing looks wrong unless you are the person who needed
// the larger text.
//
// SCOPE: font-size only. Paddings, borders and radii stay px on
// purpose — scaling those with the text makes layouts drift without
// helping legibility, and the point here is reading, not zoom.
//
// Allowed in a font-size value:
//   rem · em · % · vw/vh · clamp()/min()/max()/calc() of those
//   keywords (inherit, smaller, …) and CSS variables
// Not allowed: an absolute px length.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = 'src';
const EXTS = ['.astro', '.css'];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (EXTS.some((e) => p.endsWith(e))) out.push(p);
  }
  return out;
}

/// `font-size:` and its value, up to the declaration terminator.
const DECL = /font-size:\s*([^;}]+)/g;
/// A px length — not `0px`-free, not part of an identifier or a
/// variable name like `--size-14px`.
const PX = /(?<![\w.-])\d+(?:\.\d+)?px\b/;

type Offence = { file: string; line: number; text: string };

function offences(): Offence[] {
  const found: Offence[] = [];
  for (const file of walk(ROOT)) {
    const src = readFileSync(file, 'utf8');
    const lines = src.split('\n');
    for (const m of src.matchAll(DECL)) {
      if (!PX.test(m[1])) continue;
      const line = src.slice(0, m.index ?? 0).split('\n').length;
      found.push({
        file,
        line,
        text: (lines[line - 1] ?? '').trim().slice(0, 90),
      });
    }
  }
  return found;
}

describe('font sizes are expressed in rem, not px', () => {
  it('has no hard-coded px font-size anywhere under src/', () => {
    const bad = offences();
    const report = bad
      .map((o) => `  ${o.file}:${o.line}  ${o.text}`)
      .join('\n');
    expect(
      bad,
      bad.length === 0 ? '' :
        `${bad.length} hard-coded px font-size(s) found. Use rem so the `
        + `reader's text-size setting is honoured — divide by 16 `
        + `(14px -> 0.875rem):\n${report}`,
    ).toEqual([]);
  });

  it('is actually scanning files — the guard cannot pass vacuously', () => {
    // A walker that silently returned [] would make the assertion
    // above meaningless. Pin that it finds the tree it is meant to.
    const files = walk(ROOT);
    expect(files.length).toBeGreaterThan(40);
    expect(files.some((f) => f.endsWith('layouts/BaseLayout.astro'))).toBe(true);
    expect(files.some((f) => f.endsWith('.astro'))).toBe(true);
  });

  it('and its px detector actually detects px', () => {
    // Guard the guard: if PX stopped matching, the first test would
    // pass forever regardless of what the CSS said.
    expect(PX.test('14px')).toBe(true);
    expect(PX.test('clamp(32px, 4.5vw, 48px)')).toBe(true);
    expect(PX.test('0.875rem')).toBe(false);
    expect(PX.test('clamp(2rem, 4.5vw, 3rem)')).toBe(false);
    expect(PX.test('inherit')).toBe(false);
    expect(PX.test('var(--step-1)')).toBe(false);
    // A vw/vh value must not be mistaken for px.
    expect(PX.test('4.5vw')).toBe(false);
  });

  it('counts the real font-size declarations it is protecting', () => {
    // Sanity floor: if this collapses, the DECL regex broke and the
    // suite would be guarding nothing.
    const src = walk(ROOT).map((f) => readFileSync(f, 'utf8')).join('\n');
    const decls = [...src.matchAll(DECL)].length;
    expect(decls).toBeGreaterThan(400);
  });
});
