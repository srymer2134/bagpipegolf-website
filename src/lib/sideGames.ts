// ============================================================
// The side-game catalog — one source for the hub and the 32 pages
// ============================================================
// Extracted from `src/pages/side-games.astro` on 2026-09-27 so the hub
// and the per-game pages (`/side-games/<slug>`) cannot describe the same
// game differently. Content is verbatim from the Flutter repo's
// canonical `docs/HOWTO_SIDE_GAMES.md`.
//
// 🚨 Sync rule (same discipline as CLAUDE.md's "bump the catalog count"):
// the authoritative game count is the length of the `GameType` enum in
// `lib/core/models/betting.dart`. It is **32**. If you add a game to the
// app, add it here in the same week or its long-tail search traffic has
// nowhere to land — which is the whole point of GTM R3.
//
// **Lost Balls was missing** when this file was extracted: the hub
// carried 31 of 32 games, so one shipped game had no page and no card.
// Added below. "Bunkers" is the renamed `sandies` enum value (see
// HOWTO_SIDE_GAMES.md "Bunkers (formerly Sandies)"), not a separate
// game — do not "fix" it back to Sandies, the app says Bunkers.

export type Category = 'match-play' | 'points' | 'team' | 'dots';


export interface Game {
  name: string;
  players: string;
  category: Category;
  what: string;
  example?: string;
  needsTracking?: string;
  /** Featured on the "most played" strip inside its category — Skins,
   *  Nassau, Wolf. Every golfer knows these; new visitors anchor here
   *  before scanning the rest of the catalog. */
  featured?: boolean;
}

export const categories: Record<Category, { title: string; blurb: string }> = {
  'match-play': {
    title: 'Match play',
    blurb: 'Score against each other, hole by hole. Skins, Nassau, Wolf and the classics that decide who buys.',
  },
  'points': {
    title: 'Points & Stableford',
    blurb: 'Rack up points, settle by totals. Good rounds get rewarded; blow-up holes hurt less.',
  },
  'team': {
    title: 'Team & partner',
    blurb: '2v2 and rotating-partner formats — best-ball, alternate-shot, and every variation in between.',
  },
  'dots': {
    title: 'Dots & side bets',
    blurb: 'Per-hole events layered on any round: greenies, sandies, snake, arnies, and the rest of the garbage bag.',
  },
};

export const categoryOrder: Category[] = ['match-play', 'points', 'team', 'dots'];

