import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

// The contact address on the two published legal pages. Users are told to
// send privacy requests here (Privacy §10) and arbitration notices here
// (Terms §15), so a stale one is not cosmetic.
//
// Casey moved it off the Wyoming registered agent in flutter #1625 and
// fixed the P.O. Box in #1631 (100352 → 100532) — but both PRs touched
// only that repo's docs/*.md copies, which no longer publish anything.
// The live pages kept naming Casper, WY. This file is the reason that
// cannot happen quietly again.
const read = (p: string) => readFileSync(p, 'utf8');
const PAGES = ['src/pages/terms.astro', 'src/pages/privacy.astro'];
// Sam gave the address in this form on 2026-11-09: an addressee line, then
// street, then box, then city. The entity is named again inside the block
// because a postal address needs an addressee, even though both pages name
// Taybuta a line above. Two things normalised to house style, and flagged to
// him: "Inc." keeps the period every other mention in these documents uses,
// and "P.O." keeps both, as in flutter #1631.
const ADDRESS_LINES = [
  'Taybuta, Inc.',
  '3800 Buchtel Blvd',
  'P.O. Box 100532',
  'Denver, CO 80250',
];

describe('legal contact address', () => {
  it('is a mailable four-line block on both published pages', () => {
    for (const f of PAGES) {
      const t = read(f);
      expect(t, f).toContain('<strong>Mailing address:</strong><br />');
      // In order, each on its own line.
      let at = t.indexOf('<strong>Mailing address:</strong>');
      for (const line of ADDRESS_LINES) {
        const next = t.indexOf(line, at);
        expect(next, `${f}: "${line}" after the previous line`).toBeGreaterThan(at);
        at = next;
      }
    }
  });

  it('names the addressee inside the block, not just above it', () => {
    for (const f of PAGES) {
      const t = read(f);
      const block = t.slice(t.indexOf('<strong>Mailing address:</strong>'));
      expect(block.slice(0, 400), f).toContain('Taybuta, Inc.');
    }
  });

  it('does not run the address together on one line', () => {
    for (const f of PAGES) {
      expect(read(f), f).not.toMatch(/Buchtel Blvd, P\.O\. Box/);
    }
  });

  it('keeps no trace of the old Wyoming agent address', () => {
    for (const f of PAGES) {
      expect(read(f), f).not.toMatch(/Greenspire|Casper/);
    }
  });

  it('does not carry the mistyped P.O. Box from flutter #1625', () => {
    for (const f of PAGES) {
      expect(read(f), f).not.toContain('100352');
    }
  });
});
