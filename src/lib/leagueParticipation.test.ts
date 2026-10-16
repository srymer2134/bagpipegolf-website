// League owner participation — fairwayiq-flutter
// docs/plans/LEAGUE_OWNER_PARTICIPATION_PLAN.md §2. The route's rules
// (owner-only, role/dues bounds), the D4 prompt, the Pay decision and
// the "people who play" filter on every website roster.
import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  MAX_DUES_CENTS,
  duesChoiceFor,
  isPlayingMember,
  loadOwnMembership,
  memberDuesCents,
  needsParticipationPrompt,
  parseParticipationRequest,
  payDisplayFor,
  payStateFor,
  playingMembers,
  saveOwnParticipation,
} from './leagueParticipation';
import { rosterPayments } from './paymentsRoster';
import { signupDuesStep } from './paymentsSignup';
import { readLeague } from './leaguePublic';
import { withQuery } from './paymentsRoutes';

// ── A fake Supabase client that records every call ──────────────

type Op = { table: string; op: string; payload?: unknown; filters: Array<[string, unknown]> };
type Answer = { data: unknown; error: unknown };

function fakeClient(answer: (op: Op) => Answer) {
  const ops: Op[] = [];
  const client = {
    from(table: string) {
      const cur: Op = { table, op: 'select', filters: [] };
      const q: Record<string, unknown> = {
        select: () => q,
        update: (p: unknown) => { cur.op = 'update'; cur.payload = p; return q; },
        insert: (p: unknown) => {
          cur.op = 'insert'; cur.payload = p; ops.push(cur);
          return Promise.resolve(answer(cur));
        },
        eq: (k: string, v: unknown) => { cur.filters.push([k, v]); return q; },
        maybeSingle: async () => { ops.push(cur); return answer(cur); },
      };
      return q;
    },
  };
  return { client: client as unknown as SupabaseClient, ops };
}

const OWNER = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';

function leagueClient(opts: { owner: string; hasRow: boolean; writeError?: unknown }) {
  return fakeClient((op) => {
    if (op.table === 'leagues') return { data: { id: 'lg1', user_id: opts.owner }, error: null };
    if (op.table === 'profiles') return { data: { display_name: 'Sam R' }, error: null };
    if (op.table === 'league_members' && op.op === 'update') {
      return opts.writeError
        ? { data: null, error: opts.writeError }
        : { data: opts.hasRow ? { user_id: OWNER } : null, error: null };
    }
    if (op.table === 'league_members' && op.op === 'insert') {
      return { data: null, error: opts.writeError ?? null };
    }
    return { data: null, error: null };
  });
}

// ── The request ─────────────────────────────────────────────────

describe('parseParticipationRequest', () => {
  it('accepts player/organizer with null, 0 or a positive integer', () => {
    expect(parseParticipationRequest({ role: 'player', dues_cents: null })).toEqual({ ok: true, value: { role: 'player', dues_cents: null } });
    expect(parseParticipationRequest({ role: 'player' })).toEqual({ ok: true, value: { role: 'player', dues_cents: null } });
    expect(parseParticipationRequest({ role: 'player', dues_cents: 0 })).toEqual({ ok: true, value: { role: 'player', dues_cents: 0 } });
    expect(parseParticipationRequest({ role: 'player', dues_cents: 2500 })).toEqual({ ok: true, value: { role: 'player', dues_cents: 2500 } });
    expect(parseParticipationRequest({ role: 'player', dues_cents: MAX_DUES_CENTS }).ok).toBe(true);
  });

  it('refuses any other role', () => {
    for (const role of ['commissioner', 'owner', 'PLAYER', '', null, undefined, 1]) {
      expect(parseParticipationRequest({ role, dues_cents: null }).ok).toBe(false);
    }
  });

  it('refuses negative, fractional, string, and oversized dues', () => {
    for (const dues_cents of [-1, 12.5, '2500', MAX_DUES_CENTS + 1, NaN, Infinity]) {
      expect(parseParticipationRequest({ role: 'player', dues_cents }).ok).toBe(false);
    }
  });

  it('refuses unexpected fields — no user_id, no status, no amount', () => {
    expect(parseParticipationRequest({ role: 'player', user_id: OTHER }).ok).toBe(false);
    expect(parseParticipationRequest({ role: 'player', status: 'inactive' }).ok).toBe(false);
    expect(parseParticipationRequest({ role: 'player', amount: 0 }).ok).toBe(false);
    expect(parseParticipationRequest(null).ok).toBe(false);
    expect(parseParticipationRequest([]).ok).toBe(false);
  });

  it('an organizer carries no dues override', () => {
    expect(parseParticipationRequest({ role: 'organizer', dues_cents: 2500 })).toEqual({ ok: true, value: { role: 'organizer', dues_cents: null } });
  });
});

