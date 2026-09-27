// Side-game page library — one page per game at /side-games/<slug>.
//
// GTM_STRATEGY §4.6: the single organic asset that serves every pillar.
// Someone searching "wolf golf game rules" is mid-argument on a tee box —
// maximal intent, near-zero competition — and the page keeps compounding
// after paid spend stops. First eight (highest volume) here; the rest of
// the 32-game catalog follows from the same template once GTM decision R3
// is confirmed.
//
// Rules text is the app's rules. Source of truth for the math is
// fairwayiq-flutter `BETTING.md` + `docs/HOWTO_SIDE_GAMES.md`; where the
// two differ on a detail the engine wins, and the page says what the
// engine does. Vocabulary: "side game", never "side bet".

export type SideGameFaq = { q: string; a: string };

export type SideGame = {
  slug: string;
  name: string;
  /** Short alternate names people search for. */
  aka?: string[];
  players: string;
  /** One-sentence hook for the card + meta description. */
  summary: string;
  /** Ordered rules, plain language. */
  rules: string[];
  /** A worked money example, exactly as the app would settle it. */
  example: { setup: string; play: string[]; result: string };
  /** Common variations and house rules, with what the app supports. */
  variations?: string[];
  /** What the scorekeeper actually taps in Bagpipe Golf. */
  inApp: string[];
  /** Tracking the app needs turned on, if any. */
  needsTracking?: string;
  faq: SideGameFaq[];
  related: string[];
};

