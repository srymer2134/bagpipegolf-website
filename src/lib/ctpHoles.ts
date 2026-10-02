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
/// Mirrors the model's documented legacy behaviour: when
/// `trackLongestDrive` is on but `longest_drive_genders` is
/// absent/empty, BOTH brackets show — that is what the app's
/// settlement screen does for tournaments created before the
/// mixed-gender picker landed. Returns `[]` when LD is off.
export function longestDriveGenders(tournament: TournamentRow): string[] {
  const row = tournament as Record<string, unknown>;
  const on = row.track_longest_drive ?? row.trackLongestDrive;
  if (on !== true) return [];
  const raw = row.longest_drive_genders ?? row.longestDriveGenders;
  if (!Array.isArray(raw) || raw.length === 0) return ['male', 'female'];
  const picked = raw
    .map((g) => String(g).toLowerCase().trim())
    .filter((g) => g === 'male' || g === 'female');
  return picked.length > 0 ? picked : ['male', 'female'];
}
