// ============================================================
// Website -> spine dual-write for tournament competitions
// ============================================================
// Mirrors the flutter repo's `test/spine/spine_tournament_competitions_test.dart`:
// an in-memory fake of the Railway spine routes, and the same
// behaviours — one row per decision, reconcile not toggle, identity by
// round_player_id and never guessed, gender + hole on LD rows, pools as
// event-level games, and every gate.

import { describe, expect, it } from 'vitest';

import {
  CTP_GAME_TYPE,
  LD_GAME_TYPE,
  classifyPlayerId,
  ldEventHole,
  poolGameBody,
  syncPools,
  syncRoundDecisions,
  type SpineCall,
} from './spineCompetitions';
import type { TournamentRow } from './tournamentQueries';

const PROFILE = '11111111-2222-3333-4444-555555555555';
const SPINE_ROUND = 'aaaaaaaa-0000-0000-0000-000000000001';
const SPINE_EVENT = 'eeeeeeee-0000-0000-0000-000000000001';

type Ev = { hole_number: number; event_type: string; round_player_id: string | null; value?: unknown };
type Game = { game_id: string; type: string; legacy_bet_id: string; config: unknown; events: Ev[]; round_id: string | null; status?: string; unit_value?: unknown };

function fakeSpine(opts: { forbidWrites?: boolean } = {}) {
  const games = new Map<string, Game>(); // by legacy key
  const calls: Array<{ method: string; path: string; body?: unknown }> = [];
  const players = [
    { round_player_id: 'rp_casey', profile_id: PROFILE, guest_name: null },
    { round_player_id: 'rp_jo', profile_id: null, guest_name: 'Jo Park' },
    { round_player_id: 'rp_alex', profile_id: null, guest_name: 'Alex Moore' },
  ];
  let n = 0;
  const call: SpineCall = async ({ method, path, body }) => {
    calls.push({ method, path, body });
    const b = (body ?? {}) as Record<string, unknown>;
    let m = /^\/api\/spine\/rounds\/([^/]+)$/.exec(path);
    if (m && method === 'GET') {
      return {
        round_id: m[1], players,
        games: [...games.values()].filter((g) => g.round_id === m![1]),
      };
    }
    if (opts.forbidWrites) throw new Error('403 not a participant');
    m = /^\/api\/spine\/rounds\/([^/]+)\/games$/.exec(path);
    if (m && method === 'POST') {
      const key = String(b.legacy_bet_id);
      const g = games.get(key) ?? { game_id: `g${++n}`, events: [], round_id: m[1] } as Game;
      Object.assign(g, { type: b.type, legacy_bet_id: key, config: b.config });
      games.set(key, g);
      return { game_id: g.game_id };
    }
    m = /^\/api\/spine\/events\/([^/]+)\/games$/.exec(path);
    if (m && method === 'POST') {
      const key = String(b.legacy_bet_id);
      const g = games.get(key) ?? { game_id: `g${++n}`, events: [], round_id: null } as Game;
      Object.assign(g, { type: b.type, legacy_bet_id: key, config: b.config,
        status: b.status, unit_value: b.unit_value });
      games.set(key, g);
      return { game_id: g.game_id };
    }
    m = /^\/api\/spine\/games\/([^/]+)\/events$/.exec(path);
    if (m) {
      const g = [...games.values()].find((x) => x.game_id === m![1])!;
      if (method === 'POST') {
        g.events.push({ hole_number: b.hole_number as number, event_type: String(b.event_type),
          round_player_id: (b.round_player_id as string) ?? null,
          ...(b.value ? { value: b.value } : {}) });
        return { ok: true };
      }
      g.events = g.events.filter((e) => !(e.hole_number === b.hole_number
        && e.event_type === b.event_type && e.round_player_id === b.round_player_id));
      return { ok: true };
    }
    throw new Error(`unexpected ${method} ${path}`);
  };
  return { call, calls, games };
}