// ── The route ───────────────────────────────────────────────────

describe('saveOwnParticipation (POST /api/leagues/[id]/participation)', () => {
  it('a non-owner gets 403 and NOTHING is written', async () => {
    const { client, ops } = leagueClient({ owner: OTHER, hasRow: true });
    const res = await saveOwnParticipation(client, 'lg1', OWNER, { role: 'player', dues_cents: 0 });
    expect(res.status).toBe(403);
    expect(ops.filter((o) => o.table === 'league_members')).toEqual([]);
  });

  it('a bad body is a 400 before any read', async () => {
    const { client, ops } = leagueClient({ owner: OWNER, hasRow: true });
    expect((await saveOwnParticipation(client, 'lg1', OWNER, { role: 'admin' })).status).toBe(400);
    expect((await saveOwnParticipation(client, 'lg1', OWNER, { role: 'player', dues_cents: -5 })).status).toBe(400);
    expect(ops).toEqual([]);
  });

  it('owner with a row: updates ONLY their own row', async () => {
    const { client, ops } = leagueClient({ owner: OWNER, hasRow: true });
    const res = await saveOwnParticipation(client, 'lg1', OWNER, { role: 'player', dues_cents: 2500 });
    expect(res.status).toBe(200);
    const upd = ops.find((o) => o.op === 'update')!;
    expect(upd.payload).toEqual({ role: 'player', status: 'active', dues_cents: 2500 });
    expect(upd.filters).toEqual([['league_id', 'lg1'], ['user_id', OWNER]]);
    expect(ops.some((o) => o.op === 'insert')).toBe(false);
  });

  it('owner with no row (D4): inserts one, named from their profile', async () => {
    const { client, ops } = leagueClient({ owner: OWNER, hasRow: false });
    const res = await saveOwnParticipation(client, 'lg1', OWNER, { role: 'organizer', dues_cents: null });
    expect(res.status).toBe(200);
    expect(ops.find((o) => o.op === 'insert')!.payload).toEqual({
      league_id: 'lg1', user_id: OWNER, display_name: 'Sam R', role: 'organizer', status: 'active', dues_cents: null,
    });
  });

  it('the DB trigger refusing is a 403; the migration missing is a 503', async () => {
    const trig = leagueClient({ owner: OWNER, hasRow: true, writeError: { code: 'P0001', message: 'owner only' } });
    expect((await saveOwnParticipation(trig.client, 'lg1', OWNER, { role: 'player' })).status).toBe(403);
    const missing = leagueClient({ owner: OWNER, hasRow: true, writeError: { code: 'PGRST204', message: "Could not find the 'dues_cents' column" } });
    expect((await saveOwnParticipation(missing.client, 'lg1', OWNER, { role: 'player' })).status).toBe(503);
  });
});

