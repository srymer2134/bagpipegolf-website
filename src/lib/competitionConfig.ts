// ============================================================
// Configuring field-wide competitions — the two-representation trap
// ============================================================
// W4b config side. Read this before touching the write.
//
// A tournament stores "which field-wide competitions exist" TWICE:
//
//   v1 — `skins_competitions`, `track_ctp_on_par3s`,
//        `track_longest_drive`, `longest_drive_genders`
//   v2 — `pools`, a unified list of {id, kind, buy_in_amount, config}
//
// 🚨 THEY ARE NOT INTERCHANGEABLE, AND NEITHER IS AUTHORITATIVE
// EVERYWHERE. `Tournament.fromJson` does:
//
//     final pools = wirePools ?? _derivePoolsFromLegacyFields(...)
//
// so a `pools` array on the wire WINS — and `toApiJson` emits `pools`
// unconditionally, so any tournament saved by a recent app build has
// one. But `resolveCtpHolesFor` reads `tournament.trackCTPOnPar3s` —
// the v1 FLAG — to decide which holes get a CTP picker.
//
// Write one without the other and the tournament becomes internally
// inconsistent in a way no error surfaces:
//
//   * flags on, pools stale  -> CTP pickers appear, but payouts and
//                               the leaderboard see no CTP pool;
//   * pools on, flags stale  -> a CTP pool exists to be paid out, but
//                               no hole offers a picker to record a
//                               winner on.
//
// So every write here emits BOTH, rebuilt together, with the same
// deterministic ids Dart uses (`legacy_<kind>` /
// `legacy_longest_drive_<gender>`) so a save → reload round-trips to
// the same shape instead of producing a spurious diff.
//
// Mirrors `_derivePoolsFromLegacyFields` (tournament.dart) and the
// wizard's `_buildPoolsFromState` (new_tournament_screen.dart).

import type { TournamentRow } from './tournamentQueries';

export type SkinsKind = 'gross_skins' | 'net_skins' | 'super_skins';

export const SKINS_KINDS: readonly SkinsKind[] = [
  'gross_skins',
  'net_skins',
  'super_skins',
];

/// The director's intent, independent of how it is stored.
export type CompetitionConfig = {
  skins: SkinsKind[];
  /// Closest-to-pin tracked at all. WHICH holes is per-round
  /// (`ctp_holes`), handled separately.
  closestToPin: boolean;
  longestDrive: boolean;
  /// Only meaningful for a mixed field. Empty on a mixed field means
  /// the legacy "show both brackets" behaviour.
  longestDriveGenders: string[];
  /// Per-player buy-in by pool kind. Absent/0 = competition only.
  buyIns: Record<string, number>;
};

export const EMPTY_CONFIG: CompetitionConfig = {
  skins: [],
  closestToPin: false,
  longestDrive: false,
  longestDriveGenders: [],
  buyIns: {},
};

const asRow = (t: TournamentRow) => t as unknown as Record<string, unknown>;

/// The field's gender, defaulting to `'male'`.
///
/// 🚨 `field_gender` is OMITTED on the wire when it is `'male'`
/// (`toApiJson`: `if (fieldGender != 'male')`), so an absent key means
/// a men's event, NOT a mixed one.
export function fieldGenderOf(tournament: TournamentRow): string {
  const raw = asRow(tournament).field_gender ?? asRow(tournament).fieldGender;
  const v = typeof raw === 'string' ? raw.toLowerCase().trim() : '';
  return v.length > 0 ? v : 'male';
}

/// Read the current configuration.
///
/// `pools` wins when present, because that is what `fromJson` does and
/// therefore what the app is actually acting on. The v1 flags are the
/// fallback for tournaments created before `pools` existed.
export function readCompetitionConfig(tournament: TournamentRow): CompetitionConfig {
  const row = asRow(tournament);
  const rawPools = row.pools;
  const buyIns: Record<string, number> = {};

  if (Array.isArray(rawPools) && rawPools.length > 0) {
    const skins: SkinsKind[] = [];
    let ctp = false;
    let ld = false;
    const genders: string[] = [];
    for (const p of rawPools as Record<string, unknown>[]) {
      if (!p || typeof p !== 'object') continue;
      const kind = typeof p.kind === 'string' ? p.kind : '';
      const buyIn = Number(p.buy_in_amount ?? p.buyInAmount);
      if (Number.isFinite(buyIn) && buyIn > 0) buyIns[kind] = buyIn;
      if (SKINS_KINDS.includes(kind as SkinsKind)) {
        if (!skins.includes(kind as SkinsKind)) skins.push(kind as SkinsKind);
      } else if (kind === 'closest_to_pin') {
        ctp = true;
      } else if (kind === 'longest_drive') {
        ld = true;
        const cfg = p.config as Record<string, unknown> | undefined;
        const g = typeof cfg?.gender === 'string' ? cfg.gender.toLowerCase() : '';
        if ((g === 'male' || g === 'female') && !genders.includes(g)) genders.push(g);
      }
    }
    return {
      skins: SKINS_KINDS.filter((k) => skins.includes(k)),
      closestToPin: ctp,
      longestDrive: ld,
      // A single-gender field derives its bracket from `field_gender`,
      // so a gender recorded in pools there is not a director "pick".
      longestDriveGenders:
        fieldGenderOf(tournament) === 'mixed' ? genders : [],
      buyIns,
    };
  }

  // v1 fallback.
  const rawSkins = row.skins_competitions ?? row.skinsCompetitions;
  const skins = Array.isArray(rawSkins)
    ? SKINS_KINDS.filter((k) => (rawSkins as unknown[]).includes(k))
    : [];
  const rawGenders = row.longest_drive_genders ?? row.longestDriveGenders;
  return {
    skins,
    closestToPin: (row.track_ctp_on_par3s ?? row.trackCTPOnPar3s) === true,
    longestDrive: (row.track_longest_drive ?? row.trackLongestDrive) === true,
    longestDriveGenders: Array.isArray(rawGenders)
      ? (rawGenders as unknown[])
          .map((g) => String(g).toLowerCase().trim())
          .filter((g) => g === 'male' || g === 'female')
          .filter((g, i, a) => a.indexOf(g) === i)
      : [],
    buyIns,
  };
}

