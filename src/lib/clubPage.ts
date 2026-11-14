import { callRailway } from './railway';
import { supabaseFor, type RouteCtx } from './paymentsRoutes';
import type { Club } from '../components/ClubPanel.astro';
import type { BillingClubRow, BillingListResponse } from './billing';

export type ClubPageData = {
  clubs: Club[];
  /**
   * Each club's subscription, by org_id — the renewal date and whether it is
   * going to renew. `club_state` does not know this; `billing_get_state`'s
   * `clubs` key does (flutter 20261220). Carried here so the club page can
   * answer "when am I charged again" where the director already is, instead
   * of sending them to a page titled "Your league subscription" to find out.
   *
   * Empty when the API has not deployed the key yet, or when the read fails.
   * The plan line then renders exactly as it did before, without a date.
   */
  plans: Map<string, BillingClubRow>;
  /** The viewer's leagues in no club yet — what "Attach my league" offers. */
  attachable: Array<{ id: string; name: string | null }>;
  loadFailed: boolean;
};

/**
 * Everything both club surfaces need: /app/club (the list) and
 * /app/club/<id> (one club). Shared so the two pages cannot drift into
 * disagreeing about who is an admin or which leagues are attachable.
 *
 * Clubs come from the API, which authorises as the signed-in user.
 * Attachable leagues come straight from Supabase under RLS — a league
 * with no `org_id` that this user owns. That nullable column is the
 * whole point: a league exists happily without a club, and attaching
 * is a later, reversible decision rather than a setup step.
 */
export async function loadClubPage(astro: {
  request: Request;
  cookies: unknown;
  locals: unknown;
  url: URL;
}): Promise<ClubPageData> {
  let clubs: Club[] = [];
  let loadFailed = false;
  try {
    clubs =
      (await callRailway<{ clubs: Club[] }>(astro as never, { method: 'GET', path: '/api/clubs' }))
        .clubs ?? [];
  } catch {
    loadFailed = true;
  }

  // Billing is a second, independent read: a club page must not break
  // because the subscription read did. Only asked for when there is a club.
  const plans = new Map<string, BillingClubRow>();
  if (clubs.length > 0) {
    try {
      const state = await callRailway<BillingListResponse>(astro as never, {
        method: 'GET',
        path: '/api/billing/entitlements',
      });
      for (const row of state.clubs ?? []) plans.set(row.org_id, row);
    } catch {
      // No date shown. The page, and every control on it, still works.
    }
  }

  let attachable: ClubPageData['attachable'] = [];
  try {
    const userId = (astro.locals as { user?: { id?: string } }).user?.id;
    if (userId) {
      const { data } = await supabaseFor(astro as unknown as RouteCtx)
        .from('leagues')
        .select('id, name, org_id')
        .eq('user_id', userId)
        .is('completed_at', null)
        .order('created_at', { ascending: false });
      attachable = ((data ?? []) as Array<{ id: string; name: string | null; org_id: string | null }>)
        .filter((l) => !l.org_id)
        .map(({ id, name }) => ({ id, name }));
    }
  } catch {
    // A failed league read costs the "Attach" control, not the page.
  }

  return { clubs, plans, attachable, loadFailed };
}

/**
 * The three things a brand-new club owner has to do, in order. Shown
 * after checkout (`?welcome=1`) because a buyer who has just spent
 * $2,970 deserves a next step, not an empty management form — and
 * because before this they could not find their way back here at all.
 */
export function welcomeSteps(club: Club): Array<{ text: string; done: boolean }> {
  return [
    { text: 'Name your club', done: Boolean(club.name?.trim()) },
    { text: 'Attach a league', done: club.leagues.length > 0 },
    { text: 'Invite your admins', done: club.members.length > 1 || club.invites.length > 0 },
  ];
}