describe('loadOwnMembership', () => {
  it('reports supported:false when dues_cents does not exist yet', async () => {
    const { client } = fakeClient(() => ({ data: null, error: { code: '42703', message: 'column league_members.dues_cents does not exist' } }));
    expect(await loadOwnMembership(client, 'lg1', OWNER)).toEqual({ supported: false, row: null });
  });
  it('returns the row, or null with no row', async () => {
    const row = { user_id: OWNER, role: 'player', status: 'active', dues_cents: null };
    expect(await loadOwnMembership(fakeClient(() => ({ data: row, error: null })).client, 'lg1', OWNER)).toEqual({ supported: true, row });
    expect(await loadOwnMembership(fakeClient(() => ({ data: null, error: null })).client, 'lg1', OWNER)).toEqual({ supported: true, row: null });
  });
});

// ── D4 prompt ───────────────────────────────────────────────────

describe('needsParticipationPrompt', () => {
  it('shows only for the owner, only with no row, only once the backend is live', () => {
    expect(needsParticipationPrompt({ supported: true, isOwner: true, row: null })).toBe(true);
    expect(needsParticipationPrompt({ supported: true, isOwner: true, row: { role: 'player', status: 'active' } })).toBe(false);
    expect(needsParticipationPrompt({ supported: true, isOwner: true, row: { role: 'organizer', status: 'active' } })).toBe(false);
    expect(needsParticipationPrompt({ supported: true, isOwner: false, row: null })).toBe(false);
    expect(needsParticipationPrompt({ supported: false, isOwner: true, row: null })).toBe(false);
  });
});

// ── Pay ─────────────────────────────────────────────────────────

describe('payStateFor / payDisplayFor', () => {
  const player = { role: 'player', status: 'active', dues_cents: null };
  it('a player pays the league amount by default', () => {
    expect(payStateFor({ supported: true, row: player, leagueDuesCents: 5000 })).toEqual({ kind: 'pay', cents: 5000 });
  });
  it('their own override wins', () => {
    expect(payStateFor({ supported: true, row: { ...player, dues_cents: 2500 }, leagueDuesCents: 5000 })).toEqual({ kind: 'pay', cents: 2500 });
    expect(payDisplayFor({ kind: 'pay', cents: 2500 }, '2026-04-15')).toEqual({ amountLabel: '$25 · due Apr 15', nothing: false });
  });
  it('an override of 0 → "Nothing to pay", no button', () => {
    const s = payStateFor({ supported: true, row: { ...player, dues_cents: 0 }, leagueDuesCents: 5000 });
    expect(s).toEqual({ kind: 'nothing' });
    expect(payDisplayFor(s, null)).toEqual({ amountLabel: null, nothing: true });
  });
  it('an ORGANIZER has no Pay section at all', () => {
    const s = payStateFor({ supported: true, row: { role: 'organizer', status: 'active', dues_cents: null }, leagueDuesCents: 5000 });
    expect(s).toEqual({ kind: 'hidden' });
    expect(payDisplayFor(s, null)).toBeNull();
  });
  it('no row (undecided owner) → hidden; inactive → hidden', () => {
    expect(payStateFor({ supported: true, row: null, leagueDuesCents: 5000 }).kind).toBe('hidden');
    expect(payStateFor({ supported: true, row: { ...player, status: 'inactive' }, leagueDuesCents: 5000 }).kind).toBe('hidden');
  });
  it('a league with no dues and no override shows nothing', () => {
    expect(payStateFor({ supported: true, row: player, leagueDuesCents: 0 }).kind).toBe('hidden');
  });
  it('before the backend lands: exactly the old behaviour', () => {
    const s = payStateFor({ supported: false, row: null, leagueDuesCents: 5000 });
    expect(payDisplayFor(s, null)).toEqual({ amountLabel: '$50', nothing: false });
    expect(payDisplayFor(payStateFor({ supported: false, row: null, leagueDuesCents: 0 }), null)).toBeNull();
  });
  it('memberDuesCents is dues_cents ?? league', () => {
    expect(memberDuesCents({ dues_cents: null }, 4500)).toBe(4500);
    expect(memberDuesCents({ dues_cents: 0 }, 4500)).toBe(0);
    expect(memberDuesCents(null, null)).toBeNull();
  });
  it('the Manage "My dues" radio reflects the row', () => {
    expect(duesChoiceFor({ dues_cents: null })).toBe('league');
    expect(duesChoiceFor({ dues_cents: 0 })).toBe('none');
    expect(duesChoiceFor({ dues_cents: 2500 })).toBe('custom');
  });
});

