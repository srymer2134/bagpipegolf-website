// ============================================================
// Field competition winners — who can be picked, and what a stored
// winner value means
// ============================================================
// A port of the app's `lib/features/tourney/utils/competition_winner.dart`
// (flutter PR #1599, Sam 2026-11-08). Pinned by `competitionWinner.test.ts`.
//
// New writes store the tournament player id (`p_…`). Older rows hold a
// typed name from the old free-text editor, so the resolution rule is:
//
//   1. an exact roster id;
//   2. otherwise a name equal, trimmed and case-insensitively, to EXACTLY
//      ONE roster player — two players with that name resolve to nobody;
//   3. otherwise the value is legacy text: shown as-is, with a hint to
//      re-pick, and NEVER silently cleared by a save.
//
// The rule is identical to `SpineTournamentCompetitionWriter.resolveWinner`
// in the app and to `spineCompetitions.ts` here, so what the editor shows
// as linked is exactly what the spine dual-write can resolve.

import type { TournamentPlayer, TournamentRound, TournamentRow } from './tournamentQueries';
import { fieldGenderOf } from './competitionConfig';

/// `'male'` or `'female'` for `p`, falling back to the field gender when
/// the player carries no value. Mixed fields default an unset player to
/// `'male'`, matching the app wizard's per-player chip default.
export function effectivePlayerGender(p: TournamentPlayer, fieldGender: string): string {
  const g = String((p as Record<string, unknown>).gender ?? '').trim().toUpperCase();
  if (g === 'W' || g === 'F' || g === 'FEMALE') return 'female';
  if (g === 'M' || g === 'MALE') return 'male';
  return fieldGender.trim().toLowerCase() === 'female' ? 'female' : 'male';
}

/// The round's attendance list, or null when everyone plays.
export function attendingIdsOf(round: TournamentRound): Set<string> | null {
  const r = round as Record<string, unknown>;
  const raw = r.attending_player_ids ?? r.attendingPlayerIds;
  if (!Array.isArray(raw)) return null;
  return new Set(raw.filter((x): x is string => typeof x === 'string'));
}

/// The players a winner can be picked from for `round`, sorted by name.
/// Honours attendance (null = everyone). With `ldGender`, only players of
/// that gender are offered. Mirrors `competitionRosterFor`.
export function competitionRosterFor(
  tournament: TournamentRow,
  round: TournamentRound,
  ldGender?: string | null,
): TournamentPlayer[] {
  const attending = attendingIdsOf(round);
  const field = fieldGenderOf(tournament);
  return (tournament.players ?? [])
    .filter((p) => attending === null || attending.has(p.id))
    .filter((p) => !ldGender || effectivePlayerGender(p, field) === ldGender)
    .sort((a, b) => a.name.trim().toLowerCase().localeCompare(b.name.trim().toLowerCase()));
}

/// The roster player a stored winner value refers to, or null.
export function resolveCompetitionWinner(
  players: readonly TournamentPlayer[],
  stored: unknown,
): TournamentPlayer | null {
  const raw = typeof stored === 'string' ? stored.trim() : '';
  if (raw.length === 0) return null;
  for (const p of players) if (p.id === raw) return p;
  const key = raw.toLowerCase();
  let hit: TournamentPlayer | null = null;
  for (const p of players) {
    if (String(p.name ?? '').trim().toLowerCase() !== key) continue;
    if (hit !== null) return null; // ambiguous — never guess
    hit = p;
  }
  return hit;
}

export type WinnerDisplay = {
  /// The roster player the stored value resolves to.
  player: TournamentPlayer | null;
  /// The stored value when it resolves to nobody (typed legacy text).
  legacyText: string | null;
  /// The raw stored value, untouched — what a save must send back to
  /// leave the slot alone.
  stored: string | null;
};

/// Resolve `stored` for display.
export function describeCompetitionWinner(
  players: readonly TournamentPlayer[],
  stored: unknown,
): WinnerDisplay {
  const raw = typeof stored === 'string' ? stored.trim() : '';
  if (raw.length === 0) return { player: null, legacyText: null, stored: null };
  const p = resolveCompetitionWinner(players, raw);
  if (p) return { player: p, legacyText: null, stored: stored as string };
  return { player: null, legacyText: raw, stored: stored as string };
}

/// Server-side check for one submitted winner value.
///
///   * `''`/null              -> clear (`null`)
///   * a roster id            -> that id
///   * the value already stored, byte for byte -> keep it, even when it is
///     legacy text. The picker re-submits an untouched legacy slot as-is;
///     refusing it would block every save on a round with one old typed
///     name, and clearing it would delete a winner nobody chose to delete.
///   * anything else          -> rejected
export function acceptWinnerValue(
  submitted: unknown,
  stored: unknown,
  rosterIds: ReadonlySet<string>,
): { ok: true; value: string | null } | { ok: false } {
  const v = typeof submitted === 'string' ? submitted.trim() : '';
  if (v.length === 0) return { ok: true, value: null };
  if (rosterIds.has(v)) return { ok: true, value: v };
  if (typeof stored === 'string' && stored.trim() === v) return { ok: true, value: stored };
  return { ok: false };
}
