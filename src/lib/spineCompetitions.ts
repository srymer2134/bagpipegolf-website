// ============================================================
// Tournament field competitions -> spine dual-write, from the website
// ============================================================
// A port of the app's `SpineTournamentCompetitionWriter`
// (`lib/core/services/spine/spine_tournament_competition_writer.dart`,
// flutter #1597; API #203). Plan, flutter repo:
// `docs/plans/2026-11-08_SPINE_TOURNAMENT_COMPETITIONS_PLAN.md`.
//
// WHY THE WEBSITE NEEDS IT. When the app records a CTP / LD winner or
// changes a pool, it writes `tournaments.rounds[]` / `pools` AND mirrors
// the decision onto `bagpipe.games` + `bagpipe.game_events` through the
// Railway spine routes. The website's competition routes wrote only the
// legacy columns, so a winner entered at the clubhouse desk never reached
// the spine, and the spine silently disagreed with the tournament until
// someone happened to re-save that round from a phone.
//
// SAME PATH, NOT A PARALLEL ONE. Every write goes through the existing
// Railway spine routes as the signed-in user, with the same keys the app
// uses — `tcomp:<spineRoundId>:ctp|longest_drive` for a round's decision
// game, `tpool:<spineEventId>:<poolId>` for a pool — so the website and
// the app upsert the SAME rows. No new table, column or route.
//
// RECONCILE, NOT TOGGLE. `bagpipe_add_game_event` is a plain insert and
// `game_events` has no unique key, so each sync reads the round
// projection, builds the COMPLETE desired set from the legacy round, and
// diffs. Whoever saves last converges the spine on what they saw.
//
// ADDITIVE AND NEVER FATAL. The legacy write has already landed when this
// runs. Every failure is caught and returned as an outcome; the caller
// logs it and the save still succeeds. A 403 here is a director who is
// not a player on that spine round — the next save from a permitted
// device carries it, exactly as in the app.
//
// GATED ON THE BRIDGE. Only a round that carries `spine_round_id` (and,
// for pools, a tournament that carries `spine_event_id`) is touched. Those
// ids exist only when the app's `SPINE_TOURNAMENT_BRIDGE` minted them, so
// an unbridged tournament costs nothing and writes nothing.
//
// Derived results are never written (spine Rule 9): skins come from
// `bagpipe.hole_scores`.

import type { TournamentPlayer, TournamentRound, TournamentRow } from './tournamentQueries';
import { resolveCompetitionWinner } from './competitionWinner';
import { resolveCtpHoles } from './ctpHoles';

// ── wire vocabulary (identical to the app) ──────────────────────────

export const CTP_GAME_TYPE = 'tournament_ctp';
export const LD_GAME_TYPE = 'tournament_longest_drive';
export const CTP_WINNER_EVENT = 'ctp_winner';
export const LD_WINNER_EVENT = 'longest_drive_winner';
export const POOL_TYPE_PREFIX = 'tournament_pool_';
/// `hole_number` is NOT NULL and >= 1. An LD decision on a round with
/// zero or several LD holes carries this placeholder and `value.hole` null.
export const LD_PLACEHOLDER_HOLE = 1;

export const decisionGameKey = (spineRoundId: string, kind: string) =>
  `tcomp:${spineRoundId}:${kind}`;
export const poolGameKey = (spineEventId: string, poolId: string) =>
  `tpool:${spineEventId}:${poolId}`;

/// The transport. Production passes a `callRailway` closure; tests pass a
/// recorder. Must throw on a non-2xx.
export type SpineCall = (init: {
  method: 'GET' | 'POST' | 'DELETE';
  path: string;
  body?: unknown;
}) => Promise<unknown>;

export type SpineSyncOutcome =
  | 'synced'
  | 'noSpineRound'
  | 'nothingToWrite'
  | 'failed';

export type SpineSyncResult = {
  outcome: SpineSyncOutcome;
  added: number;
  removed: number;
  unresolved: string[];
  error?: string;
};

