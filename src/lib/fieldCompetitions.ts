// ============================================================
// Field competitions — Longest Drive holes, the LD option, and the
// hole-list helpers both CTP and LD share
// ============================================================
// A port of the app's `lib/features/tourney/utils/field_competition_setup.dart`
// (Sam, 2026-11-08). `fieldCompetitions.test.ts` pins it case by case
// against that file's behaviour.
//
// What lives where on the wire:
//
//   * CTP holes per round      `rounds[].ctp_holes`            (ctpHoles.ts)
//   * LD holes per round       `rounds[].longest_drive_holes`  (here)
//   * LD option                `tournaments.longest_drive_genders`
//                              resolved against `field_gender`  (here)
//   * CTP winners              `rounds[].closest_to_pin_by_hole`
//   * LD winners               `rounds[].longest_drive_male_id` / `_female_id`
//
// `longest_drive_holes` follows the same null-vs-empty contract as
// `ctp_holes`: absent = "never set" (legacy rounds — LD shows without
// a hole), `[]` = "explicitly none picked", a list = those holes. It is
// display/config only; the winner is still one per gender per round.

import type { TournamentRound, TournamentRow } from './tournamentQueries';
import { fieldGenderOf } from './competitionConfig';
import { parsForRound } from './tournamentQueries';
import { resolveCtpHoles } from './ctpHoles';

// ── Hole lists ───────────────────────────────────────────────────

/// 1-indexed hole numbers on which `pars` equals `par`.
export function holesWithPar(pars: readonly number[], par: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < pars.length; i++) if (pars[i] === par) out.push(i + 1);
  return out;
}

/// `#5, #15` — sorted, de-duplicated. Mirrors `formatHoleList`.
export function formatHoleList(holes: Iterable<number>): string {
  return [...new Set(holes)].sort((a, b) => a - b).map((h) => `#${h}`).join(', ');
}

/// Normalise an untrusted hole list: integers in [1, maxHole], unique,
/// ascending. Junk entries are dropped, never coerced.
export function cleanHoleList(raw: unknown, maxHole: number): number[] {
  if (!Array.isArray(raw)) return [];
  const out = new Set<number>();
  for (const v of raw) {
    const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
    if (Number.isInteger(n) && n >= 1 && n <= maxHole) out.add(n);
  }
  return [...out].sort((a, b) => a - b);
}

// ── Longest Drive holes ──────────────────────────────────────────

/// The round's explicit LD hole list, or `null` when the key is absent.
/// Same absent-vs-empty contract as `explicitCtpHoles`.
export function explicitLdHoles(round: TournamentRound): number[] | null {
  const r = round as Record<string, unknown>;
  const raw = r.longest_drive_holes ?? r.longestDriveHoles;
  if (!Array.isArray(raw)) return null;
  return raw
    .map((h) => Number(h))
    .filter((h) => Number.isInteger(h) && h >= 1)
    .filter((h, i, a) => a.indexOf(h) === i)
    .sort((a, b) => a - b);
}

/// True when the tournament runs Longest Drive at all. Reads the v1 flag,
/// as the app's `resolveLongestDriveHolesFor` does.
export function tracksLongestDrive(tournament: TournamentRow): boolean {
  const row = tournament as Record<string, unknown>;
  return (row.track_longest_drive ?? row.trackLongestDrive) === true;
}

/// The configured LD holes for `round`: empty when LD is off or no hole
/// was picked. Mirrors `resolveLongestDriveHolesFor`.
export function resolveLdHoles(
  tournament: TournamentRow,
  round: TournamentRound,
): number[] {
  if (!tracksLongestDrive(tournament)) return [];
  return explicitLdHoles(round) ?? [];
}

/// `Hole #9` / `Holes #5, #15`, or null. Mirrors `longestDriveHolesLabel`.
export function ldHolesLabel(
  tournament: TournamentRow,
  round: TournamentRound,
): string | null {
  const holes = resolveLdHoles(tournament, round);
  if (holes.length === 0) return null;
  return `${holes.length === 1 ? 'Hole' : 'Holes'} ${formatHoleList(holes)}`;
}

