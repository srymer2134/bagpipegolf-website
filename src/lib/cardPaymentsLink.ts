// The card-payments links on My leagues (`/app/leagues`).
//
// Sam, 2026-10-21: "setup card payment links should also exist on My
// Leagues as a smaller How To link". So each league card can carry the
// setup link plus a smaller link to the League Card Payments guide.
//
// Shown ONLY when all three hold — otherwise the link is a dead end:
//   * the viewer OWNS the league (leagues.user_id). The single designated
//     login (F5): a co-director cannot connect the money account, and
//     /app/leagues/[id]/payments redirects anyone else away;
//   * the season is still running (a completed league collects nothing);
//   * the API says THIS league takes payments (paymentsGate). A league not
//     on the allow-list 404s on the payments page, so no link.

export const CARD_PAYMENTS_GUIDE_PATH = '/leagues/card-payments';

export type CardPaymentsLink = {
  href: string;
  label: 'Set up card payments' | 'Card payments';
  guide: string;
};

export function cardPaymentsLink(
  league: { id: string; is_owner: boolean; completed_at: string | null },
  enabled: boolean,
  ready: boolean,
): CardPaymentsLink | null {
  if (!league.is_owner || league.completed_at || !enabled) return null;
  return {
    href: `/app/leagues/${encodeURIComponent(league.id)}/payments`,
    label: ready ? 'Card payments' : 'Set up card payments',
    guide: CARD_PAYMENTS_GUIDE_PATH,
  };
}
