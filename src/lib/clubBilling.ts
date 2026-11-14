import type { Club } from '../components/ClubPanel.astro';
import type { BillingClubRow } from './billing';

/**
 * What a club director needs to be told about their plan.
 *
 * TWO READS, JOINED HERE. `club_state(actor)` answers who is in a club and
 * who the payer is, with its own authorisation. `billing_get_state`'s `clubs`
 * key (20261220) answers what the subscription says — the renewal date, and
 * whether it is going to renew at all. Neither knows the other's half, and
 * joining them in SQL would have put an org-membership read inside a billing
 * function. They join on `org_id`, here, where the page needs both.
 *
 * WHY THE DATE IS THE POINT. A club payer's league list can be empty or
 * entirely comped while a live $2,970 subscription sits behind it, because a
 * club row's `league_id` is NULL and no league-shaped read can contain one.
 * The first version of this page said "Subscribed" and nothing else, and sent
 * the director to Stripe to learn their own renewal date — our data access
 * organising their page. $2,970 a year is a number a director budgets around
 * and often reports to a board.
 *
 * WHOSE CLUBS APPEAR. Owner-or-payer, and nobody else. An admin on someone
 * else's club has no money in it and should not find it on their billing
 * page; an owner sees theirs even when another admin pays, because knowing
 * that is what stops them buying a second one.
 */
export type ClubBillingState =
  /** A live plan this viewer pays for, renewing. */
  | 'yours'
  /** Theirs, paid, and set to stop at the end of the term. */
  | 'ending'
  /** Covered, but someone else in the club is the payer. */
  | 'other-payer'
  /** Covered with no card behind it — a comp. */
  | 'comped'
  /** Theirs to buy, and nothing covers it. */
  | 'unsubscribed';

export type ClubBillingRow = {
  club: Club;
  state: ClubBillingState;
  /** The subscription, when the entitlements read had one for this org. */
  plan?: BillingClubRow | null;
};

export function clubBillingState(club: Club, plan?: BillingClubRow | null): ClubBillingState {
  if (!club.covered) return 'unsubscribed';
  if (club.plan_payer?.me) return plan?.cancel_at_period_end ? 'ending' : 'yours';
  if (club.plan_payer) return 'other-payer';
  // Covered with no payer named: `club_plan_payer` returns null when the only
  // thing covering the club is a comp.
  return 'comped';
}

/** The clubs this viewer's billing page is responsible for, by name. */
export function clubBillingRows(clubs: Club[], plans: BillingClubRow[] = []): ClubBillingRow[] {
  const byOrg = new Map(plans.map((p) => [p.org_id, p]));
  return clubs
    .filter((c) => c.role === 'owner' || c.plan_payer?.me === true)
    .map((club) => {
      const plan = byOrg.get(club.org_id) ?? null;
      return { club, state: clubBillingState(club, plan), plan };
    })
    .sort((a, b) => a.club.name.localeCompare(b.club.name));
}

/** The chip's words. */
export function clubBillingChip(state: ClubBillingState): string {
  switch (state) {
    case 'yours':
      return 'Subscribed';
    case 'ending':
      return 'Ending';
    case 'other-payer':
      return 'Paid by an admin';
    case 'comped':
      return 'Covered — no charge';
    case 'unsubscribed':
      return 'Not subscribed';
  }
}

/**
 * A date a director can act on. Year included deliberately: a Club plan runs
 * a year, so "Nov 13" alone is ambiguous in exactly the case that matters.
 * UTC, like every other date on these pages, so the day does not shift by
 * timezone.
 */
export function planDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * The line under the club's name — the renewal answer first, because it is
 * what they came for.
 *
 * Never prints an AMOUNT. We hold `stripe_price_id`, not a figure, and a club
 * bought under a promo may renew at a number no price we hold would name. A
 * confident wrong dollar amount on a billing page is worse than none; the
 * portal has the invoice.
 */
export function clubBillingDetail(row: ClubBillingRow): string {
  const n = row.club.leagues.length;
  const leagues = `${n} ${n === 1 ? 'league' : 'leagues'} attached.`;
  const on = planDate(row.plan?.period_end);
  switch (row.state) {
    case 'yours':
      return on
        ? `Renews ${on}. Every league in the club is covered — ${leagues}`
        : `Every league in the club is covered — ${leagues}`;
    case 'ending':
      // The one state where a director has to act, so say the consequence.
      return on
        ? `Ends ${on}, and the leagues in it lose cover that day. ${leagues}`
        : `Set to end at the end of the term, and the leagues in it lose cover then. ${leagues}`;
    case 'other-payer':
      return `Covered by ${row.club.plan_payer?.display_name?.trim() || 'another admin'}'s Club plan. ${leagues}`;
    case 'comped':
      return on ? `No charge, through ${on}. ${leagues}` : `Covered at no charge. ${leagues}`;
    case 'unsubscribed':
      return `No plan yet — each league in it needs its own subscription. ${leagues}`;
  }
}

/** Does any club row mean this viewer is a club customer? */
export function hasClubPlan(rows: ClubBillingRow[]): boolean {
  return rows.some((r) => r.state === 'yours' || r.state === 'ending');
}

/**
 * The club an unattached league should be offered, or null.
 *
 * WHY THIS EXISTS. A director with a club was still shown "Subscribe ·
 * $2,140" on any league they own that is not in it — on the page they came to
 * in order to check what they had already bought. Their club covers every
 * league they attach, so the honest action is to attach it: free to them, and
 * it makes the club worth more. Selling a second thing they do not need is
 * both worse for them and worse for us.
 *
 * Only a club that is actually COVERED qualifies. Attaching a league to an
 * unpaid club covers nothing, so offering it instead of a subscription would
 * be swapping a real purchase for a no-op.
 */
export function attachTarget(rows: ClubBillingRow[]): Club | null {
  const live = rows.find(
    (r) => (r.state === 'yours' || r.state === 'ending' || r.state === 'comped') && r.club.covered,
  );
  return live?.club ?? null;
}
