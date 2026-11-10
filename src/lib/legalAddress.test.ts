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
const MAILING_ADDRESS = '3800 Buchtel Blvd, P.O. Box 100532, Denver, CO 80250';

describe('legal contact address', () => {
  it('is the current Denver address on both published pages', () => {
    for (const f of PAGES) {
      expect(read(f), f).toContain(`<strong>Mailing address:</strong> ${MAILING_ADDRESS}`);
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
