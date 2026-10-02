// ============================================================
// Closest-to-Pin hole resolution — a port, pinned to Dart
// ============================================================
// W4b. A direct port of `lib/core/utils/ctp_holes.dart`, pinned by
// `ctpHoles.test.ts` against fixtures generated from that file.
//
// "Which holes have a CTP prize" is not a stored fact. It is a
// two-tier precedence chain, and both directions of getting it wrong
// are quiet:
//
//   * too FEW holes — a director cannot record the winner for a hole
//     that genuinely has one, and the prize goes unpaid;
//   * too MANY — pickers spray across every par 3 on a round where
//     the Brigade deliberately chose two, which is the complaint
//     that produced `ctpHoles` in the first place (Sam, 2026-07-27).
//
// 🚨 `[]` IS NOT `null`. An explicit empty list means "no CTP on this
// round". `null`/absent means "fall back to the tournament-wide
// flag". Conflating them — which is the natural thing to do in
// TypeScript, where a missing key and an empty array both read as
// falsy-ish — silently turns one into the other. The fixture has a
// case for each.

import type { TournamentRound, TournamentRow } from './tournamentQueries';

/// The round's explicit CTP hole list, or `null` when it has none.
///
/// Distinguishes absent from empty, which is the entire point. Only
/// an actual array counts as explicit; junk is treated as absent so a
/// malformed row falls back rather than silently disabling CTP.
export function explicitCtpHoles(round: TournamentRound): number[] | null {
  const raw = (round as Record<string, unknown>).ctp_holes
    ?? (round as Record<string, unknown>).ctpHoles;
  if (!Array.isArray(raw)) return null;
  return raw
    .map((h) => Number(h))
    .filter((h) => Number.isFinite(h) && h >= 1);
}

/// Pars for the round, by the same priority Dart uses: the round's
/// own tee boxes first, then the tournament's, then none. An empty
/// `pars` array is treated as absent so the next link takes over.
function resolvePars(
  tournament: TournamentRow,
  round: TournamentRound,
): number[] {
  const roundTees = round.tee_boxes ?? round.teeBoxes ?? [];
  for (const tee of roundTees) {
    if (Array.isArray(tee.pars) && tee.pars.length > 0) return tee.pars;
  }
  for (const tee of tournament.tee_boxes ?? []) {
    if (Array.isArray(tee.pars) && tee.pars.length > 0) return tee.pars;
  }
  return [];
}

/// The par-3 hole numbers (1-indexed) on this round. This is the
/// candidate set a CTP hole picker offers, and the legacy fallback's
/// answer when `trackCTPOnPar3s` is on.
export function par3Holes(
  tournament: TournamentRow,
  round: TournamentRound,
): number[] {
  const pars = resolvePars(tournament, round);
  const out: number[] = [];
  for (let i = 0; i < pars.length; i++) {
    if (pars[i] === 3) out.push(i + 1); // 1-indexed
  }
  return out;
}

/// The 1-indexed holes on which CTP is tracked for this round.
///
/// Precedence, mirroring `resolveCtpHolesFor`:
///   1. an explicit `ctp_holes` list wins — including `[]`, which
///      means "no CTP on this round";
///   2. otherwise, if the tournament's `track_ctp_on_par_3s` is on,
///      every par 3 on the round;
///   3. otherwise nothing.
///
/// Note clause 1 does NOT filter by par. The model is hole-agnostic —
/// a director may put a CTP on any hole, and the Dart resolver
/// returns the explicit list verbatim. A port that intersected it
/// with the par 3s would silently drop such a hole.
export function resolveCtpHoles(
  tournament: TournamentRow,
  round: TournamentRound,
): number[] {
  const explicit = explicitCtpHoles(round);
  if (explicit !== null) return [...explicit].sort((a, b) => a - b);

  const flag = (tournament as Record<string, unknown>).track_ctp_on_par_3s
    ?? (tournament as Record<string, unknown>).trackCTPOnPar3s;
  if (flag !== true) return [];

  return par3Holes(tournament, round);
}

/// True when any round tracks at least one CTP hole — the gate for
/// showing a CTP section at all.
export function anyRoundTracksCtp(tournament: TournamentRow): boolean {
  for (const round of tournament.rounds ?? []) {
    if (resolveCtpHoles(tournament, round).length > 0) return true;
  }
  return false;
}

