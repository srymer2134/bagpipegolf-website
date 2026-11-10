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
 * Columns `20261216` removes from the `authenticated` role's column grant.
 *
 * These are NOT dropped — the owner still has them, through
 * `my_profile_contact()`. They are removed from the role because
 * `public.profiles` is readable by EVERY signed-in account
 * ("Authenticated users can search profiles" is `auth.role() =
 * 'authenticated'`), so a plain select of `phone` here is the same read any
 * stranger could run against any user. Selecting one in the page's main
 * query would 400 once that migration lands.
 */
const NOT_GRANTED = ['phone', 'phone_verified_at', 'sms_opt_in_at'];

/**
 * The column list of the page's PRIMARY profile query.
 *
 * "Primary" means the first `.select(...)` with more than one column. That
 * qualifier matters: the page also has a single-column `.select('phone')`
 * fallback for the window where the RPC does not exist yet, and a guard that
 * grabbed whichever select came first would eventually read that one and
 * either pass vacuously or fail for the wrong reason.
 *
 * Reading the whole FILE instead of parsing the call was the first version of
 * this guard, and it was wrong in both directions: `display_name` and
 * `handicap_source` also appear in the page's `loaded` object and form, so a
 * `.select('id')` that dropped every real column still "contained" them. Two
 * deliberate mutations went straight through. Parse the calls.
 */
function primarySelectColumns(): string[] {
  const calls = [...code.matchAll(/\.select\(([\s\S]*?)\)/g)];
  if (calls.length === 0) throw new Error('no .select(...) call on profile.astro');
  for (const call of calls) {
    const fragments = [...call[1].matchAll(/'([^']*)'/g)].map((m) => m[1]);
    if (fragments.length === 0) continue;
    const cols = fragments.join('').split(',').map((c) => c.trim()).filter(Boolean);
    if (cols.length > 1) return cols;
  }
  throw new Error('found no multi-column .select(...) — the page query was gutted');
}

describe('the profile page does not select columns it cannot read', () => {
  for (const col of DROPPED) {
    it(`never selects ${col} — the column no longer exists`, () => {
      expect(primarySelectColumns()).not.toContain(col);
    });
  }

  for (const col of NOT_GRANTED) {
    it(`never selects ${col} in the main query — authenticated loses it in 20261216`, () => {
      expect(primarySelectColumns()).not.toContain(col);
    });
  }

  it('still selects the columns the page renders — not vacuously passing', () => {
    const cols = primarySelectColumns();
    for (const col of ['display_name', 'handicap', 'home_course_id']) {
      expect(cols).toContain(col);
    }
    expect(cols.length).toBeGreaterThanOrEqual(4);
  });

  it('handicap_source survives — only its allowed VALUES narrow', () => {
    // 20261214 narrows the CHECK to ('manual','ghin'); it does not drop the
    // column, and `authenticated` keeps it.
    expect(primarySelectColumns()).toContain('handicap_source');
  });

  it('the owner still gets their phone, through the definer RPC', () => {
    // Without this the guard above is satisfied by simply deleting the
    // phone field from the page — which would silently stop showing users
    // a number they have stored.
    expect(code).toContain("rpc('my_profile_contact')");
  });
});
