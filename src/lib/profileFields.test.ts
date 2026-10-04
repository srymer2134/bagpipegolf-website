// ============================================================
// Profile writes — the two rules that have already cost us once
// ============================================================
// W8. Both behaviours under test here are incidents, not theory:
//
//   1. PARTIAL, NOT FULL. The app's
//      `test/codebase/name_only_profile_writes_test.dart` guards the
//      2026-09-26 signup handicap race — a full-profile PUT sent
//      `handicap: 18.0` (the model default) and overwrote what the
//      user had just typed. A web form is the same hazard with a
//      wider mouth, because it renders every field.
//
//   2. NULL IS NOT OMITTED. The Railway route uses bare `.optional()`
//      on every field except `phone`, and express-validator's
//      `.optional()` skips only `undefined` — so a null 400s with
//      "Invalid value". Only `phone` is `optional({nullable: true})`.

import { describe, expect, it } from 'vitest';

import {
  NULLABLE_FIELDS,
  PROFILE_FIELDS,
  buildProfilePatch,
  validateProfile,
} from './profileFields';

const current = {
  display_name: 'Sam',
  handicap: 10.4,
  home_course_id: 'ov_city_park_gc_denver',
  playing_style: 'balanced',
  typical_miss: 'fade',
  typical_miss_irons: 'draw',
  phone: '+13035551234',
};

describe('buildProfilePatch sends only what changed', () => {
  it('sends nothing when nothing changed', () => {
    // The incident in one assertion: a save with no edits must be a
    // no-op, not a full rewrite of every field.
    expect(buildProfilePatch(current, { ...current })).toEqual({});
  });

  it('sends only the edited field', () => {
    expect(buildProfilePatch(current, { ...current, display_name: 'Sam R' }))
      .toEqual({ display_name: 'Sam R' });
  });

  it('NEVER includes handicap unless the user changed it', () => {
    // The exact shape of the 2026-09-26 race. A name edit must not
    // carry a handicap.
    const patch = buildProfilePatch(current, { ...current, display_name: 'Sam R' });
    expect('handicap' in patch).toBe(false);
  });

  it('sends handicap when it did change, as a number', () => {
    expect(buildProfilePatch(current, { ...current, handicap: 9.2 }))
      .toEqual({ handicap: 9.2 });
  });

  it('treats a string handicap from a form input as its number', () => {
    // An <input type="number"> hands back a string. 10.4 -> "10.4" is
    // not a change and must not be sent.
    expect(buildProfilePatch(current, { ...current, handicap: '10.4' as never }))
      .toEqual({});
    expect(buildProfilePatch(current, { ...current, handicap: '9' as never }))
      .toEqual({ handicap: 9 });
  });

  it('keeps a plus handicap negative', () => {
    expect(buildProfilePatch(current, { ...current, handicap: -2.4 }))
      .toEqual({ handicap: -2.4 });
  });

  it('ignores whitespace-only edits', () => {
    expect(buildProfilePatch(current, { ...current, display_name: ' Sam ' }))
      .toEqual({});
  });

  it('sends several changes together', () => {
    const patch = buildProfilePatch(current, {
      ...current, display_name: 'Sam R', handicap: 9, typical_miss: 'push',
    });
    expect(patch).toEqual({
      display_name: 'Sam R', handicap: 9, typical_miss: 'push',
    });
  });
});

describe('null is not omitted — only phone may be cleared', () => {
  it('clears phone with an explicit null', () => {
    expect(buildProfilePatch(current, { ...current, phone: '' }))
      .toEqual({ phone: null });
  });

  it('refuses to null a non-nullable field, and omits it instead', () => {
    // Sending null here would 400 on the server's bare `.optional()`.
    // Omitting leaves the stored value alone, which is the safe
    // direction — the user is told by validation, not by a 400.
    for (const field of ['home_course_id', 'playing_style', 'typical_miss',
                         'typical_miss_irons'] as const) {
      const patch = buildProfilePatch(current, { ...current, [field]: '' });
      expect(field in patch).toBe(false);
    }
  });

  it('agrees with the server about which field is nullable', () => {
    // If the route ever makes another field nullable, this is the
    // line to change — and the one that will look wrong first.
    expect(NULLABLE_FIELDS).toEqual(['phone']);
  });

  it('never emits a null for anything but phone', () => {
    // Property-style sweep: clear every field at once and assert the
    // only null that survives is phone's.
    const cleared = Object.fromEntries(
      PROFILE_FIELDS.map((f) => [f, '']),
    ) as typeof current;
    const patch = buildProfilePatch(current, cleared);
    const nulls = Object.entries(patch).filter(([, v]) => v === null).map(([k]) => k);
    expect(nulls).toEqual(['phone']);
  });
});

describe('validateProfile mirrors the route', () => {
  it('accepts the current profile unchanged', () => {
    expect(validateProfile(current)).toEqual([]);
  });

  it('enforces the handicap bounds the server enforces', () => {
    expect(validateProfile({ handicap: -10 })).toEqual([]);
    expect(validateProfile({ handicap: 54 })).toEqual([]);
    expect(validateProfile({ handicap: -10.1 })).toHaveLength(1);
    expect(validateProfile({ handicap: 54.1 })).toHaveLength(1);
    // Plus handicaps are negative, which is why the floor is -10.
    expect(validateProfile({ handicap: -4 })).toEqual([]);
  });

  it('rejects a non-numeric handicap', () => {
    expect(validateProfile({ handicap: 'scratch' as never })).toHaveLength(1);
  });

  it('rejects a blank display name rather than silently skipping it', () => {
    // Not nullable server-side, and an empty name breaks every roster
    // row. The user must be told nothing was saved.
    expect(validateProfile({ display_name: '   ' })).toHaveLength(1);
    expect(validateProfile({ display_name: 'A' })).toEqual([]);
  });

  it('enforces the length limits', () => {
    expect(validateProfile({ display_name: 'x'.repeat(50) })).toEqual([]);
    expect(validateProfile({ display_name: 'x'.repeat(51) })).toHaveLength(1);
    expect(validateProfile({ phone: 'x'.repeat(32) })).toEqual([]);
    expect(validateProfile({ phone: 'x'.repeat(33) })).toHaveLength(1);
  });

  it('enforces the enums', () => {
    expect(validateProfile({ playing_style: 'balanced' })).toEqual([]);
    expect(validateProfile({ playing_style: 'reckless' })).toHaveLength(1);
    expect(validateProfile({ typical_miss: 'straight' })).toEqual([]);
    expect(validateProfile({ typical_miss: 'sideways' })).toHaveLength(1);
    expect(validateProfile({ typical_miss_irons: 'pull' })).toEqual([]);
  });

  it('ignores fields the user did not supply', () => {
    // A partial form must not be told off for the fields it omits.
    expect(validateProfile({})).toEqual([]);
    expect(validateProfile({ handicap: 9 })).toEqual([]);
  });

  it('allows clearing the phone', () => {
    expect(validateProfile({ phone: null })).toEqual([]);
    expect(validateProfile({ phone: '' })).toEqual([]);
  });
});

describe('the field list matches the server allow-list', () => {
  it('has exactly the seven fields the route accepts', () => {
    // Copied from packages/api/src/routes/profile.ts. A field added
    // there needs adding here; a field removed there makes this the
    // first thing to look at.
    expect([...PROFILE_FIELDS].sort()).toEqual([
      'display_name',
      'handicap',
      'home_course_id',
      'phone',
      'playing_style',
      'typical_miss',
      'typical_miss_irons',
    ]);
  });
});