const tourney = (round: Record<string, unknown>, extra: Record<string, unknown> = {}): TournamentRow => ({
  id: 't1', user_id: 'u1', name: 'T', course_name: null, total_holes: 18, par_total: 72,
  created_at: null, updated_at: null, completed_at: null,
  players: [
    { id: `p_${PROFILE}`, name: 'Casey Kline', userId: PROFILE },
    { id: 'p_t1_1', name: 'Jo Park' },
    { id: 'p_t1_2', name: 'Alex Moore' },
    { id: 'p_me', name: 'Me' },
  ],
  tee_boxes: [],
  rounds: [{ id: 'r1', name: 'R1', format: 'stroke_play', spine_round_id: SPINE_ROUND, ...round }],
  track_ctp_on_par3s: false,
  ...extra,
} as unknown as TournamentRow);

const r0 = (t: TournamentRow) => t.rounds[0];
const ctpGame = (f: ReturnType<typeof fakeSpine>) =>
  f.games.get(`tcomp:${SPINE_ROUND}:ctp`);
const ldGame = (f: ReturnType<typeof fakeSpine>) =>
  f.games.get(`tcomp:${SPINE_ROUND}:longest_drive`);

describe('CTP winner -> one ctp_winner row', () => {
  it("set (a picker id) -> one row on the round's tournament_ctp game", async () => {
    const f = fakeSpine();
    const t = tourney({ ctp_holes: [7], closest_to_pin_by_hole: { 7: `p_${PROFILE}` } });
    const res = await syncRoundDecisions(f.call, t, r0(t));
    expect(res.outcome).toBe('synced');
    const g = ctpGame(f)!;
    expect(g.type).toBe(CTP_GAME_TYPE);
    expect(g.events).toEqual([{ hole_number: 7, event_type: 'ctp_winner', round_player_id: 'rp_casey' }]);
    expect(g.config).toEqual({ legacy_tournament_id: 't1', legacy_round_id: 'r1', ctp_holes: [7] });
  });

  it('change leaves exactly one row, for the new winner', async () => {
    const f = fakeSpine();
    const t1 = tourney({ ctp_holes: [7], closest_to_pin_by_hole: { 7: `p_${PROFILE}` } });
    await syncRoundDecisions(f.call, t1, r0(t1));
    const t2 = tourney({ ctp_holes: [7], closest_to_pin_by_hole: { 7: 'p_t1_1' } });
    await syncRoundDecisions(f.call, t2, r0(t2));
    expect(ctpGame(f)!.events.map((e) => e.round_player_id)).toEqual(['rp_jo']);
  });

  it('clear leaves no row; other holes untouched', async () => {
    const f = fakeSpine();
    const t1 = tourney({ ctp_holes: [3, 7], closest_to_pin_by_hole: { 3: 'p_t1_1', 7: 'p_t1_2' } });
    await syncRoundDecisions(f.call, t1, r0(t1));
    const t2 = tourney({ ctp_holes: [3, 7], closest_to_pin_by_hole: { 7: 'p_t1_2' } });
    await syncRoundDecisions(f.call, t2, r0(t2));
    expect(ctpGame(f)!.events).toEqual([{ hole_number: 7, event_type: 'ctp_winner', round_player_id: 'rp_alex' }]);
  });

  it('syncing twice mints one game and duplicates nothing', async () => {
    const f = fakeSpine();
    const t = tourney({ ctp_holes: [7], closest_to_pin_by_hole: { 7: 'p_t1_1' } });
    await syncRoundDecisions(f.call, t, r0(t));
    const before = f.calls.length;
    const res = await syncRoundDecisions(f.call, t, r0(t));
    expect(res.added).toBe(0);
    expect(res.removed).toBe(0);
    expect(ctpGame(f)!.events).toHaveLength(1);
    // Second run: one read + one config upsert, no event writes.
    expect(f.calls.slice(before).map((c) => c.method)).toEqual(['GET', 'POST']);
  });

  it('pre-existing duplicate rows collapse to one', async () => {
    const f = fakeSpine();
    const t = tourney({ ctp_holes: [7], closest_to_pin_by_hole: { 7: 'p_t1_1' } });
    await syncRoundDecisions(f.call, t, r0(t));
    ctpGame(f)!.events.push({ ...ctpGame(f)!.events[0] });
    await syncRoundDecisions(f.call, t, r0(t));
    expect(ctpGame(f)!.events).toHaveLength(1);
  });

  it('no CTP configured and none decided -> no game minted', async () => {
    const f = fakeSpine();
    const t = tourney({});
    const res = await syncRoundDecisions(f.call, t, r0(t));
    expect(res.outcome).toBe('nothingToWrite');
    expect(f.games.size).toBe(0);
  });
});

