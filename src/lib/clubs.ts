import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * A club the signed-in user is an active member of.
 *
 * A club is OPTIONAL and most people will never have one — 8 of 10
 * leagues and every tournament on dev belong to no org (2026-11-13).
 * So this is read for one purpose: to decide whether to render club
 * navigation at all. Nobody without a club should see a club-shaped
 * hole in their dashboard, which means "no clubs" has to be knowable
 * cheaply on every page, not discovered on arrival at /app/club.
 */
export type ClubMembership = {
  orgId: string;
  name: string;
  role: 'owner' | 'admin' | string;
  /**
   * The club's public address at /c/<slug>, or null for a club created
   * before 20261218 seeded one (none exist, but the column is nullable
   * so the type says so). Carried here rather than fetched where it is
   * shown: `club_state` does not return it, and middleware already
   * reads this row on every page.
   */
  slug: string | null;
};

type MemberRow = {
  org_id: string;
  role: string | null;
  organizations: { id: string; name: string | null; org_type: string | null; slug: string | null } | null;
};

/**
 * The user's active clubs, newest membership last. Returns [] on any
 * failure: club navigation is an affordance, and a dropped query
 * should hide a menu entry, never break the page it sits on.
 *
 * Reads through RLS as the signed-in user — `org_members` allows
 * `user_id = auth.uid()` and `organizations` allows any active member,
 * so this needs no service role and no Railway hop.
 */
export async function loadClubs(
  supabase: SupabaseClient,
  userId: string,
): Promise<ClubMembership[]> {
  try {
    const { data, error } = await supabase
      .from('org_members')
      .select('org_id, role, organizations!inner(id, name, org_type, slug)')
      .eq('user_id', userId)
      .eq('status', 'active');
    // The embed depends on PostgREST seeing org_members.org_id ->
    // organizations(id) (the FK exists, verified 2026-11-13). If it
    // ever stops resolving, the failure is SILENT — no club nav, no
    // error anywhere — which is the worst shape a bug can take. So
    // fall back to two plain reads rather than trust one syntax.
    if (error) return await loadClubsUnjoined(supabase, userId);
    return ((data ?? []) as unknown as MemberRow[])
      // Only clubs. `organizations` also holds schools and associations,
      // which have their own surfaces and must not borrow this menu.
      .filter((r) => r.organizations?.org_type === 'club')
      .map((r) => ({
        orgId: r.org_id,
        name: r.organizations?.name?.trim() || 'Your club',
        role: (r.role ?? 'admin') as ClubMembership['role'],
        slug: r.organizations?.slug ?? null,
      }));
  } catch {
    return [];
  }
}

/** Two reads instead of an embed. Same answer, no join syntax. */
async function loadClubsUnjoined(
  supabase: SupabaseClient,
  userId: string,
): Promise<ClubMembership[]> {
  try {
    const { data: rows, error } = await supabase
      .from('org_members')
      .select('org_id, role')
      .eq('user_id', userId)
      .eq('status', 'active');
    if (error) return [];
    const ids = ((rows ?? []) as Array<{ org_id: string }>).map((r) => r.org_id);
    if (ids.length === 0) return [];
    const { data: orgs } = await supabase
      .from('organizations')
      .select('id, name, org_type, slug')
      .in('id', ids);
    const byId = new Map(
      ((orgs ?? []) as Array<{ id: string; name: string | null; org_type: string | null; slug: string | null }>)
        .map((o) => [o.id, o]),
    );
    return ((rows ?? []) as Array<{ org_id: string; role: string | null }>)
      .filter((r) => byId.get(r.org_id)?.org_type === 'club')
      .map((r) => ({
        orgId: r.org_id,
        name: byId.get(r.org_id)?.name?.trim() || 'Your club',
        role: (r.role ?? 'admin') as ClubMembership['role'],
        slug: byId.get(r.org_id)?.slug ?? null,
      }));
  } catch {
    return [];
  }
}

/** The club a given league belongs to, or null — the upward link's target. */
export function clubFor(
  clubs: ClubMembership[],
  orgId: string | null | undefined,
): ClubMembership | null {
  if (!orgId) return null;
  return clubs.find((c) => c.orgId === orgId) ?? null;
}

/** Where a club lives. One address, used by every link to it. */
export function clubHref(orgId: string): string {
  return `/app/club/${encodeURIComponent(orgId)}`;
}