describe('signup season-dues step honours the viewer’s own row', () => {
  const base = {
    mode: 'live' as const,
    payParam: null, slotParam: null, fixture: null, listFixture: null,
    loadDues: async () => ({ duesCents: 5000, duesDueDate: null }),
    listPayments: async () => ({ ok: true as const, status: 200, data: { payments: [] } as never }),
    withQuery,
  };
  it('organizer → no step', async () => {
    expect(await signupDuesStep({ ...base, loadOwn: async () => ({ supported: true, row: { role: 'organizer', status: 'active' } }) })).toBeNull();
  });
  it('$0 override → "Nothing to pay"', async () => {
    const s = await signupDuesStep({ ...base, loadOwn: async () => ({ supported: true, row: { role: 'player', status: 'active', dues_cents: 0 } }) });
    expect(s).toMatchObject({ nothing: true, amountLabel: null });
  });
  it('$25 override → $25', async () => {
    const s = await signupDuesStep({ ...base, loadOwn: async () => ({ supported: true, row: { role: 'player', status: 'active', dues_cents: 2500 } }) });
    expect(s).toMatchObject({ nothing: false, amountLabel: '$25' });
    expect(s!.action).not.toMatch(/amount|cents/i);
  });
});

// ── "People who play" ───────────────────────────────────────────

describe('rosters exclude organizers', () => {
  const members = [
    { user_id: OWNER, display_name: 'Owner Ann', status: 'active', role: 'organizer' },
    { user_id: OTHER, display_name: 'Bob', status: 'active', role: 'player' },
  ];
  it('the dues roster has no line for an organizer', () => {
    const rows = rosterPayments(members, [], 'season_dues');
    expect(rows.map((r) => r.name)).toEqual(['Bob']);
  });
  it('a PLAYING owner is on the dues roster like anyone else', () => {
    const rows = rosterPayments([{ ...members[0], role: 'player' }, members[1]], [], 'season_dues');
    expect(rows.map((r) => r.name)).toEqual(['Bob', 'Owner Ann']);
  });
  it('an organizer who already paid is still visible, off the roster, by name', () => {
    const rows = rosterPayments(members, [{
      id: 'p1', kind: 'season_dues', profile_id: OWNER, status: 'paid', amount_cents: 5000,
    } as never], 'season_dues');
    const ann = rows.find((r) => r.profileId === OWNER)!;
    expect(ann).toMatchObject({ onRoster: false, name: 'Owner Ann (organizer)' });
  });
  it('isPlayingMember / playingMembers', () => {
    expect(isPlayingMember({ role: 'organizer', status: 'active' })).toBe(false);
    expect(isPlayingMember({ role: 'player', status: 'active' })).toBe(true);
    expect(isPlayingMember({ role: 'player', status: 'inactive' })).toBe(false);
    expect(playingMembers(members).map((m) => m.user_id)).toEqual([OTHER]);
  });
  it('the public league page drops an organizer if the payload says so', async () => {
    const client = {
      rpc: async () => ({
        data: { league: {}, members: [
          { display_name: 'Ann', handicap: null, role: 'organizer' },
          { display_name: 'Bob', handicap: 4 },
        ] },
        error: null,
      }),
    } as unknown as SupabaseClient;
    const r = await readLeague(client, 'lg1');
    expect(r.kind === 'ok' && r.league.members.map((m) => m.display_name)).toEqual(['Bob']);
  });
});