describe('identity — round_player_id, never a p_ id; never guessed', () => {
  it('a free-text name resolves to the one roster player with that name', async () => {
    const f = fakeSpine();
    const t = tourney({ ctp_holes: [7], closest_to_pin_by_hole: { 7: '  jo park ' } });
    await syncRoundDecisions(f.call, t, r0(t));
    expect(ctpGame(f)!.events[0].round_player_id).toBe('rp_jo');
  });

  it('unknown text and p_me are unresolved — no row', async () => {
    const f = fakeSpine();
    const t = tourney({ ctp_holes: [3, 7], closest_to_pin_by_hole: { 3: 'Guest Bob', 7: 'p_me' } });
    const res = await syncRoundDecisions(f.call, t, r0(t));
    expect(ctpGame(f)!.events).toEqual([]);
    expect(res.unresolved).toHaveLength(2);
  });

  it('never calls /players (it would null a team)', async () => {
    const f = fakeSpine();
    const t = tourney({ ctp_holes: [7], closest_to_pin_by_hole: { 7: 'p_t1_1' } });
    await syncRoundDecisions(f.call, t, r0(t));
    expect(f.calls.some((c) => c.path.endsWith('/players'))).toBe(false);
  });

  it('classifies ids like TournamentPlayerIdClassifier', () => {
    expect(classifyPlayerId(`p_${PROFILE}`)).toEqual({ migratable: true, profileId: PROFILE });
    expect(classifyPlayerId('p_me').migratable).toBe(false);
    expect(classifyPlayerId('p_sample_1').migratable).toBe(false);
    expect(classifyPlayerId('p_t1_0')).toEqual({ migratable: true, profileId: null });
  });
});

describe('Longest Drive -> longest_drive_winner with gender + hole', () => {
  it("men's and women's are independent rows carrying their gender", async () => {
    const f = fakeSpine();
    const t = tourney({ longest_drive_holes: [16], longest_drive_male_id: `p_${PROFILE}`,
      longest_drive_female_id: 'p_t1_1' }, { track_longest_drive: true,
      field_gender: 'mixed', longest_drive_genders: ['male', 'female'] });
    await syncRoundDecisions(f.call, t, r0(t));
    const g = ldGame(f)!;
    expect(g.type).toBe(LD_GAME_TYPE);
    expect(g.events).toEqual([
      { hole_number: 16, event_type: 'longest_drive_winner', round_player_id: 'rp_casey',
        value: { gender: 'male', hole: 16 } },
      { hole_number: 16, event_type: 'longest_drive_winner', round_player_id: 'rp_jo',
        value: { gender: 'female', hole: 16 } },
    ]);
    expect(g.config).toEqual({ legacy_tournament_id: 't1', legacy_round_id: 'r1',
      track_longest_drive: true, ld_holes: [16], genders: ['female', 'male'] });
  });

  it('no configured LD hole -> placeholder hole 1 with value.hole null', async () => {
    const f = fakeSpine();
    const t = tourney({ longest_drive_male_id: 'p_t1_2' }, { track_longest_drive: true });
    await syncRoundDecisions(f.call, t, r0(t));
    expect(ldGame(f)!.events[0]).toMatchObject({ hole_number: 1, value: { gender: 'male', hole: null } });
  });

  it('the event hole is the LD hole only when the round names exactly one', () => {
    expect(ldEventHole([16])).toBe(16);
    expect(ldEventHole([4, 16])).toBeNull();
    expect(ldEventHole(null)).toBeNull();
  });

  it("the same player moved from Men's to Women's is rewritten", async () => {
    const f = fakeSpine();
    const a = tourney({ longest_drive_male_id: 'p_t1_1' }, { track_longest_drive: true });
    await syncRoundDecisions(f.call, a, r0(a));
    const b = tourney({ longest_drive_female_id: 'p_t1_1' }, { track_longest_drive: true });
    await syncRoundDecisions(f.call, b, r0(b));
    expect(ldGame(f)!.events.map((e) => (e.value as { gender: string }).gender)).toEqual(['female']);
  });
});

