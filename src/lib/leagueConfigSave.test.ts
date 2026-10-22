// `POST /api/leagues/[id]/config` — the route behind the Manage page's
// settings form, including its "Season dues" section (the web half of
// the app's League → ☰ → "Set season dues…", Sam 2026-10-22).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { saveLeagueConfig } from './leagueConfigSave';

type Op = { table: string; op: string; cols?: string; payload?: unknown; filters: Array<[string, unknown]> };
type Answer = { data: unknown; error: unknown };

function fakeClient(answer: (op: Op) => Answer) {
  const ops: Op[] = [];
  const client = {
    from(table: string) {
      const cur: Op = { table, op: 'select', filters: [] };
      const q: Record<string, unknown> = {
        select: (cols?: string) => { if (cur.op === 'select') cur.cols = cols; return q; },
        update: (p: unknown) => { cur.op = 'update'; cur.payload = p; return q; },
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

const ROW = {
  user_id: OWNER,
  team_size: 1,
  timezone: 'America/Denver',
  dues_cents: 0,
  dues_due_date: null,
};

function league(opts: { owner?: string; row?: Record<string, unknown>; rlsRows?: boolean; writeError?: unknown } = {}) {
  return fakeClient((op) => {
    if (op.op === 'select') {
      return { data: { ...ROW, ...(opts.row ?? {}), user_id: opts.owner ?? OWNER }, error: null };
    }
    if (opts.writeError) return { data: null, error: opts.writeError };
    return { data: opts.rlsRows === false ? null : { id: 'lg1' }, error: null };
  });
}

const writes = (ops: Op[]) => ops.filter((o) => o.op === 'update');

describe('saveLeagueConfig — season dues', () => {
  it('the owner sets dues and a due date: one UPDATE of exactly those columns', async () => {
    const { client, ops } = league();
    const res = await saveLeagueConfig(client, 'lg1', OWNER, { dues_cents: 5000, dues_due_date: '2027-04-15' });
    expect(res).toEqual({ status: 200, body: { ok: true, changed: ['dues_cents', 'dues_due_date'] } });
    expect(writes(ops)).toHaveLength(1);
    expect(writes(ops)[0].payload).toEqual({ dues_cents: 5000, dues_due_date: '2027-04-15' });
    expect(writes(ops)[0].filters).toEqual([['id', 'lg1']]);
  });

  it('0 clears the amount and a blank date clears the date — the app\'s "no dues"', async () => {
    const { client, ops } = league({ row: { dues_cents: 5000, dues_due_date: '2027-04-15' } });
    const res = await saveLeagueConfig(client, 'lg1', OWNER, { dues_cents: 0, dues_due_date: '' });
    expect(res.status).toBe(200);
    expect(writes(ops)[0].payload).toEqual({ dues_cents: 0, dues_due_date: null });
  });

  it('unchanged dues write nothing', async () => {
    const { client, ops } = league({ row: { dues_cents: 5000 } });
    const res = await saveLeagueConfig(client, 'lg1', OWNER, { dues_cents: 5000 });
    expect(res.body).toMatchObject({ ok: true, changed: [] });
    expect(writes(ops)).toHaveLength(0);
  });

  it.each([
    [{ dues_cents: -100 }, /negative/],
    [{ dues_cents: 45.5 }, /whole number of cents/],
    [{ dues_cents: 1e12 }, /too large/],
    [{ dues_due_date: '2027-02-30' }, /not a real date/],
    [{ dues_due_date: 'next spring' }, /not a real date/],
  ])('refuses %j with a 400 and never writes', async (body, msg) => {
    const { client, ops } = league();
    const res = await saveLeagueConfig(client, 'lg1', OWNER, body);
    expect(res.status).toBe(400);
    expect(String(res.body.error)).toMatch(msg);
    expect(writes(ops)).toHaveLength(0);
  });
});

describe('saveLeagueConfig — owner only', () => {
  it('a non-owner (a co-commissioner included) gets 403 and no UPDATE is sent', async () => {
    const { client, ops } = league({ owner: OWNER });
    const res = await saveLeagueConfig(client, 'lg1', OTHER, { dues_cents: 5000 });
    expect(res).toEqual({ status: 403, body: { error: 'Only the league owner can change these settings.' } });
    expect(writes(ops)).toHaveLength(0);
  });

  it('the owner check reads leagues.user_id on the row it diffs against', async () => {
    const { client, ops } = league();
    await saveLeagueConfig(client, 'lg1', OWNER, { dues_cents: 5000 });
    const read = ops.find((o) => o.op === 'select' && o.table === 'leagues')!;
    expect(read.cols).toMatch(/\buser_id\b/);
    expect(read.filters).toEqual([['id', 'lg1']]);
  });

  it('RLS matching zero rows is still a 403, never a cheerful 200', async () => {
    const { client } = league({ rlsRows: false });
    const res = await saveLeagueConfig(client, 'lg1', OWNER, { dues_cents: 5000 });
    expect(res.status).toBe(403);
  });

  it('a league that is not there is 404', async () => {
    const { client } = fakeClient(() => ({ data: null, error: null }));
    expect((await saveLeagueConfig(client, 'nope', OWNER, { dues_cents: 1 })).status).toBe(404);
  });
});

describe('saveLeagueConfig — request body', () => {
  it.each([null, 'dues', 5000, [{ dues_cents: 1 }]])('%j is a malformed request', async (body) => {
    const { client, ops } = league();
    const res = await saveLeagueConfig(client, 'lg1', OWNER, body);
    expect(res).toEqual({ status: 400, body: { error: 'Malformed request.' } });
    expect(ops).toHaveLength(0);
  });

  it('only generated config columns are read from the body — user_id is never writable', async () => {
    const { client, ops } = league();
    const res = await saveLeagueConfig(client, 'lg1', OWNER, { user_id: OTHER, id: 'x', paid: true });
    expect(res).toEqual({ status: 400, body: { error: 'Nothing to save.' } });
    expect(ops).toHaveLength(0);

    const again = league();
    await saveLeagueConfig(again.client, 'lg1', OWNER, { user_id: OTHER, dues_cents: 2500 });
    expect(writes(again.ops)[0].payload).toEqual({ dues_cents: 2500 });
  });

  it('a CHECK the server did not mirror (23514) is a 400 that says so', async () => {
    const { client } = league({ writeError: { code: '23514', message: 'leagues_dues_cents_chk' } });
    const res = await saveLeagueConfig(client, 'lg1', OWNER, { dues_cents: 100 });
    expect(res.status).toBe(400);
  });
});

describe('the Manage page and the guides point at the web Season dues setting', () => {
  const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

  it('the settings form gives every section a stable anchor (#settings-dues)', () => {
    expect(read('../pages/app/leagues/[id]/manage.astro')).toContain('id={`settings-${g.key}`}');
  });

  it('the payments panel names both places to set dues', () => {
    const src = read('../components/payments/MerchantSetup.astro');
    expect(src).toContain('/manage#settings-dues');
    expect(src).not.toMatch(/set them in the app \(League → menu → Set season dues\)\. Members/);
  });

  it('card-payments step 1 says "App or website" and gives both paths', () => {
    const src = read('../pages/leagues/card-payments.astro');
    const step1 = src.slice(src.indexOf('<!-- 1 -->'), src.indexOf('<!-- 2 -->'));
    expect(step1).toContain('App or website</span>');
    expect(step1).not.toContain('Bagpipe Golf app</span>');
    expect(step1).toContain('Set season dues…');
    expect(step1).toMatch(/<span class="ui">Manage<\/span>.*<span class="ui">Season dues<\/span>/s);
  });
});