const result = (
  outcome: SpineSyncOutcome,
  extra: Partial<SpineSyncResult> = {},
): SpineSyncResult => ({ outcome, added: 0, removed: 0, unresolved: [], ...extra });

const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim().length > 0 ? v : null;

export function spineRoundIdOf(round: TournamentRound): string | null {
  const r = round as Record<string, unknown>;
  return str(r.spine_round_id ?? r.spineRoundId);
}

export function spineEventIdOf(t: TournamentRow): string | null {
  const r = t as Record<string, unknown>;
  return str(r.spine_event_id ?? r.spineEventId);
}

// ── identity ─────────────────────────────────────────────────────────

const PROFILE_ID = /^p_([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/;
const SYNTHETIC_PREFIXES = ['p_sample_', 'p_uat_'];

/// `TournamentPlayerIdClassifier.classify`, reduced to what the writer
/// needs: is the id one that is ever seeded on the spine, and does it
/// embed a profile uuid.
export function classifyPlayerId(raw: string): { migratable: boolean; profileId: string | null } {
  const m = PROFILE_ID.exec(raw);
  if (m) return { migratable: true, profileId: m[1] };
  if (raw === 'p_me') return { migratable: false, profileId: null };
  if (SYNTHETIC_PREFIXES.some((p) => raw.startsWith(p))) {
    return { migratable: false, profileId: null };
  }
  return { migratable: true, profileId: null };
}

/// `p`'s `round_player_id` in a `bagpipe_get_round` projection, or null.
/// A profile by uuid; a guest by `lower(trim(name))` among non-team-card
/// rows. Mirrors `roundPlayerIdFor`.
export function roundPlayerIdFor(
  projection: Record<string, unknown>,
  p: TournamentPlayer,
): string | null {
  const c = classifyPlayerId(p.id);
  if (!c.migratable) return null;
  const uid = str(p.userId) ?? c.profileId;
  const players = projection.players;
  if (!Array.isArray(players)) return null;
  const name = String(p.name ?? '').trim().toLowerCase();
  for (const raw of players) {
    if (!raw || typeof raw !== 'object') continue;
    const row = raw as Record<string, unknown>;
    if (row.is_team_card === true) continue;
    const id = row.round_player_id;
    if (typeof id !== 'string') continue;
    const profile = typeof row.profile_id === 'string' ? row.profile_id : null;
    if (uid !== null) {
      if (profile === uid) return id;
    } else if (profile === null
        && typeof row.guest_name === 'string'
        && row.guest_name.trim().toLowerCase() === name) {
      return id;
    }
  }
  return null;
}

// ── round configuration ─────────────────────────────────────────────

/// Configured LD holes on the round (sorted), or null when the key is
/// absent. Mirrors `ldHolesOf`.
export function ldHolesOf(round: TournamentRound): number[] | null {
  const r = round as Record<string, unknown>;
  const raw = r.longest_drive_holes ?? r.longestDriveHoles;
  if (!Array.isArray(raw)) return null;
  return raw.filter((n): n is number => typeof n === 'number')
    .map((n) => Math.trunc(n)).sort((a, b) => a - b);
}

export const ldEventHole = (holes: number[] | null): number | null =>
  holes !== null && holes.length === 1 ? holes[0] : null;

function ldGendersOf(t: TournamentRow): string[] | null {
  const r = t as Record<string, unknown>;
  const raw = r.longest_drive_genders ?? r.longestDriveGenders;
  if (!Array.isArray(raw)) return null;
  return raw.map(String).sort();
}

export function ctpGameConfig(t: TournamentRow, round: TournamentRound): Record<string, unknown> {
  return {
    legacy_tournament_id: t.id,
    legacy_round_id: round.id,
    ctp_holes: resolveCtpHoles(t, round),
  };
}

export function ldGameConfig(t: TournamentRow, round: TournamentRound): Record<string, unknown> {
  const r = t as Record<string, unknown>;
  return {
    legacy_tournament_id: t.id,
    legacy_round_id: round.id,
    track_longest_drive: (r.track_longest_drive ?? r.trackLongestDrive) === true,
    ld_holes: ldHolesOf(round),
    genders: ldGendersOf(t),
  };
}

// ── desired state ───────────────────────────────────────────────────

export type DecisionRow = {
  eventType: string;
  hole: number;
  roundPlayerId: string | null;
  value?: Record<string, unknown> | null;
};

const removeKey = (r: DecisionRow) => `${r.eventType}|${r.hole}|${r.roundPlayerId}`;

/// Same string the app builds (`'$k=${value[k]}'`, keys sorted), so a row
/// the app wrote and a row the website wants compare equal.
export function valueSignature(r: DecisionRow): string {
  if (!r.value) return '';
  return Object.keys(r.value).sort()
    .map((k) => `${k}=${(r.value as Record<string, unknown>)[k] ?? 'null'}`).join(',');
}

export function desiredDecisions(
  t: TournamentRow,
  round: TournamentRound,
  projection: Record<string, unknown>,
): { ctp: DecisionRow[]; ld: DecisionRow[]; unresolved: string[] } {
  const ctp: DecisionRow[] = [];
  const ld: DecisionRow[] = [];
  const unresolved: string[] = [];
  const players = t.players ?? [];
  const rpFor = (stored: string): string | null => {
    const p = resolveCompetitionWinner(players, stored);
    return p ? roundPlayerIdFor(projection, p) : null;
  };

  const r = round as Record<string, unknown>;
  const map = (r.closest_to_pin_by_hole ?? r.closestToPinByHole ?? {}) as Record<string, unknown>;
  const holes = Object.keys(map).map(Number)
    .filter((h) => Number.isInteger(h) && h >= 1).sort((a, b) => a - b);
  for (const hole of holes) {
    const stored = map[String(hole)];
    if (typeof stored !== 'string' || stored.trim().length === 0) continue;
    const rp = rpFor(stored);
    if (rp === null) {
      unresolved.push(`ctp hole ${hole}: "${stored}"`);
      continue;
    }
    ctp.push({ eventType: CTP_WINNER_EVENT, hole, roundPlayerId: rp });
  }

  const knownHole = ldEventHole(ldHolesOf(round));
  const winners: Array<[string, unknown]> = [
    ['male', r.longest_drive_male_id ?? r.longestDriveMaleId],
    ['female', r.longest_drive_female_id ?? r.longestDriveFemaleId],
    ['overall', r.longest_drive_overall_id ?? r.longestDriveOverallId],
  ];
  for (const [gender, stored] of winners) {
    if (typeof stored !== 'string' || stored.trim().length === 0) continue;
    const rp = rpFor(stored);
    if (rp === null) {
      unresolved.push(`ld ${gender}: "${stored}"`);
      continue;
    }
    ld.push({
      eventType: LD_WINNER_EVENT,
      hole: knownHole ?? LD_PLACEHOLDER_HOLE,
      roundPlayerId: rp,
      value: { gender, hole: knownHole },
    });
  }
  return { ctp, ld, unresolved };
}

type ProjectedGame = { id: string; events: DecisionRow[] };

export function gamesByType(projection: Record<string, unknown>): Map<string, ProjectedGame> {
  const out = new Map<string, ProjectedGame>();
  const games = projection.games;
  if (!Array.isArray(games)) return out;
  for (const g of games) {
    if (!g || typeof g !== 'object') continue;
    const row = g as Record<string, unknown>;
    const type = row.type;
    const id = row.game_id;
    if (typeof type !== 'string' || typeof id !== 'string') continue;
    if (type !== CTP_GAME_TYPE && type !== LD_GAME_TYPE) continue;
    if (out.has(type)) continue; // one per round by construction
    const events: DecisionRow[] = [];
    for (const e of Array.isArray(row.events) ? row.events : []) {
      if (!e || typeof e !== 'object') continue;
      const ev = e as Record<string, unknown>;
      if (typeof ev.hole_number !== 'number' || typeof ev.event_type !== 'string') continue;
      events.push({
        eventType: ev.event_type,
        hole: Math.trunc(ev.hole_number),
        roundPlayerId: typeof ev.round_player_id === 'string' ? ev.round_player_id : null,
        value: ev.value && typeof ev.value === 'object'
          ? (ev.value as Record<string, unknown>) : null,
      });
    }
    out.set(type, { id, events });
  }
  return out;
}

/// Diff `existing` against `desired`, grouped by the key
/// `bagpipe_remove_game_event` deletes on. A group that differs in any way
/// is cleared and rewritten; equal groups cost nothing.
async function reconcile(
  call: SpineCall,
  gameId: string,
  existing: DecisionRow[],
  desired: DecisionRow[],
): Promise<[number, number]> {
  const group = (rows: DecisionRow[]) => {
    const m = new Map<string, DecisionRow[]>();
    for (const r of rows) {
      const k = removeKey(r);
      m.set(k, [...(m.get(k) ?? []), r]);
    }
    return m;
  };
  const have = group(existing);
  const want = group(desired);
  let added = 0;
  let removed = 0;
  const gid = encodeURIComponent(gameId);
  for (const key of new Set([...have.keys(), ...want.keys()])) {
    const h = (have.get(key) ?? []).map(valueSignature).sort();
    const w = (want.get(key) ?? []).map(valueSignature).sort();
    if (h.length === w.length && h.every((x, i) => x === w[i])) continue;
    const sample = (have.get(key) ?? want.get(key))![0];
    if (h.length > 0) {
      await call({
        method: 'DELETE',
        path: `/api/spine/games/${gid}/events`,
        body: {
          hole_number: sample.hole,
          event_type: sample.eventType,
          round_player_id: sample.roundPlayerId,
        },
      });
      removed += h.length;
    }
    for (const r of want.get(key) ?? []) {
      await call({
        method: 'POST',
        path: `/api/spine/games/${gid}/events`,
        body: {
          hole_number: r.hole,
          event_type: r.eventType,
          round_player_id: r.roundPlayerId,
          ...(r.value ? { value: r.value } : {}),
        },
      });
      added++;
    }
  }
  return [added, removed];
}

/// Bring one round's decision games on the spine in line with the legacy
/// round: config upserted, winners reconciled. Never throws.
export async function syncRoundDecisions(
  call: SpineCall,
  t: TournamentRow,
  round: TournamentRound,
): Promise<SpineSyncResult> {
  const spineRoundId = spineRoundIdOf(round);
  if (!spineRoundId) return result('noSpineRound');
  try {
    const rid = encodeURIComponent(spineRoundId);
    const projection = await call({ method: 'GET', path: `/api/spine/rounds/${rid}` });
    if (!projection || typeof projection !== 'object') return result('failed', { error: 'no projection' });
    const proj = projection as Record<string, unknown>;
    const desired = desiredDecisions(t, round, proj);
    const games = gamesByType(proj);

    const ctpCfg = ctpGameConfig(t, round);
    const ldCfg = ldGameConfig(t, round);
    const wantCtp = desired.ctp.length > 0
      || (ctpCfg.ctp_holes as number[]).length > 0
      || games.has(CTP_GAME_TYPE);
    const wantLd = desired.ld.length > 0
      || ldCfg.track_longest_drive === true
      || (ldHolesOf(round)?.length ?? 0) > 0
      || games.has(LD_GAME_TYPE);

    const eventId = spineEventIdOf(t);
    let added = 0;
    let removed = 0;
    const one = async (
      type: string, kind: string, config: Record<string, unknown>,
      rows: DecisionRow[], eventType: string,
    ) => {
      const res = await call({
        method: 'POST',
        path: `/api/spine/rounds/${rid}/games`,
        body: {
          type,
          ...(eventId ? { event_id: eventId } : {}),
          unit_value: 0,
          status: 'active',
          config,
          legacy_bet_id: decisionGameKey(spineRoundId, kind),
        },
      }) as Record<string, unknown> | null;
      const gameId = res && typeof res.game_id === 'string' ? res.game_id : null;
      if (!gameId) throw new Error(`no game_id for ${type}`);
      const existing = (games.get(type)?.events ?? []).filter((e) => e.eventType === eventType);
      const [a, r] = await reconcile(call, gameId, existing, rows);
      added += a;
      removed += r;
    };
    if (wantCtp) await one(CTP_GAME_TYPE, 'ctp', ctpCfg, desired.ctp, CTP_WINNER_EVENT);
    if (wantLd) await one(LD_GAME_TYPE, 'longest_drive', ldCfg, desired.ld, LD_WINNER_EVENT);
    return result(wantCtp || wantLd ? 'synced' : 'nothingToWrite', {
      added, removed, unresolved: desired.unresolved,
    });
  } catch (err) {
    return result('failed', { error: err instanceof Error ? err.message : String(err) });
  }
}

// ── pools ───────────────────────────────────────────────────────────

const POOL_KIND_CANON: Record<string, string> = {
  grossSkins: 'gross_skins', netSkins: 'net_skins', superSkins: 'super_skins',
  closestToPin: 'closest_to_pin', longestDrive: 'longest_drive',
  deucesPool: 'deuces_pool', stablefordPool: 'stableford_pool', quotaPool: 'quota_pool',
};

/// `TournamentPool.toJson()` for a stored pool row.
function poolJson(p: Record<string, unknown>): Record<string, unknown> {
  const kind = POOL_KIND_CANON[String(p.kind)] ?? String(p.kind);
  const buyIn = Number(p.buy_in_amount ?? p.buyInAmount ?? 0);
  const out: Record<string, unknown> = { id: p.id, kind };
  if (Number.isFinite(buyIn) && buyIn > 0) out.buy_in_amount = buyIn;
  const dn = p.display_name ?? p.displayName;
  if (typeof dn === 'string' && dn.length > 0) out.display_name = dn;
  const cfg = p.config;
  if (cfg && typeof cfg === 'object' && Object.keys(cfg).length > 0) out.config = cfg;
  return out;
}

/// The `POST /api/spine/events/:id/games` body for one pool. Mirrors
/// `poolGameBody`.
export function poolGameBody(
  t: TournamentRow,
  spineEventId: string,
  pool: Record<string, unknown>,
  status: 'active' | 'removed' = 'active',
): Record<string, unknown> {
  const json = poolJson(pool);
  const kind = json.kind as string;
  const config: Record<string, unknown> = { ...json, legacy_tournament_id: t.id };
  if (kind === 'gross_skins' || kind === 'net_skins') config.scope = 'flight';
  if (kind === 'super_skins') config.scope = 'field';
  if (kind === 'net_skins') config.net = true;
  if (kind === 'gross_skins' || kind === 'super_skins') config.net = false;
  return {
    type: `${POOL_TYPE_PREFIX}${kind}`,
    unit_value: (json.buy_in_amount as number | undefined) ?? 0,
    status,
    config,
    legacy_bet_id: poolGameKey(spineEventId, String(json.id)),
  };
}

/// Write every pool on the tournament as an event-level spine game, and
/// each of `removed` as `status: 'removed'`. Never throws.
export async function syncPools(
  call: SpineCall,
  t: TournamentRow,
  pools: Record<string, unknown>[],
  removed: Record<string, unknown>[] = [],
): Promise<SpineSyncResult> {
  const eventId = spineEventIdOf(t);
  if (!eventId) return result('noSpineRound');
  let written = 0;
  let failed: string | undefined;
  const path = `/api/spine/events/${encodeURIComponent(eventId)}/games`;
  const write = async (p: Record<string, unknown>, status: 'active' | 'removed') => {
    if (typeof p.id !== 'string' || p.id.length === 0) return;
    try {
      await call({ method: 'POST', path, body: poolGameBody(t, eventId, p, status) });
      written++;
    } catch (err) {
      failed = err instanceof Error ? err.message : String(err);
    }
  };
  const live = new Set(pools.map((p) => p.id));
  for (const p of pools) await write(p, 'active');
  for (const p of removed) if (!live.has(p.id)) await write(p, 'removed');
  if (written === 0 && !failed) return result('nothingToWrite');
  return result(failed ? 'failed' : 'synced', { added: written, error: failed });
}