export const games: Game[] = [
  {
    name: 'Aces & Deuces',
    players: '3–4',
    category: 'dots',
    what:
      'On each hole, the low score is the "Ace" and wins a unit from every other player. The high score is the "Deuce" and pays a half-unit to every other player. Ties for low or high wash — no Ace or Deuce that hole.',
    example: 'Par 4, $2 game. A=4, B=5, C=6, D=5. A is Ace (+$6). C is Deuce (−$3).',
  },
  {
    name: 'Arnies',
    players: '2–4',
    category: 'dots',
    what:
      'Make par or better on a hole without ever hitting the fairway off the tee — that\'s an "Arnie" (named for Arnold Palmer, who made pars from anywhere). The Arnie collects one unit from every other player.',
    example: '$5 game, 4 players. B drives into the rough, chips on, one-putts for par. Arnie — B collects $15.',
    needsTracking: 'FIR',
  },
  {
    name: 'Banker',
    players: '3 (exactly)',
    category: 'match-play',
    what:
      'Threesome game. Players rotate as the Banker each hole. The Banker plays head-to-head against each other player; wins and losses pay double the unit. Ties push.',
    example: '$2 game. A is Banker on hole 1: A=4, B=5, C=3. A beats B (+$4), loses to C (−$4). Net $0.',
  },
  {
    name: 'Bingo Bango Bongo',
    players: '2–4',
    category: 'points',
    what:
      'Three points per hole, each worth a unit: Bingo (first on the green), Bango (closest to the pin once everyone is on), Bongo (first to hole out). Settle by total points; differences pay out.',
    example: '$1/point. After 18: A=20, B=16, C=18. A collects $4 from B and $2 from C.',
  },
  {
    name: 'Bloodsome (Reverse Scramble)',
    players: '4 (2v2)',
    category: 'team',
    what:
      'Both teammates tee off; the team plays alternate shots from the WORSE drive (opposite of a scramble). Match play — lowest team score wins the hole.',
    example: 'Hole 7 — Team A\'s drives: 240 yd center vs 180 yd rough. They play from the rough. Strategic and punishing.',
  },
  {
    name: 'Bunkers',
    players: '2–4',
    category: 'dots',
    what:
      'Inverse penalty bet — every hole a player lands in a bunker costs them one unit, paid to each opponent. (The traditional "Sandie" — par save FROM a bunker — is a positive dot in the Dots bag; this bet is the opposite.)',
    needsTracking: 'Bunker toggle',
  },
  {
    name: 'Chairman',
    players: '3–4',
    category: 'match-play',
    what:
      'Whoever wins a hole becomes the Chairman and sets the bet amount for the next hole (1×, 2×, or 3× the base unit). On a tie the Chairman carries over.',
    example: '$5 unit. C wins hole 3, sets hole 4 at 3× ($15). A wins hole 4 at the inflated rate and takes over.',
  },
  {
    name: 'Closeout',
    players: '2–4',
    category: 'match-play',
    what:
      'An 18-hole match for a set amount. When the match is mathematically decided (leader up by more holes than remain), the bet settles and a NEW match starts on the remaining holes for half the original amount. Prevents dead holes.',
    example: '$20 match. A goes 5-up with 4 to play — A wins $20. A new $10 match starts on 15–18.',
  },
  {
    name: 'Defender',
    players: '2–4',
    category: 'dots',
    what:
      'The lowest net score on a hole makes you the Defender. Hold the belt and you collect one unit from every other player on each subsequent hole you win outright. Any tie clears the belt entirely — next outright winner starts fresh.',
    example: '$2 game. B wins hole 1 → Defender. Holes 2–4 nobody beats B → B collects $18. On hole 5 C posts a lower net → new Defender.',
  },
  {
    name: 'Deuces',
    players: '2–4',
    category: 'dots',
    what:
      'Pure pot game. Every player antes at the start. Anyone who scores a 2 on any hole — par-3 birdie or par-4 eagle alike — becomes a winner. Multiple winners split the pot evenly; if nobody makes a two by 18, every ante is refunded.',
    example: '4 players, $2 entry → $8 pot. A makes a 2 on the par-3 3rd; B makes a 2 on the par-3 6th. A and B each net +$4; C and D each −$2.',
  },
  {
    name: 'Dots (Garbage)',
    players: '2–4',
    category: 'dots',
    what:
      'A bag of small side bets. Positive dots: Greenie (closest on a par 3, +1), Sandie (up-and-down from a bunker, +1), Chip-in (+2), Birdie (+1). Negative dots: 3-putt (−1), Double bogey or worse (−1). Tally at end; pay the difference.',
    example: '$1/dot. After 18: A=+8, B=+2, C=−3. A collects $6 from B and $11 from C.',
  },
  {
    name: 'FIRs',
    players: '2–4',
    category: 'dots',
    what:
      'Every fairway hit in regulation earns +1 point. At settlement each opponent pays one unit per hit. Simple, fun, keeps you honest off the tee.',
    needsTracking: 'FIR',
  },
  {
    name: 'GIRs',
    players: '2–4',
    category: 'dots',
    what:
      'Same shape as FIRs — every green in regulation earns +1 point, each opponent pays one unit per hit.',
    needsTracking: 'GIR',
  },
  {
    name: 'Greenies',
    players: '2–4',
    category: 'dots',
    what:
      'Par-3 side bet. On every par 3 the tee shot closest to the pin wins the Greenie — but ONLY if the player then makes par or better. Miss the par and the Greenie is void.',
    example: '$5 Greenies. Hole 7 (par 3): C hits to 8 ft, two-putts for par. C collects $5 from each player. Hole 12: A hits to 4 ft but 3-putts for bogey — no Greenie.',
  },
  {
    name: 'Hammer',
    players: '2–4',
    category: 'match-play',
    what:
      'Match-play with a doubling wrinkle. Any player can call "Hammer" mid-hole to double the stake. The opponent accepts (plays for the doubled value) or concedes at the original value. Accepters can re-hammer to double again.',
    example: '$5 game. Hole 3 worth $5. A hits the fairway, calls Hammer → $10. B accepts, hits a great approach, re-hammers → $20. A accepts or concedes $10.',
  },
  {
    name: 'Low Ball / High Ball',
    players: '4 (2v2)',
    category: 'team',
    what:
      'Two points per hole. One goes to the team with the LOWER individual score. One goes to the team with the LOWER of the two HIGHEST individual scores. Effectively, your best plays their best and your worst plays their worst.',
    example: 'Hole 5 — Team A: 4, 6. Team B: 5, 5. Low ball: A wins (4 vs 5). High ball: B wins (5 vs 6). Split — 1 point each.',
  },
  {
    name: 'Lost Balls',
    players: '2–4',
    category: 'dots',
    what:
      'Track how many balls each player loses per hole. Every lost ball costs one unit, and the pot is split among the ball-savers on that hole — the players who lost none. If everyone loses at least one, the rebate is weighted so whoever lost the fewest still comes out ahead. Zero-sum per hole, so it layers safely on any other game. Lost-ball counts also feed your career stats whether or not the side game is on.',
    example: '$2 unit, 3 players. Hole 7: A loses 2 balls, B and C lose none. Pot = $4. A pays $4; B and C take $2 each.',
    needsTracking: 'FIR/GIR/putts',
  },
  {
    name: 'Match Play',
    players: '2–4',
    category: 'match-play',
    what:
      'Head-to-head. Lowest score wins the hole; ties halve. The match ends when one side leads by more holes than remain (e.g. 4&3). With 4 players, plays as 2-man teams using best ball.',
    example: 'A is 2-up through 16. Hole 17 halves. A wins the match 2&1.',
  },
  {
    name: 'Modified Stableford',
    players: '2–4',
    category: 'points',
    what:
      "Stableford with heavier reward for eagles and a penalty for blow-up holes. Same table the PGA Tour Barracuda Championship uses: eagle +6, birdie +3, par +1, bogey 0, double+ −2. Each player's total runs head-to-head against every other; differences settle at unit value.",
  },
  {
    name: 'Nassau',
    players: '2–4',
    category: 'match-play',
    featured: true,
    what:
      'Three bets in one — front 9, back 9, and overall 18. Each segment is its own match. Ties push. With 4 players, plays as 2-man teams via best ball. Presses (manual or auto) create sub-bets when a team falls two down.',
    example: '$10 Nassau. Team A wins front (+$10), Team B wins back (+$10), Team A wins overall (+$10). Net Team A +$10.',
  },
  {
    name: 'Nines',
    players: '3 (exactly)',
    category: 'points',
    what:
      'Threesome game. Nine points split per hole: 5 to best, 3 to middle, 1 to worst. Tied for best: 4-4-1. Tied for worst: 5-2-2. Three-way tie: 3-3-3. Totals always sum to 162 (9 × 18); settle at unit value per point.',
    example: '$1/point. After 18 holes: A=62, B=50, C=50. A collects $12 from B and $12 from C.',
  },
  {
    name: 'Quota',
    players: '2–4',
    category: 'points',
    what:
      'Each player gets a points quota based on handicap (typically 36 − course HC). Stableford-style points per hole: eagle=4, birdie=3, par=2, bogey=1, double+=0. Beat your quota for a surplus; fall short for a deficit. Pay or collect the difference.',
    example: 'A (HC 10, quota 26) scores 28 pts (+2). B (HC 20, quota 16) scores 19 pts (+3). B beats A by 1 unit.',
  },
  {
    name: 'Rabbits',
    players: '2–4',
    category: 'dots',
    what:
      'Win a hole outright to "catch the Rabbit." Hold it until someone else wins outright (then it\'s set free). Whoever holds the Rabbit at holes 9 and 18 collects from everyone. Two separate Rabbits per round — front and back nine.',
    example: '$5 Rabbit. C wins hole 3 — catches Rabbit. Nobody wins outright through 9 → C collects $5 from each player at the turn.',
  },
  {
    name: 'Round Robin',
    players: '4 (exactly)',
    category: 'match-play',
    what:
      'Foursome rotation. Partners change every 6 holes so everyone plays with everyone once. Holes 1–6: AB vs CD. 7–12: AC vs BD. 13–18: AD vs BC. Each segment is a match-play mini-match settling at unit value.',
  },
  {
    name: 'Scotch (Six-Point)',
    players: '4 (2v2)',
    category: 'team',
    what:
      'Six points per hole across four sub-bets: Low Ball (2), Low Total (2), Proximity (1), Birdie (1). Sweep all six for an "Umbrella" and the hole doubles to 12. Tied sub-bets wash. Net toggle applies to Low Ball + Low Total; Birdie + Proximity stay gross.',
    example: '$5/point. A2 pts, B 1 pt on a par 4 → A wins by 1, pot $5.',
  },
  {
    name: 'Six-Six-Six',
    players: '4 (exactly)',
    category: 'team',
    what:
      'Same partner-rotation pattern as Round Robin; the "six-six-six" name refers to the three 6-hole segments. Best-ball scoring within each segment rather than match play.',
    example: '$5/segment. Set 1: AB beat CD by 2 holes → +$10 each. Rotate partners; repeat for sets 2 and 3.',
  },
  {
    name: 'Skins',
    players: '2–4',
    category: 'match-play',
    featured: true,
    what:
      'Each hole is worth one "skin." The low score on the hole wins it. Ties carry the skin forward, so a late-round outright win can produce a big pot.',
    example: '$5 skins. Holes 1–3 all push. Hole 4 is now worth 4 skins ($20). B wins outright with a birdie — collects $20.',
  },
  {
    name: 'Snake',
    players: '2–4',
    category: 'dots',
    what:
      'A putting side bet that stacks on top of any other game. The first player to 3-putt "gets the Snake." Snake passes to whoever 3-putts next. At round end, whoever holds the Snake pays everyone a unit. Only one payer.',
    example: '$10 Snake, 4 players. A 3-putts hole 4 (gets Snake). C 3-putts hole 11 (Snake passes). Nobody else 3-putts. C pays $30 total.',
    needsTracking: 'Putts',
  },
  {
    name: 'Stableford',
    players: '2–4',
    category: 'points',
    what:
      'Standard points-based scoring that rewards good holes and mutes blow-ups. Per hole: eagle=4, birdie=3, par=2, bogey=1, double+=0. Settle vs the group median so every dollar washes across the field.',
    example: '18-hole totals: A=38, B=34, C=36. At $1/point difference: A collects $4 from B and $2 from C.',
  },
  {
    name: 'Vegas',
    players: '4 (2v2)',
    category: 'team',
    what:
      "Each team combines their two scores into a 2-digit number with the LOWER score first. The team with the lower number wins; difference is units won. Birdie reversal: if one of your scores is a birdie, the OTHER team's number is reversed (high digit first) — punishing big numbers.",
    example: "A: 4, 5 = 45. B: 3, 7 = 37. B wins by 8. If B's 3 was a birdie, A's score flips from 45 to 54 → B wins by 17.",
  },
  {
    name: 'Wolf',
    players: '4 (exactly)',
    category: 'match-play',
    featured: true,
    what:
      'Players rotate as Wolf. The Wolf tees off first and watches each subsequent tee shot. After each shot the Wolf can pick that player as a partner (2v2) or pass. If the Wolf passes everyone, they go Lone Wolf (1v3) for double stakes.',
    example: '$5 game. C is Wolf. A drives okay — C passes. B drives great — C picks B. C+B beat A+D → each collects $5.',
  },
  {
    name: 'Wolf Hammer',
    players: '4 (exactly)',
    category: 'match-play',
    what:
      "Wolf's rotating-partner mechanics with a per-hole doubling wager layered on. On any hole, any player can tap Hammer to double the stake. Taps chain — 2×, 4×, 8× — until scores are entered. Wolf's standard best-ball or Lone Wolf compare determines who wins the multiplied stake.",
    example: '$1/unit. Casey taps Hammer (2×). Sam re-taps (4×). Opponents win → 4-unit swing per player. $16 total on the hole.',
  },
];

