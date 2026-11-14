import { describe, expect, it } from 'vitest';

import { clubFor, clubHref, loadClubs } from './clubs';

/** Minimal stand-in for the two chained Supabase calls loadClubs makes. */
function fakeSupabase(result: { data?: unknown; error?: unknown } | Error) {
  return {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                eq() {
                  if (result instanceof Error) throw result;
                  return Promise.resolve(result);
                },
              };
            },
          };
        },
      };
    },
  } as never;
}

const clubRow = (over: Record<string, unknown> = {}) => ({
  org_id: 'club_1',
  role: 'owner',
  organizations: { id: 'club_1', name: 'Pine Valley', org_type: 'club' },
  ...over,
});

describe('loadClubs', () => {
  it('returns the clubs a member belongs to', async () => {
    const clubs = await loadClubs(fakeSupabase({ data: [clubRow()] }), 'u1');
    expect(clubs).toEqual([{ orgId: 'club_1', name: 'Pine Valley', role: 'owner' }]);
  });

  it('ignores orgs that are not clubs', async () => {
    // `organizations` also holds schools and associations. Those have
    // their own surfaces and must not borrow the club menu.
    const rows = [
      clubRow(),
      clubRow({ org_id: 'school_1', organizations: { id: 'school_1', name: 'East High', org_type: 'school' } }),
    ];
    const clubs = await loadClubs(fakeSupabase({ data: rows }), 'u1');
    expect(clubs.map((c) => c.orgId)).toEqual(['club_1']);
  });

  it('falls back to a name rather than rendering an empty menu entry', async () => {
    const clubs = await loadClubs(fakeSupabase({ data: [clubRow({ organizations: { id: 'club_1', name: '  ', org_type: 'club' } })] }), 'u1');
    expect(clubs[0].name).toBe('Your club');
  });

  it('returns [] on an error instead of throwing', async () => {
    // Club nav is an affordance: a dropped query hides a menu entry,
    // it never breaks the page the menu sits on.
    expect(await loadClubs(fakeSupabase({ error: { message: 'nope' } }), 'u1')).toEqual([]);
    expect(await loadClubs(fakeSupabase(new Error('offline')), 'u1')).toEqual([]);
    expect(await loadClubs(fakeSupabase({ data: null }), 'u1')).toEqual([]);
  });
});

describe('clubFor', () => {
  const clubs = [{ orgId: 'club_1', name: 'Pine Valley', role: 'owner' }];

  it('is null for a league in no club — the normal case', () => {
    expect(clubFor(clubs, null)).toBeNull();
    expect(clubFor(clubs, undefined)).toBeNull();
    expect(clubFor([], 'club_1')).toBeNull();
  });

  it('matches a league to the club it belongs to', () => {
    expect(clubFor(clubs, 'club_1')?.name).toBe('Pine Valley');
  });

  it("is null for a club the viewer is not in, so no name leaks", () => {
    expect(clubFor(clubs, 'club_someone_else')).toBeNull();
  });
});

describe('clubHref', () => {
  it('is one address, escaped', () => {
    expect(clubHref('club_abc')).toBe('/app/club/club_abc');
    expect(clubHref('club a/b')).toBe('/app/club/club%20a%2Fb');
  });
});

describe('loadClubs when the embed fails', () => {
  it('falls back to two plain reads rather than silently showing no club', () => {
    // The embed's failure mode is invisible: no club nav, no error.
    // The fallback is what stops a PostgREST change from quietly
    // un-shipping this feature.
    const calls: string[] = [];
    const supabase = {
      from(table: string) {
        calls.push(table);
        const embedAttempt = calls.length === 1;
        const rows = embedAttempt
          ? { error: { message: 'could not find a relationship' } }
          : table === 'org_members'
            ? { data: [{ org_id: 'club_1', role: 'admin' }] }
            : { data: [{ id: 'club_1', name: 'Pine Valley', org_type: 'club' }] };
        const thenable = {
          select: () => thenable,
          eq: () => thenable,
          in: () => Promise.resolve(rows),
          then: (res: (v: unknown) => unknown) => Promise.resolve(rows).then(res),
        };
        return thenable;
      },
    } as never;
    return loadClubs(supabase, 'u1').then((clubs) => {
      expect(clubs).toEqual([{ orgId: 'club_1', name: 'Pine Valley', role: 'admin' }]);
      expect(calls).toEqual(['org_members', 'org_members', 'organizations']);
    });
  });
});