/// The gender brackets a longest-drive pool should be built for.
///
/// Mirrors the wizard exactly: a single-gender field gets ONE pool
/// tagged with that gender; a mixed field gets the director's picks,
/// or — with no picks — a single untagged pool, which is the legacy
/// "render both rows" shape.
export function ldPoolGenders(
  config: CompetitionConfig,
  fieldGender: string,
): string[] {
  if (!config.longestDrive) return [];
  if (fieldGender !== 'mixed') return [fieldGender];
  return config.longestDriveGenders;
}

/// Build the `pools` array, byte-compatible with what Dart writes.
///
/// Ids are deterministic and match `_derivePoolsFromLegacyFields`, so
/// re-saving an unchanged configuration produces an identical array
/// rather than a spurious diff. `buy_in_amount` and `config` are
/// omitted when empty, matching `TournamentPool.toJson`.
export function buildPools(
  config: CompetitionConfig,
  fieldGender: string,
): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const withBuyIn = (kind: string, row: Record<string, unknown>) => {
    const amount = config.buyIns[kind];
    if (Number.isFinite(amount) && amount > 0) row.buy_in_amount = amount;
    return row;
  };

  for (const kind of SKINS_KINDS) {
    if (!config.skins.includes(kind)) continue;
    out.push(withBuyIn(kind, { id: `legacy_${kind}`, kind }));
  }
  if (config.closestToPin) {
    out.push(withBuyIn('closest_to_pin', {
      id: 'legacy_closest_to_pin',
      kind: 'closest_to_pin',
    }));
  }
  const genders = ldPoolGenders(config, fieldGender);
  if (config.longestDrive) {
    if (genders.length === 0) {
      out.push(withBuyIn('longest_drive', {
        id: 'legacy_longest_drive',
        kind: 'longest_drive',
      }));
    } else {
      for (const g of genders) {
        out.push(withBuyIn('longest_drive', {
          id: `legacy_longest_drive_${g}`,
          kind: 'longest_drive',
          config: { gender: g },
        }));
      }
    }
  }
  return out;
}

/// The full tournament patch for a configuration change — BOTH
/// representations, always.
///
/// `track_ctp_on_par3s` and `track_longest_drive` are sent explicitly
/// as `false` when off. The app only ever EMITS them when true
/// (`if (trackCTPOnPar3s) ...`), but in a PATCH an absent key means
/// "leave unchanged", so turning a competition off requires sending
/// the false. `fromJson` reads a real bool, so it round-trips.
///
/// `longest_drive_genders` is sent as `null` rather than `[]` when it
/// does not apply, matching the model's own "null = no explicit pick"
/// sentinel — and, per the wizard, it carries picks ONLY for a mixed
/// field. A single-gender field leaves it null and lets the pool's
/// gender tag carry the bracket.
export function buildCompetitionPatch(
  config: CompetitionConfig,
  fieldGender: string,
): Record<string, unknown> {
  const mixed = fieldGender === 'mixed';
  const picks = mixed
    ? config.longestDriveGenders.filter((g) => g === 'male' || g === 'female')
    : [];
  return {
    skins_competitions: SKINS_KINDS.filter((k) => config.skins.includes(k)),
    track_ctp_on_par3s: config.closestToPin,
    track_longest_drive: config.longestDrive,
    longest_drive_genders:
      config.longestDrive && picks.length > 0 ? picks : null,
    pools: buildPools(config, fieldGender),
  };
}

/// Normalise untrusted input from the browser into a config.
export function parseCompetitionConfig(raw: unknown): CompetitionConfig {
  const o = (raw ?? {}) as Record<string, unknown>;
  const skinsIn = Array.isArray(o.skins) ? (o.skins as unknown[]).map(String) : [];
  const gendersIn = Array.isArray(o.longestDriveGenders)
    ? (o.longestDriveGenders as unknown[]).map((g) => String(g).toLowerCase().trim())
    : [];
  const buyIns: Record<string, number> = {};
  const rawBuyIns = (o.buyIns ?? {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(rawBuyIns)) {
    const n = Number(v);
    // Negative or absurd buy-ins are dropped rather than clamped, so a
    // typo does not quietly become a real pot.
    if (Number.isFinite(n) && n > 0 && n <= 100000) buyIns[k] = n;
  }
  return {
    skins: SKINS_KINDS.filter((k) => skinsIn.includes(k)),
    closestToPin: o.closestToPin === true,
    longestDrive: o.longestDrive === true,
    longestDriveGenders: gendersIn
      .filter((g) => g === 'male' || g === 'female')
      .filter((g, i, a) => a.indexOf(g) === i),
    buyIns,
  };
}
