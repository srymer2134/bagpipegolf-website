import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

// Addresses on the two published legal pages must be mailboxes that exist.
//
// WHY. `privacy@bagpipegolf.com` was published on /privacy from the day the
// page launched (website #9, ported from the flutter markdown) and **the
// mailbox was never created** — Sam, 2026-11-09. So the policy spent months
// telling people to send privacy requests, data-export requests and rights
// inquiries to an address that bounced, and §6's opt-out instructions
// pointed there too.
//
// An address in a legal document is a promise to receive mail at it. This
// pins the legal pages to addresses Sam has confirmed exist, so a plausible
// but fictional one cannot be written in again — by a person or by me.
//
// TO ADD AN ADDRESS: confirm the mailbox exists first, then add it here in
// the same PR. Do not add one because it reads well.
const read = (p: string) => readFileSync(p, 'utf8');
const PAGES = ['src/pages/terms.astro', 'src/pages/privacy.astro'];

/**
 * Mailboxes Sam has confirmed exist (2026-11-09). Both were confirmed by
 * him directly: `support@` when he caught `privacy@` being fictional, and
 * `hello@` immediately after, when this file's first run flagged it in the
 * Terms page's closing line.
 *
 * TO ADD ONE: get it confirmed first, then add it here in the same PR.
 * Never add an address because it reads well — that is the whole reason
 * this file exists.
 */
const CONFIRMED = ['support@bagpipegolf.com', 'hello@bagpipegolf.com'];

const ALLOWED = [...CONFIRMED];

/** Published at some point, confirmed NOT to exist. */
const KNOWN_DEAD = ['privacy@bagpipegolf.com'];

describe('legal pages only name mailboxes that exist', () => {
  it('uses no address outside the confirmed list', () => {
    for (const f of PAGES) {
      const found = [...read(f).matchAll(/[a-zA-Z0-9._%+-]+@bagpipegolf\.com/g)].map((m) => m[0]);
      const unexpected = [...new Set(found)].filter((a) => !ALLOWED.includes(a));
      expect(unexpected, `${f} names ${unexpected.join(', ')}`).toEqual([]);
    }
  });

  it('never names a mailbox known not to exist', () => {
    for (const f of PAGES) {
      for (const dead of KNOWN_DEAD) {
        expect(read(f), `${f} must not name ${dead}`).not.toContain(dead);
      }
    }
  });

  it('still gives a privacy contact, so the policy is reachable', () => {
    const p = read('src/pages/privacy.astro');
    expect(p).toContain('<strong>Privacy contact:</strong>');
    expect(p).toContain('mailto:support@bagpipegolf.com');
  });

  it('keeps the support contact on the terms page', () => {
    expect(read('src/pages/terms.astro')).toContain('mailto:support@bagpipegolf.com');
  });
});
