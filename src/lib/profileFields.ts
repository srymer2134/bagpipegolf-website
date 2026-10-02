// ============================================================
// Profile writes — partial, and only the fields that changed
// ============================================================
// W8 of the parity plan. `/app/profile` was read-only with "Coming
// soon" chips while claiming "edits sync everywhere"; this makes the
// claim true.
//
// 🚨 WHY THIS IS A PARTIAL WRITE, NOT A FULL ONE
//
// The app has a CI ratchet about exactly this —
// `test/codebase/name_only_profile_writes_test.dart`, guarding the
// 2026-09-26 signup handicap race. `GolferProfile` defaults
// `handicap` to 18.0, so any writer that PUTs a whole profile sends
// 18.0 too, and a name write landing after the user's handicap save
// overwrote it. The sanctioned fix was `updateProfileFields` — a
// partial PUT.
//
// A web form is the same hazard with a wider mouth: it renders every
// field, so a naive save sends every field, and a stale tab would
// happily write back the handicap it loaded ten minutes ago. So this
// sends ONLY what the user actually changed.
//
// 🚨 NULL IS NOT "OMITTED", AND ONLY ONE FIELD MAY BE NULL
//
// From the Railway route (`packages/api/src/routes/profile.ts`):
//
//     body('phone').optional({ nullable: true })   <- null allowed
//     body('handicap').optional()                  <- null REJECTED
//     body('display_name').optional()              <- null REJECTED
//     ...
//
// express-validator's bare `.optional()` skips only `undefined`. A
// null reaches the validator and 400s with "Invalid value". So `phone`
// is the only field that can be CLEARED by sending null; every other
// field must be omitted instead. The app hit this and strips nulls
// before every PUT (`updateProfileFields`); so do we.

/// The fields the Railway route accepts, verbatim from its allow-list.
export const PROFILE_FIELDS = [
  'display_name',
  'handicap',
  'home_course_id',
  'playing_style',
  'typical_miss',
  'typical_miss_irons',
  'phone',
] as const;

export type ProfileField = (typeof PROFILE_FIELDS)[number];

/// The only field the server accepts as `null` — i.e. the only one a
/// user can clear rather than change.
export const NULLABLE_FIELDS: readonly ProfileField[] = ['phone'];

export const PLAYING_STYLES = ['aggressive', 'conservative', 'balanced'] as const;
export const MISSES = ['fade', 'draw', 'straight', 'push', 'pull'] as const;

export type ProfileValues = {
  display_name?: string | null;
  handicap?: number | null;
  home_course_id?: string | null;
  playing_style?: string | null;
  typical_miss?: string | null;
  typical_miss_irons?: string | null;
  phone?: string | null;
};

export type FieldProblem = { field: ProfileField; message: string };

const trimOrNull = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
};

/// Validate against the server's rules, so a user sees a sentence
/// rather than a 400. Bounds and enums are copied from the route; if
/// they ever diverge the server still wins, which is the right way
/// round.
export function validateProfile(values: ProfileValues): FieldProblem[] {
  const out: FieldProblem[] = [];

  if (values.display_name !== undefined) {
    const name = trimOrNull(values.display_name);
    if (name === null) {
      // A blank display name is not a clear — the field is not
      // nullable server-side, and an empty profile name breaks every
      // roster row. Reject rather than silently omit, so the user
      // knows nothing was saved.
      out.push({ field: 'display_name', message: 'Give yourself a display name.' });
    } else if (name.length > 50) {
      out.push({ field: 'display_name', message: 'Keep the display name to 50 characters or fewer.' });
    }
  }

  if (values.handicap !== undefined && values.handicap !== null) {
    const h = Number(values.handicap);
    if (!Number.isFinite(h)) {
      out.push({ field: 'handicap', message: 'Handicap must be a number.' });
    } else if (h < -10 || h > 54) {
      // The server's own bounds. Plus handicaps are negative here,
      // which is why the floor is -10 and not 0.
      out.push({ field: 'handicap', message: 'Handicap must be between +10 and 54.' });
    }
  }

  const phone = values.phone;
  if (phone !== undefined && phone !== null && String(phone).trim().length > 32) {
    out.push({ field: 'phone', message: 'Phone must be 32 characters or fewer.' });
  }

  const enumChecks: Array<[ProfileField, readonly string[], string]> = [
    ['playing_style', PLAYING_STYLES, 'playing style'],
    ['typical_miss', MISSES, 'typical miss'],
    ['typical_miss_irons', MISSES, 'iron miss'],
  ];
  for (const [field, allowed, label] of enumChecks) {
    const v = values[field];
    if (v === undefined || v === null) continue;
    if (!allowed.includes(String(v))) {
      out.push({ field, message: `That is not a ${label} we recognise.` });
    }
  }

  return out;
}

/// Build the PUT body: only fields whose value actually CHANGED, with
/// nulls dropped except for `phone`.
///
/// `current` is what the server last told us. Comparing against it is
/// what makes this a partial write rather than a full one wearing a
/// disguise — a field the user did not touch is absent from the body,
/// so a stale tab cannot write back a value it loaded minutes ago.
export function buildProfilePatch(
  current: ProfileValues,
  next: ProfileValues,
): Record<string, string | number | null> {
  const body: Record<string, string | number | null> = {};

  for (const field of PROFILE_FIELDS) {
    if (!(field in next)) continue;

    let value: string | number | null;
    if (field === 'handicap') {
      const raw = next.handicap;
      if (raw === undefined || raw === null || String(raw).trim() === '') continue;
      const n = Number(raw);
      if (!Number.isFinite(n)) continue;
      value = n;
    } else {
      value = trimOrNull(next[field]);
    }

    // Compare like-for-like against what the server has.
    const before = field === 'handicap'
      ? (current.handicap == null ? null : Number(current.handicap))
      : trimOrNull(current[field]);
    if (before === value) continue; // untouched — do not send it

    if (value === null) {
      // Clearing. Only `phone` may be sent as null; for anything else
      // the server would 400 on the null, so omit it and leave the
      // stored value alone.
      if (NULLABLE_FIELDS.includes(field)) body[field] = null;
      continue;
    }
    body[field] = value;
  }

  return body;
}
