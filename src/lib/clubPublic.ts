/**
 * The public club page at /c/<slug>.
 *
 * Shape of `club_public(slug)` (20261218) — a definer function that
 * decides what a stranger sees. `organizations` stays members-only, so
 * this is the ONLY anonymous read of an org and everything the page
 * shows has to come through here.
 */
export type PublicClubLeague = {
  league_id: string;
  name: string | null;
  join_code: string | null;
};

export type PublicClubEvent = {
  tournament_id: string;
  name: string | null;
  course_name: string | null;
  completed: boolean;
};

export type PublicClub = {
  org_id: string;
  name: string;
  slug: string;
  leagues: PublicClubLeague[];
  events: PublicClubEvent[];
};

/**
 * One address for a club's public page, so a link is never hand-built.
 * `/c/` matches the length of `/l/` and `/t/` — the league and
 * tournament share links this sits beside.
 */
export function clubPublicPath(slug: string): string {
  return `/c/${encodeURIComponent(slug)}`;
}

/**
 * Is this path segment an org id rather than a slug? Links were handed
 * out before slugs existed (the id was the only address a club had),
 * so the page redirects those to the slug instead of 404ing.
 */
export function looksLikeOrgId(segment: string | undefined): boolean {
  return !!segment && /^club_[a-z0-9]+$/i.test(segment);
}

/**
 * The club's public page as something a director can read out, paste
 * into an email, or print on a sign — origin and all.
 *
 * Trailing-slash-free and lower-case, because it gets typed by hand as
 * often as it gets clicked.
 */
export function publicClubUrl(slug: string, origin: string): string {
  return `${origin.replace(/\/+$/, '')}${clubPublicPath(slug)}`;
}
