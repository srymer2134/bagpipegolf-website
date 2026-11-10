// The /app/profile page must not SELECT a column the database no longer has.
//
// WHY THIS EXISTS
//
// `profiles.handicap_updated_at` is dropped by the flutter migration
// `20261214_bagpipe_handicap_backout.sql`. This page selected it and never
// read it — a vestige of the retired Bagpipe Handicap feature.
//
// The failure mode is bigger than the unused field: **PostgREST rejects the
// WHOLE select when one column is unknown**, with a 400. So the page would not
// have silently omitted a value; its `catch` would have set `loadError` and
// every signed-in visitor would have seen "Could not load your profile."
//
// That dependency is invisible to the usual check. The migration plan verified
// "no dependents" against `pg_depend`, which sees database objects — views,
// constraints, defaults — and knows nothing about an application's SELECT
// list. A reader in another repo is exactly the kind of thing it cannot see,
// which is why this guard lives here rather than there.
//
// Ordering this encodes: the website deploys BEFORE the migration runs.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const page = readFileSync(join(process.cwd(), 'src/pages/app/profile.astro'), 'utf8');

/** The page source with `//` line comments stripped, so prose about a hazard
 *  is never mistaken for the hazard. This file's own explanation names the
 *  column it forbids; so does the page's. */
const code = page
  .split('\n')
  .map((l) => {
    const i = l.indexOf('//');
    return i < 0 ? l : l.slice(0, i);
  })
  .join('\n');

/** Columns dropped from `public.profiles` by 20261214. */
const DROPPED = ['handicap_updated_at', 'bagpipe_suggested_handicap'];

/**
 * The column list actually passed to `.select(...)`, not the whole file.
 *
 * Reading the whole file is what a first version of this guard did, and it was
 * wrong in both directions: `display_name` and `handicap_source` also appear
 * in the page's `loaded` object and its form, so a `.select('id')` that
 * dropped every real column still "contained" them and the guard passed. Two
 * deliberate mutations slipped straight through. Parse the call.
 */
function selectedColumns(): string[] {
  const call = code.match(/\.select\(([\s\S]*?)\)\s*\n/);
  if (!call) throw new Error('could not find the .select(...) call on profile.astro');
  // The argument is single-quoted fragments joined by `+` across lines.
  const fragments = [...call[1].matchAll(/'([^']*)'/g)].map((m) => m[1]);
  if (fragments.length === 0) throw new Error('.select(...) had no string argument');
  return fragments
    .join('')
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);
}

describe('the profile page does not select dropped columns', () => {
  for (const col of DROPPED) {
    it(`never selects ${col}`, () => {
      expect(selectedColumns()).not.toContain(col);
    });
  }

  it('still selects the columns the page renders — not vacuously passing', () => {
    // Without this, a `.select('id')` would satisfy every assertion above.
    const cols = selectedColumns();
    for (const col of ['display_name', 'handicap', 'home_course_id', 'playing_style',
                       'typical_miss', 'typical_miss_irons', 'phone']) {
      expect(cols).toContain(col);
    }
    expect(cols.length).toBeGreaterThanOrEqual(8);
  });

  it('handicap_source survives — only its allowed VALUES narrow', () => {
    // 20261214 narrows the CHECK to ('manual','ghin'); it does not drop the
    // column. A guard that removed this one too would be wrong.
    expect(selectedColumns()).toContain('handicap_source');
  });
});
