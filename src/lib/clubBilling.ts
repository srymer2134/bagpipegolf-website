import type { Club } from '../components/ClubPanel.astro';

/**
 * What /app/billing should say about a club.
 *
 * WHY THIS PAGE NEEDS TO SAY ANYTHING AT ALL. A club payer's league list can
 * be empty or entirely comped while a live $2,970 subscription sits behind
 * it — `billing.subscriptions` holds a club row with `league_id` NULL, and
 * `billing_get_state` only reads league-scoped rows. So a page titled "Your
 * league subscription" was the whole of billing for someone whose only
 * purchase was a club: it offered them a "Create your league" CTA and told
 * them nothing about the thing they had bought. Meanwhile ClubPanel says
 * "Manage it in Billing →".
 *
 * WHOSE CLUBS APPEAR. Owner-or-payer, and nobody else. An admin on someone
 * else's club has no money in it and should not find it on their billing
 * page; an owner sees theirs even when another admin pays, because knowing
 * that is what stops them buying a second one.
 */
export type ClubBillingState =
  /** A live plan this viewer pays for. */
  | 'yours'
  /** Covered, but someone else in the club is the payer. */
  | 'other-payer'
  /** Covered with no card behind it — a comp. */
  | 'comped'
  /** Theirs to buy, and nothing covers it. */
  | 'unsubscribed';

export type ClubBillingRow = { club: Club; state: ClubBillingState };

export function clubBillingState(club: Club): ClubBillingState {
  if (!club.covered) return 'unsubscribed';
  if (club.plan_payer?.me) return 'yours';
  if (club.plan_payer) return 'other-payer';
  // Covered with no payer named: `club_plan_payer` returns null when the only
  // thing covering the club is a comp.
  return 'comped';
}

/** The clubs this viewer's billing page is responsible for, by name. */
export function clubBillingRows(clubs: Club[]): ClubBillingRow[] {
  return clubs
    .filter((c) => c.role === 'owner' || c.plan_payer?.me === true)
    .map((club) => ({ club, state: clubBillingState(club) }))
    .sort((a, b) => a.club.name.localeCompare(b.club.name));
}

/** The chip's words. */
export function clubBillingChip(state: ClubBillingState): string {
  switch (state) {
    case 'yours':
      return 'Subscribed';
    case 'other-payer':
      return 'Paid by an admin';
    case 'comped':
      return 'No charge';
    case 'unsubscribed':
      return 'Not subscribed';
  }
}

/**
 * The line under the name. Deliberately does not print a renewal date: the
 * club subscription's `current_period_end` is not in any read this page
 * makes, and inventing "renews annually" for a comp would be a lie. The
 * portal shows the real date.
 */
export function clubBillingDetail(row: ClubBillingRow): string {
  const n = row.club.leagues.length;
  const leagues = `${n} ${n === 1 ? 'league' : 'leagues'}`;
  switch (row.state) {
    case 'yours':
      return `Your Club plan — every league in it is covered. ${leagues} attached.`;
    case 'other-payer':
      return `Covered by ${row.club.plan_payer?.display_name?.trim() || 'another admin'}'s Club plan. ${leagues} attached.`;
    case 'comped':
      return `Covered at no charge. ${leagues} attached.`;
    case 'unsubscribed':
      return `No plan yet — each league in it needs its own subscription. ${leagues} attached.`;
  }
}

/** Does any club row mean this viewer is a club customer? */
export function hasClubPlan(rows: ClubBillingRow[]): boolean {
  return rows.some((r) => r.state === 'yours');
}
