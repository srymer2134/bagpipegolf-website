import { callRailway } from './railway';
import { supabaseFor, type RouteCtx } from './paymentsRoutes';
import type { Club } from '../components/ClubPanel.astro';

export type ClubPageData = {
  clubs: Club[];
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

  return { clubs, attachable, loadFailed };
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