describe('gates', () => {
  it('unbridged round -> no-op, no call', async () => {
    const f = fakeSpine();
    const t = tourney({ spine_round_id: undefined, ctp_holes: [7],
      closest_to_pin_by_hole: { 7: 'p_t1_1' } });
    const res = await syncRoundDecisions(f.call, t, r0(t));
    expect(res.outcome).toBe('noSpineRound');
    expect(f.calls).toEqual([]);
  });

  it('a refused write is swallowed, never thrown', async () => {
    const f = fakeSpine({ forbidWrites: true });
    const t = tourney({ ctp_holes: [7], closest_to_pin_by_hole: { 7: 'p_t1_1' } });
    const res = await syncRoundDecisions(f.call, t, r0(t));
    expect(res.outcome).toBe('failed');
    expect(res.error).toMatch(/403/);
  });
});

describe('pools -> event-level games (config only; results derived)', () => {
  const pools = [
    { id: 'legacy_gross_skins', kind: 'gross_skins', buy_in_amount: 20 },
    { id: 'legacy_super_skins', kind: 'super_skins' },
    { id: 'pool_x', kind: 'greenies', display_name: 'Greenies', buy_in_amount: 5 },
  ];

  it('one row per pool: namespaced type, buy-in as unit_value, key bound to the event', async () => {
    const f = fakeSpine();
    const t = tourney({}, { spine_event_id: SPINE_EVENT, pools });
    const res = await syncPools(f.call, t, pools);
    expect(res.outcome).toBe('synced');
    const g = f.games.get(`tpool:${SPINE_EVENT}:legacy_gross_skins`)!;
    expect(g).toMatchObject({ type: 'tournament_pool_gross_skins', unit_value: 20,
      status: 'active', round_id: null });
    expect(g.config).toEqual({ id: 'legacy_gross_skins', kind: 'gross_skins',
      buy_in_amount: 20, legacy_tournament_id: 't1', scope: 'flight', net: false });
    expect(f.games.get(`tpool:${SPINE_EVENT}:legacy_super_skins`)!.config)
      .toMatchObject({ scope: 'field', net: false });
  });

  it('a removed pool becomes status removed (same row)', async () => {
    const f = fakeSpine();
    const t = tourney({}, { spine_event_id: SPINE_EVENT });
    await syncPools(f.call, t, pools);
    await syncPools(f.call, t, pools.slice(1), [pools[0]]);
    expect(f.games.get(`tpool:${SPINE_EVENT}:legacy_gross_skins`)!.status).toBe('removed');
  });

  it('no spine event -> no call', async () => {
    const f = fakeSpine();
    const res = await syncPools(f.call, tourney({}), pools);
    expect(res.outcome).toBe('noSpineRound');
    expect(f.calls).toEqual([]);
  });

  it('net skins carries net: true', () => {
    const body = poolGameBody(tourney({}), SPINE_EVENT, { id: 'n', kind: 'netSkins' });
    expect(body.type).toBe('tournament_pool_net_skins');
    expect(body.config).toMatchObject({ net: true, scope: 'flight' });
    expect(body.unit_value).toBe(0);
  });
});