export const sideGames: SideGame[] = [
  {
    slug: 'wolf',
    name: 'Wolf',
    aka: ['Wolf golf game', 'Lone Wolf'],
    players: '4 (exactly)',
    summary:
      'The foursome game where one player is the Wolf each hole, picks a partner after watching the tee shots, or goes it alone against all three for double stakes.',
    rules: [
      'Set a Wolf order on the first tee. Players rotate as the Wolf in that order; the Wolf tees off first on their hole.',
      'The Wolf watches each opponent tee off in turn. After any tee shot the Wolf can claim that player as a partner for the hole. Once passed, a player cannot be picked later.',
      'If the Wolf passes on all three, they play the hole alone as the Lone Wolf, one against three, for double stakes. Win and the Wolf collects two units from each of the other three; lose and the Wolf pays two units to each. The Lone Wolf has to win the hole outright: a tie with the best opponent ball counts as a loss.',
      'Partners play best ball against the other two. Lowest net score for each side decides the hole; ties push.',
      'Money settles hole by hole. In a 2v2 hole each loser pays one unit and each winner collects one unit, and a tie pushes. On a Lone Wolf hole the Wolf collects two units from each opponent, or pays two units to each, and a tie goes against the Wolf. Going alone means three doubled bets instead of one shared bet, so the swing is six units against two.',
    ],
    example: {
      setup: '$5 per unit. Casey is the Wolf on hole 7.',
      play: [
        'Sam drives into the rough. Casey passes.',
        'Patrick stripes one. Casey picks Patrick. It is Casey and Patrick against Sam and Tim.',
        'Nets on the hole: Casey 4, Patrick 5, Sam 5, Tim 6. Best ball: 4 versus 5.',
      ],
      result:
        'Casey and Patrick win the hole. Sam and Tim each pay $5; Casey and Patrick each collect $5. Had Casey gone Lone Wolf and won, Casey would collect $10 from each of the other three, +$30; had Casey tied the best of them, Casey pays $10 to each, −$30. Zero-sum either way.',
    },
    variations: [
      'Single stakes for going alone: some groups pay a Lone Wolf hole at one unit per player instead of two. Bagpipe pays double; if your group plays single, agree the difference off-app.',
      'Lone Wolf ties push: some groups let a tied Lone Wolf hole push or carry. Bagpipe scores a tie as a loss for the Wolf.',
      'Blind Wolf: the Wolf declares Lone Wolf before anyone tees off, usually for triple. Not in the app; play it as a Lone Wolf hole and settle the extra by hand.',
      'Wolf Hammer: the same game with a per-hole doubling tap. Bagpipe ships it as its own game, "Wolf Hammer".',
      'Some groups let the Wolf pick the last player to tee off only by default. The app lets the Wolf pick or pass after each shot.',
    ],
    inApp: [
      'Add Wolf as a side game when you set up the round. It needs exactly four players.',
      'The app asks for the Wolf order on the first tee and rotates it for you.',
      'On each hole the scorekeeper taps who the Wolf picked, or Lone Wolf. Enter scores as usual; the money updates as soon as all four have scored.',
    ],
    faq: [
      {
        q: 'How many players does Wolf need?',
        a: 'Exactly four. With three or five the rotation and the 2v2 math break, which is why the app will not let you add it to a group of another size.',
      },
      {
        q: 'What happens on a tie in Wolf?',
        a: 'On a paired hole it pushes and no money moves. On a Lone Wolf hole a tie is a loss for the Wolf, who pays the doubled stake to each opponent. Some groups carry tied holes forward like skins; the app does not.',
      },
      {
        q: 'Does the Wolf have to pick before the last tee shot?',
        a: 'The Wolf can pick after any shot, including the last one. Passing on the last player is what makes them the Lone Wolf.',
      },
    ],
    related: ['skins', 'nassau', 'match-play'],
  },
  {
    slug: 'nassau',
    name: 'Nassau',
    aka: ['2-2-2', '5-5-5', 'front-back-total'],
    players: '2–4',
    summary:
      'Three matches in one round: the front nine, the back nine, and the full eighteen, each its own bet. The most played side game in golf.',
    rules: [
      'Agree one unit, say $10. The front nine, the back nine, and the overall eighteen are each a separate match worth that unit.',
      'Each segment is match play: lowest net score wins the hole, ties halve. Whoever is up at the end of the segment wins it; a tied segment pushes.',
      'With four players you play as two-person teams using best ball on every hole.',
      'A press starts a new bet for the rest of the segment when a side falls behind, usually two down. The pressed bet is worth the same unit and runs alongside the original.',
      'Settle each segment and each press separately, then net it out. Every match is zero-sum.',
    ],
    example: {
      setup: '$10 Nassau, two-person teams.',
      play: [
        'Team A wins the front nine 2-up: +$10 to A.',
        'Team B wins the back nine 1-up: +$10 to B.',
        'Team A wins the overall 1-up: +$10 to A.',
      ],
      result: 'Team A is +$10 net, Team B −$10. Each player on A collects $10 from their opposite number.',
    },
    variations: [
      'Auto press: a press fires automatically whenever a side goes two down. The app supports Off, Manual, and Auto.',
      'Presses on presses: allowed by most groups. The app tracks each press as its own match from its starting hole.',
      'Some groups pay the overall double. Set a different unit for it by hand at settlement.',
    ],
    inApp: [
      'Add Nassau when setting up the round and choose the press rule: Off, Manual, or Auto at two down.',
      'For four players the app pairs teams; you can edit them before the first tee.',
      'Live scoring shows all three segments and every press with their running state. Settlement lists each one and nets the total.',
    ],
    faq: [
      {
        q: 'What does "2-2-2 Nassau" mean?',
        a: 'Two dollars on the front, two on the back, two on the overall. "5-5-5" is the same with a $5 unit. The numbers are just the unit per segment.',
      },
      {
        q: 'When should you press?',
        a: 'Convention is when you are two down in a segment. A press is a fresh bet from that hole to the end of the segment, so it is a chance to get back to even without touching the original match.',
      },
      {
        q: 'Is Nassau net or gross?',
        a: 'Either. Most groups play net using course handicap strokes by hole. The app applies strokes automatically from each player\'s handicap and the course stroke index.',
      },
    ],
    related: ['match-play', 'skins', 'wolf'],
  },
  {
    slug: 'skins',
    name: 'Skins',
    aka: ['Skins game', 'carryover skins'],
    players: '2–4',
    summary:
      'Every hole is worth one skin. Win the hole outright and take it; tie and it carries to the next hole, where the pot gets bigger.',
    rules: [
      'Each hole has one skin worth one unit.',
      'The lowest net score on the hole wins the skin outright. If two or more players tie for lowest, nobody wins it.',
      'A tied skin carries over. The next hole is worth two skins, then three, until someone wins a hole outright and collects all of them.',
      'Payout on a won hole is the number of carried skins plus one, times the unit, paid by every other player.',
      'Skins still carrying at the end of the round are usually void. Some groups play a chip-off; that is off-app.',
    ],
    example: {
      setup: '$5 skins, four players.',
      play: [
        'Holes 1 through 3 all tie. Three skins are carrying.',
        'On hole 4 Casey makes the only birdie.',
      ],
      result: 'Hole 4 is worth four skins, $20. Casey collects $20 from each of the other three, +$60.',
    },
    variations: [
      'Validation: a skin only counts if the winner also makes par or better. Some groups require it; the app pays the low net regardless.',
      'No-carryover skins: tied holes are simply void. The app carries by default, which is the standard game.',
      'Presses restart the count from the press hole. The app supports skins presses.',
    ],
    inApp: [
      'Add Skins at setup with a unit value. Two to four players.',
      'Enter scores; the live screen shows the current carry and who leads in skins.',
      'Settlement shows each hole\'s skin count and who took it, then nets the money.',
    ],
    faq: [
      {
        q: 'Are skins net or gross?',
        a: 'Groups play both. Net with handicap strokes is the default in Bagpipe Golf; switch to gross in the game settings if your group plays it straight up.',
      },
      {
        q: 'What if nobody wins the last hole?',
        a: 'The carried skins are void in the standard game. If your group plays a chip-off or splits the pot, settle that part by hand.',
      },
    ],
    related: ['nassau', 'wolf', 'stableford'],
  },
  {
    slug: 'vegas',
    name: 'Vegas',
    aka: ['Las Vegas golf game', 'Vegas scoring'],
    players: '4 (2v2)',
    summary:
      'Two-person teams turn their two scores into one two-digit number each hole. Low number wins the difference, and a birdie flips the other team\'s number against them.',
    rules: [
      'Two teams of two. On each hole, each team writes its two scores as a single two-digit number with the lower score first. A 4 and a 6 make 46.',
      'The team with the lower number wins the hole. The difference between the two numbers is the number of units won.',
      'Birdie reversal: if any player on a team makes birdie or better, the other team\'s number is written high digit first instead. A 4 and 6 become 64.',
      'If both teams have a birdie or better, both numbers reverse.',
      'Each losing player pays half the difference to each winning player, so a 17-unit swing is $8.50 per player at $1 a unit.',
    ],
    example: {
      setup: '$1 per unit, par 4.',
      play: [
        'Team A scores 4 and 5: 45.',
        'Team B scores 3 and 7: 37. B wins by 8.',
        'But B\'s 3 is a birdie, so A\'s number reverses to 54.',
      ],
      result: 'B wins by 17 units. Each A player pays $8.50 to each B player.',
    },
    variations: [
      'Flip on eagle only: some groups reverse only on eagle. The app reverses on birdie or better.',
      'Net or gross: play the numbers off net scores with handicap strokes, or gross. The app has a toggle.',
      'Cap the swing: house rules sometimes cap a hole at 10 units. Not in the app; settle by hand if you cap.',
    ],
    inApp: [
      'Add Vegas at setup. Exactly four players in two teams.',
      'Enter scores normally; the app builds both numbers, applies the reversal rule, and shows the swing per hole.',
      'Settlement lists every hole\'s numbers and who reversed whom.',
    ],
    needsTracking: undefined,
    faq: [
      {
        q: 'Why is Vegas considered dangerous?',
        a: 'Because one blow-up hole is written as the high digit and a birdie by the other side reverses it. A 4 and 9 is 49; reversed it is 94. Swings of 30 or 40 units on one hole are normal, which is the point.',
      },
      {
        q: 'What if a team\'s two scores are equal?',
        a: 'The number is the same either way. A 5 and 5 is 55 with or without reversal.',
      },
    ],
    related: ['scotch', 'nassau', 'bingo-bango-bongo'],
  },
  {
    slug: 'stableford',
    name: 'Stableford',
    aka: ['Stableford points', 'Modified Stableford'],
    players: '2–4',
    summary:
      'Points for good holes, nothing for bad ones. A blow-up costs you one hole, not the round, which is why it is the format for high handicappers and fast play.',
    rules: [
      'Each hole scores points against par on your net score: eagle 4, birdie 3, par 2, bogey 1, double bogey or worse 0.',
      'Pick up once you cannot score a point on the hole. That is the format\'s whole appeal.',
      'Highest points total after eighteen wins.',
      'For money, settle against the group median so the bet stays zero-sum: each player\'s points above or below the median are paid at the unit, spread across the field.',
    ],
    example: {
      setup: '$1 per point, three players.',
      play: ['Eighteen-hole totals: Sam 38, Casey 34, Patrick 36.', 'The median is 36.'],
      result: 'Sam collects $4 from Casey and $2 from Patrick. Patrick collects $2 from Casey. Everyone\'s money nets to zero.',
    },
    variations: [
      'Modified Stableford, the pro-tour version: double eagle 8, eagle 5, birdie 2, par 0, bogey −1, double or worse −3. Bagpipe ships it as its own game so the two never get mixed up.',
      'Quota: everyone starts with a target based on handicap and settles on points over or under it. Also its own game in the app.',
    ],
    inApp: [
      'Add Stableford at setup with a unit per point.',
      'Enter gross scores; the app applies handicap strokes by hole and computes points.',
      'The live screen shows the points race; settlement does the median math for you.',
    ],
    faq: [
      {
        q: 'What is a good Stableford score?',
        a: 'Thirty-six points means you played to your handicap. Forty or more is a strong day; the club competition winner is usually in the low forties.',
      },
      {
        q: 'How does Stableford work for money with three or four players?',
        a: 'Each player settles against the group median points total, so the payments always add up to zero. That is exactly what the app does.',
      },
    ],
    related: ['skins', 'nassau', 'bingo-bango-bongo'],
  },
  {
    slug: 'match-play',
    name: 'Match Play',
    aka: ['Head-to-head', 'holes up'],
    players: '2–4',
    summary:
      'Win holes, not strokes. Lowest score takes the hole, ties halve, and the match ends the moment one side leads by more holes than are left.',
    rules: [
      'Head to head, or two-person teams playing best ball with four.',
      'On each hole the lower net score wins the hole. Equal scores halve it.',
      'The match is scored in holes up or down. A side that leads by more holes than remain has won: 3-up with two to play is "3&2".',
      'A halved match after eighteen is a push unless you agree a playoff.',
      'For money, the winner collects the unit; a margin bet pays the unit times the final margin.',
    ],
    example: {
      setup: '$10 match, two players.',
      play: ['Sam is 2-up through sixteen.', 'Hole 17 halves.'],
      result: 'Sam wins 2&1, two up with one to play. Casey pays $10.',
    },
    variations: [
      'Presses: when two down, start a second match from that hole to the end. The app supports manual and automatic presses.',
      'Pay the margin: settle at the unit times holes up rather than a flat unit. Choose it in the game settings.',
      'Concessions: match play lets you concede putts and holes. Record the conceded score and the app treats it as played.',
    ],
    inApp: [
      'Add Match Play at setup; two players, or four as two teams.',
      'The live screen shows holes up and the closeout point. When a side clinches, the app marks the match decided and stops counting.',
      'Settlement shows the final margin and any presses.',
    ],
    faq: [
      {
        q: 'What does 4&3 mean?',
        a: 'Four holes up with three to play. The match is over on the fifteenth green because the trailing side cannot catch up.',
      },
      {
        q: 'Do handicaps apply in match play?',
        a: 'Yes. The higher handicap player gets strokes on the hardest holes by stroke index, usually the full difference between the two course handicaps. The app allocates them.',
      },
    ],
    related: ['nassau', 'wolf', 'skins'],
  },
  {
    slug: 'bingo-bango-bongo',
    name: 'Bingo Bango Bongo',
    aka: ['Bingo Bongo Bango'],
    players: '2–4',
    summary:
      'Three points a hole for three things anyone can win: first on the green, closest to the pin, first in the hole. The great equalizer for mixed groups.',
    rules: [
      'Bingo: the first ball on the green earns a point.',
      'Bango: once every ball is on the green, the closest to the pin earns a point.',
      'Bongo: the first ball in the hole earns a point.',
      'Play in strict order, farthest from the hole first, or the points are meaningless. That is the one rule groups forget.',
      'Total the points at the end. Each point is worth the unit; settle the differences across the group.',
    ],
    example: {
      setup: '$1 per point, three players.',
      play: ['Eighteen-hole totals: Sam 20, Casey 16, Patrick 18.'],
      result: 'Sam collects $4 from Casey and $2 from Patrick; Patrick collects $2 from Casey.',
    },
    variations: [
      'Bango only when everyone is on: some groups award closest-to-pin as balls land. The app awards it once all are on, which is the standard rule.',
      'Dots: many groups fold Bingo Bango Bongo into a wider dots game with greenies and sandies. The app has "Dots" as its own game.',
    ],
    inApp: [
      'Add Bingo Bango Bongo at setup, two to four players.',
      'On each hole the scorekeeper taps who got Bingo, Bango, and Bongo. Scores are entered as usual for your card.',
      'Settlement shows the points table and the money.',
    ],
    faq: [
      {
        q: 'Why is Bingo Bango Bongo good for mixed handicaps?',
        a: 'Because the points reward order and touch, not distance. The short hitter is often first on the green and first to hole out.',
      },
      {
        q: 'What if two balls reach the green on the same shot?',
        a: 'Farthest from the hole plays first, so there is always an order. If a real tie happens, most groups split or void the point; the app lets you leave it unawarded.',
      },
    ],
    related: ['stableford', 'skins', 'scotch'],
  },
  {
    slug: 'scotch',
    name: 'Scotch',
    aka: ['Six-Point game', 'Scotch foursome bet', 'Umbrella'],
    players: '4 (2v2)',
    summary:
      'Two-person teams fight for six points every hole across four small bets. Sweep all six and the hole doubles: an Umbrella.',
    rules: [
      'Four points are available on every hole: low ball worth 2, low total worth 2, closest to the pin in regulation worth 1, and a birdie worth 1. Six in all.',
      'Low ball compares each team\'s best individual score; low total compares the two-player sums. Ties on any sub-bet wash, nobody gets that point.',
      'Birdie is gross. If both teams make one it washes.',
      'Umbrella: a team that takes all six points on a hole doubles it to twelve.',
      'Points times the unit settle at the end. With the net toggle on, low ball and low total use net scores; proximity and birdie stay gross.',
    ],
    example: {
      setup: '$5 per point, par 4.',
      play: [
        'Team A: 4 and 5, total 9, low ball 4. Team B: 4 and 6, total 10, low ball 4.',
        'Low ball ties and washes. Low total: A by one, 2 points to A.',
        'B1 was closest in regulation: 1 point to B. Nobody made birdie: washes.',
      ],
      result: 'A 2, B 1 on the hole. A is up a point, $5, split $2.50 to each A player.',
    },
    variations: [
      'Five-point Scotch drops the birdie point. Play it in the app and ignore birdie, or ask us for the variant.',
      'Some groups pay the Umbrella triple rather than double. The app doubles.',
    ],
    inApp: [
      'Add Scotch at setup with exactly four players in two teams and a unit per point.',
      'After each hole the scorekeeper taps proximity and birdie; low ball and low total come from the scores automatically.',
      'The live screen shows the points race and flags Umbrellas. Settlement shows every sub-bet by hole.',
    ],
    faq: [
      {
        q: 'What is an Umbrella in Scotch?',
        a: 'Winning all six points on a hole: low ball, low total, proximity, and birdie. The hole doubles to twelve points.',
      },
      {
        q: 'Is Scotch played net or gross?',
        a: 'Groups do both. In the app the net toggle applies handicap strokes to low ball and low total only; proximity and birdie are always gross, because you either hit the shot or you did not.',
      },
    ],
    related: ['vegas', 'nassau', 'bingo-bango-bongo'],
  },
];

export const sideGameBySlug = (slug: string): SideGame | undefined =>
  sideGames.find((g) => g.slug === slug);