/// URL slug for a game. Derived rather than stored so a new game cannot
/// ship without one, with explicit overrides where the derived value
/// would read badly. A slug is a permanent asset — changing one costs
/// the page its accumulated search rank, so treat these as frozen.
const slugOverrides: Record<string, string> = {
  'Aces & Deuces': 'aces-and-deuces',
  'Bloodsome (Reverse Scramble)': 'bloodsome',
  'Dots (Garbage)': 'dots',
  'Scotch (Six-Point)': 'scotch',
  'Low Ball / High Ball': 'low-ball-high-ball',
  'FIRs': 'firs',
  'GIRs': 'girs',
};

export function slugFor(name: string): string {
  const override = slugOverrides[name];
  if (override) return override;
  return name
    .replace(/\([^)]*\)/g, ' ')
    .replace(/&/g, ' and ')
    .replace(/\//g, ' ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/// Every game with its slug attached, and a build-time guarantee that no
/// two games collide. A duplicate slug would silently drop one page from
/// the library rather than erroring, so this throws at build instead.
export const gamesWithSlugs: (Game & { slug: string })[] = (() => {
  const out = games.map((g) => ({ ...g, slug: slugFor(g.name) }));
  const seen = new Map<string, string>();
  for (const g of out) {
    if (!g.slug) throw new Error(`side-games: empty slug for "${g.name}"`);
    const clash = seen.get(g.slug);
    if (clash) {
      throw new Error(
        `side-games: slug "${g.slug}" is claimed by both "${clash}" and ` +
          `"${g.name}" — one page would silently disappear. Add an entry to ` +
          `slugOverrides.`,
      );
    }
    seen.set(g.slug, g.name);
  }
  return out;
})();

export const totalCount = gamesWithSlugs.length;

export function gameBySlug(slug: string): (Game & { slug: string }) | undefined {
  return gamesWithSlugs.find((g) => g.slug === slug);
}