/// The par 5s on a round — the suggested LD holes.
export function par5Holes(tournament: TournamentRow, round: TournamentRound): number[] {
  return holesWithPar(parsForRound(tournament, round), 5);
}

/// The holes a CTP results surface lists for `round`: every configured
/// CTP hole plus any hole already holding a recorded winner, so an entry
/// is never hidden. Mirrors `ctpRowHolesFor`.
export function ctpRowHoles(tournament: TournamentRow, round: TournamentRound): number[] {
  const out = new Set(resolveCtpHoles(tournament, round));
  const r = round as Record<string, unknown>;
  const map = (r.closest_to_pin_by_hole ?? r.closestToPinByHole) as
    Record<string, unknown> | undefined;
  if (map && typeof map === 'object') {
    for (const [k, v] of Object.entries(map)) {
      const h = Number(k);
      if (Number.isInteger(h) && h >= 1 && typeof v === 'string' && v.trim().length > 0) {
        out.add(h);
      }
    }
  }
  return [...out].sort((a, b) => a - b);
}

// ── The Longest Drive option ─────────────────────────────────────
//
// A men's field runs a Men's Longest Drive, a women's field a Women's,
// and only a mixed field gets a choice — ONE option, not two checkboxes
// that could both be cleared. Mirrors `LongestDriveFormat`.

export type LongestDriveFormat = 'mensAndWomens' | 'mensOnly' | 'womensOnly';

export const LD_FORMAT_LABEL: Record<LongestDriveFormat, string> = {
  mensAndWomens: "Men's & Women's",
  mensOnly: "Men's only",
  womensOnly: "Women's only",
};

export const LD_FORMAT_DESCRIPTION: Record<LongestDriveFormat, string> = {
  mensAndWomens: "Two winners each round — one men's, one women's.",
  mensOnly: "One men's winner each round. Women don't compete.",
  womensOnly: "One women's winner each round. Men don't compete.",
};

/// The `longest_drive_genders` value each option persists.
export const LD_FORMAT_GENDERS: Record<LongestDriveFormat, string[]> = {
  mensAndWomens: ['male', 'female'],
  mensOnly: ['male'],
  womensOnly: ['female'],
};

/// The options a director is offered for `fieldGender`.
export function longestDriveFormatsFor(fieldGender: string): LongestDriveFormat[] {
  switch (fieldGender) {
    case 'female': return ['womensOnly'];
    case 'mixed': return ['mensAndWomens', 'mensOnly', 'womensOnly'];
    default: return ['mensOnly'];
  }
}

/// The option persisted `genders` represent on a `fieldGender` field.
/// Single-gender fields always resolve to their one option; a mixed field
/// with both, none or null resolves to Men's & Women's.
export function longestDriveFormatFrom(
  genders: Iterable<string> | null | undefined,
  fieldGender: string,
): LongestDriveFormat {
  const options = longestDriveFormatsFor(fieldGender);
  if (options.length === 1) return options[0];
  const set = new Set([...(genders ?? [])].map((g) => String(g).toLowerCase()));
  const m = set.has('male');
  const f = set.has('female');
  if (m && !f) return 'mensOnly';
  if (f && !m) return 'womensOnly';
  return 'mensAndWomens';
}

/// Title for the LD toggle, named for what is actually being turned on.
export function longestDriveTitleFor(fieldGender: string): string {
  switch (fieldGender) {
    case 'female': return "Women's Longest Drive";
    case 'mixed': return 'Longest Drive';
    default: return "Men's Longest Drive";
  }
}

/// The note under the toggle that says why this is the option on offer.
export function longestDriveFieldNoteFor(fieldGender: string): string {
  switch (fieldGender) {
    case 'female': return "Women's field — one women's winner each round.";
    case 'mixed': return 'Mixed field — choose who competes:';
    default: return "Men's field — one men's winner each round.";
  }
}

/// The current LD option for a stored tournament.
export function longestDriveFormatOf(tournament: TournamentRow): LongestDriveFormat {
  const row = tournament as Record<string, unknown>;
  const raw = row.longest_drive_genders ?? row.longestDriveGenders;
  return longestDriveFormatFrom(
    Array.isArray(raw) ? (raw as unknown[]).map(String) : null,
    fieldGenderOf(tournament),
  );
}
