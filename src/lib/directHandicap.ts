// Courses that opt OUT of the World Handicap System.
//
// Sam, Ballyneal Brigade 2026-07-31: on these courses the Course
// Handicap is simply "play your handicap, rounded up" — `HI.ceil()`,
// no slope, no (rating − par) term. The app implements this in
// `courseHandicapForPlayer` by looking the round's course up in its
// curated catalog and reading `CuratedCourse.useDirectHandicap`.
//
// THE WEBSITE HAS NO CURATED CATALOG, so until 2026-10-01 it computed
// WHS for these courses while the app did not. On Ballyneal Blue
// (75.1 / 129 / 71) that is not a rounding difference:
//
//   HI  2.1 → app  3, web  6   (+3)
//   HI  6.4 → app  7, web 11   (+4)
//   HI 10.4 → app 11, web 16   (+5)
//   HI 15.0 → app 15, web 21   (+6)
//   HI 22.3 → app 23, web 30   (+7)
//
// `leaderboard.ts` was written FOR the Ballyneal Brigade, so the web
// leaderboard was giving the wrong net on the one tournament it
// existed to show.
//
// 🚨 This list is checked against the Dart catalog, not trusted. The
// generated `__fixtures__/web-parity.json` carries the list read out
// of `kCuratedCourses`, and `parity.test.ts` fails if this array and
// that list disagree. Note the limit of that: the check fires once the
// fixture has been RE-COPIED from the Flutter repo, which is a manual
// step — neither repo's CI can see the other. The Flutter guard fails
// first, which is what prompts the copy. Do not edit this array
// without regenerating the fixture.

/// Curated course names whose Course Handicap is `ceil(index)`.
/// Kept in the Dart catalog's exact spelling; matching is
/// case-insensitive and substring-based (see `usesDirectHandicap`).
export const DIRECT_HANDICAP_COURSES: readonly string[] = [
  'Ballyneal Golf & Hunt Club',
  'Ballyneal Mulligan (Par 3)',
];

/// True when `courseName` names a course that opts out of WHS.
///
/// Matching mirrors the cheap half of Dart's `findCuratedByName`:
/// lowercase, trim, and accept a substring match in EITHER direction,
/// so a stored "Ballyneal" or "Ballyneal Golf & Hunt Club (Mulligan)"
/// both resolve. Dart also has a tokenized fuzzy backstop; it is not
/// ported, so an unusually-spelled course name falls through to WHS
/// here where the app would catch it. That is the conservative
/// direction to be wrong in — and the reason to store the catalog
/// spelling on the round.
export function usesDirectHandicap(
  courseName: string | null | undefined,
): boolean {
  if (!courseName) return false;
  const q = courseName.trim().toLowerCase();
  if (q.length === 0) return false;
  return DIRECT_HANDICAP_COURSES.some((name) => {
    const n = name.toLowerCase();
    return n.includes(q) || q.includes(n);
  });
}

/// Course Handicap on a WHS opt-out course: the index, rounded UP.
/// `Math.ceil` matches Dart's `num.ceil()` including for plus
/// handicaps (−2.4 → −2, i.e. toward zero).
export function directCourseHandicap(handicapIndex: number): number {
  return Math.ceil(handicapIndex);
}

/// The WHS opt-out applied to one round, or `null` when the round's
/// course does not opt out (in which case the caller runs the normal
/// `courseHandicap` path).
///
/// 🚨 **Takes the RESOLVED index — the one that already honours the
/// round's `playerHandicapIndexSnapshot` override — not the player's
/// profile index.** Get this wrong and a tournament director's
/// Saturday-to-Sunday handicap adjustment is silently dropped on
/// exactly the courses this opt-out exists for.
///
/// This signature is a correction. The first version took the player
/// and read `player.handicapIndex`, because I believed Dart's
/// `courseHandicapForPlayer` ignored the snapshot on these courses. It
/// does not. That function never consults the snapshot *for any*
/// course — applying overrides is the CALLER's job, by design, and both
/// of Dart's resolution paths substitute the overridden index before
/// calling it:
///
///   // round_context.dart:710, and _buildPlayerCHCache at :480
///   final overridden = tp.copyWith(handicapIndex: indexSnap);
///   return courseHandicapForPlayer(player: overridden, ...);
///
/// So `ceil()` receives the overridden index in the app, and must here
/// too. Passing the resolved index is what makes the two agree.
export function directCourseHandicapFor(
  tournament: { course_name: string | null },
  round: Record<string, unknown>,
  resolvedHandicapIndex: number | null,
): number | null {
  const roundCourse = (round.course_name ?? round.courseName) as
    | string
    | null
    | undefined;
  const courseName = roundCourse ?? tournament.course_name;
  if (!usesDirectHandicap(courseName)) return null;
  if (typeof resolvedHandicapIndex !== 'number') return null;
  return directCourseHandicap(resolvedHandicapIndex);
}