/// Which Longest Drive gender brackets this tournament tracks.
///
/// Resolution, mirroring the wizard's `_buildPoolsFromState`:
///
///   * LD off                     -> no brackets
///   * single-gender event        -> that gender only, from `field_gender`
///   * mixed + explicit picks     -> those picks
///   * mixed + no picks           -> both (documented legacy behaviour:
///                                   the app's settlement screen renders
///                                   both rows when the genders list
///                                   predates the picker)
///
/// 🚨 **`field_gender` is OMITTED on the wire when it is `'male'`**, because
/// male is the model's default (`Tournament.toApiJson`: `if (fieldGender !=
/// 'male')`). So an ABSENT key means a men's event, not a mixed one. Reading
/// absent as "mixed" is the bug this comment exists to prevent: it rendered a
/// Women's longest-drive picker on every men's tournament, and a Men's one on
/// every women's tournament, letting a director record a winner in a bracket
/// the event does not have.
///
/// `longest_drive_genders` is only persisted when the commissioner explicitly
/// picked in a MIXED event (`longestDriveGenders: (_trackLongestDrive &&
/// _longestDriveGenders.isNotEmpty) ? ... : null`), which is why
/// single-gender events have to be resolved from `field_gender` instead.
export function longestDriveGenders(tournament: TournamentRow): string[] {
  const row = tournament as Record<string, unknown>;
  const on = row.track_longest_drive ?? row.trackLongestDrive;
  if (on !== true) return [];

  // Absent === 'male'. See the doc comment.
  const rawField = row.field_gender ?? row.fieldGender;
  const field = typeof rawField === 'string' && rawField.trim().length > 0
    ? rawField.toLowerCase().trim()
    : 'male';
  if (field === 'male' || field === 'female') return [field];

  // Mixed: the commissioner's explicit pick, else both.
  const raw = row.longest_drive_genders ?? row.longestDriveGenders;
  if (!Array.isArray(raw) || raw.length === 0) return ['male', 'female'];
  const picked = raw
    .map((g) => String(g).toLowerCase().trim())
    .filter((g) => g === 'male' || g === 'female')
    .filter((g, i, arr) => arr.indexOf(g) === i);
  return picked.length > 0 ? picked : ['male', 'female'];
}

/// Apply a submitted set of closest-to-pin winners ON TOP OF the stored
/// map, rather than replacing it.
///
/// 🚨 **This must merge, not replace.** The editor only renders pickers for
/// holes the round currently TRACKS, so a replace silently deletes any
/// winner recorded on a hole that is no longer tracked — and deletes every
/// winner when a client posts longest drive without a `closestToPin` key at
/// all. The app never does this: `setClosestToPin` copies the existing map
/// and edits one hole
/// (`Map<int, String>.from(round.closestToPinByHole)`), and the sync layer
/// goes further with `_mergeClosestToPin`, whose comment says outright "if
/// the server dropped one hole's CTP entry on the round-trip, the
/// locally-correct entry survives."
///
/// So dropping an entry is a failure mode the app actively defends against,
/// and a second writer must not reintroduce it.
///
/// Semantics, matching the app's per-hole edit:
///   * a submitted hole with a winner  -> set it
///   * a submitted hole with `''`/null -> CLEAR it (a deliberate blank)
///   * a hole not submitted at all     -> LEAVE IT ALONE
export function mergeCtpWinners(
  existing: Record<string, unknown>,
  submitted: Record<string, unknown>,
  opts: { tracked: ReadonlySet<number>; roster: ReadonlySet<string> },
): { winners: Record<string, string>; rejected: string[] } {
  const winners: Record<string, string> = {};
  // Carry the stored map forward, normalising keys to plain integers.
  for (const [k, v] of Object.entries(existing ?? {})) {
    const hole = Number(k);
    if (!Number.isInteger(hole) || hole < 1) continue;
    if (typeof v !== 'string' || v.length === 0) continue;
    winners[String(hole)] = v;
  }

  const rejected: string[] = [];
  for (const [k, v] of Object.entries(submitted ?? {})) {
    const hole = Number(k);
    if (!Number.isInteger(hole) || hole < 1) continue;
    const winner = typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;

    if (winner === null) {
      // A deliberate blank clears that hole and only that hole.
      delete winners[String(hole)];
      continue;
    }
    if (!opts.tracked.has(hole)) {
      rejected.push(`hole ${hole} (no CTP on this round)`);
      continue;
    }
    if (!opts.roster.has(winner)) {
      rejected.push(`hole ${hole} (winner is not on the roster)`);
      continue;
    }
    winners[String(hole)] = winner;
  }

  return { winners, rejected };
}
