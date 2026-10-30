// /llms.txt — the site summary for AI assistants (llmstxt.org).
//
// Built from the same data the site renders, never typed: the side-game
// count and the named games come from `sideGames`, the Cup names from
// `CUP_TEMPLATE_LIST`. A static file said "Six-Six-Six" an hour after the
// game was renamed Sixes, and "34" is exactly the kind of number that
// drifted to "30+" on the FAQ. Facts below were checked on 2026-10-07
// against the app and the live site; the pricing line matches /pricing.
//
// ⚠️ "does not hold or transfer money" is true of side-game settlement
// and stays true when host card collection ships (each league is its own
// Stripe merchant — we never hold funds). Re-read this file when
// PAYMENTS_ENABLED goes on.
import { CUP_TEMPLATE_LIST } from './cupTemplates';
import { sideGameBySlug, sideGames } from './sideGames';

/** The games named in the summary, by slug — names come from the library. */
export const LLMS_FEATURED_GAME_SLUGS = [
  'skins', 'nassau', 'wolf', 'vegas', 'stableford', 'hammer',
  'bingo-bango-bongo', 'scotch', 'sixes',
] as const;

export const LLMS_KEY_PAGES: ReadonlyArray<[label: string, path: string]> = [
  ['Side games and rules', '/side-games'],
  ['Buddies trips', '/buddies-trips'],
  ['Tournaments', '/tournaments'],
  ['Leagues', '/leagues'],
  ['Schools', '/leagues/schools'],
  ['Pricing', '/pricing'],
  ['FAQ', '/faq'],
];

const SITE = 'https://bagpipegolf.com';
const APP_STORE = 'https://apps.apple.com/app/id6775045734';

export function buildLlmsTxt(): string {
  const featured = LLMS_FEATURED_GAME_SLUGS.map((slug) => {
    const g = sideGameBySlug(slug);
    if (!g) throw new Error(`llms.txt names a side game that does not exist: ${slug}`);
    return g.name;
  });
  const cups = CUP_TEMPLATE_LIST.map((t) => t.name);

  return `# Bagpipe Golf

> Bagpipe Golf is an iPhone and iPad app for golf side games, scorecards,
> buddies trips, tournaments and leagues. It is made by Taybuta, Inc.
> Free for players; tournaments are free up to 36 players and $170 at 37 or more; leagues are $2,140 a year per league, or $2,970 a year for a club with up to 4 leagues.
> Android is in development.

## What it does
- Smart scorecard with handicap strokes applied automatically
- ${sideGames.length} side games (${featured.join(', ')} and more) with
  hole-by-hole settlement that shows who owes whom
- Buddies-trip Cup templates (${cups.join(', ')}) and custom formats per round
- Tournaments: flights, pairings, shotgun starts, live leaderboards, a
  clubhouse TV display, Calcuttas, sponsors and payouts
- Leagues: weekly RSVPs, substitutes, rotating pairings, standings, flights
  and playoff brackets
- Live spectator view by share code, no account needed
- Bagpipe Schools: a Coach Portal for high school and college teams (pilot)

## Good to know
- Bagpipe calculates settlements; it does not hold or transfer money.
- GHIN handicap sync is not live yet; handicaps are entered manually.

## Pricing
Free for players. Tournaments with a field of up to 36 players are free; a
tournament of 37 or more (a charity day, a member-guest, a company outing)
is $170 per tournament. Leagues are $2,140 per league per
year, paid by card (plus sales tax where it applies), and include every
tournament the league runs. A club plan covers up to 4 leagues, with
unlimited events in each, for $2,970 a year. Leagues that existed before the plan launched
get 12 months free. Every league can start with a 30-day free trial, no card
needed (one per organizer).

## Contact
hello@bagpipegolf.com (general, partnerships, events)
support@bagpipegolf.com (bugs and outages)

## Key pages
${LLMS_KEY_PAGES.map(([label, path]) => `- ${label}: ${SITE}${path}`).join('\n')}
- App Store: ${APP_STORE}
`;
}
