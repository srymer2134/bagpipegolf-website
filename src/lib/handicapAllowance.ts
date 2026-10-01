// The USGA handicap-allowance rounding step, in ONE place.
//
// It used to live in three: `matchBoard.ts`, `skinsPool.ts` and
// `teamStandings.ts` each carried a byte-identical private copy. They
// happened to agree, but nothing made them agree — the next edit to
// one of them was a silent three-way divergence on a money path, and
// the function decides how many strokes a plus-handicap player gets
// in a Four-Ball match.
//
// Pinned to the Dart engine by `parity.test.ts` against fixtures
// generated from `BestBallTeamScore.debugAdjustedHandicap`.

/// USGA "round to the nearest whole number" for a course handicap
/// scaled by a format allowance (Four-Ball 0.85, singles 1.0, …).
///
/// `Math.floor(x * a + 0.5)` is the contract, and it is deliberate for
/// plus handicaps: floor runs toward negative infinity in both
/// JavaScript and Dart, so
///
///   18 × 0.85 = 15.3  + 0.5 = 15.8  → 15
///   −2 × 0.85 = −1.7  + 0.5 = −1.2  → −2
///   −5 × 0.85 = −4.25 + 0.5 = −3.75 → −4
///
/// Zero passes through untouched rather than going through the
/// arithmetic, matching Dart's early return.
export function allowanceAdjustedHandicap(
  courseHc: number,
  allowance: number,
): number {
  if (courseHc === 0) return 0;
  return Math.floor(courseHc * allowance + 0.5);
}
