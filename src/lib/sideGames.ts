// Side-game page library — one page per game at /side-games/<slug>.
//
// GTM_STRATEGY §4.6: the single organic asset that serves every pillar.
// Someone searching "wolf golf game rules" is mid-argument on a tee box —
// maximal intent, near-zero competition — and the page keeps compounding
// after paid spend stops.
//
// ALL 32 GAMES as of 2026-09-27: the eight highest-volume ones came first
// (#95), and GTM decision R3 — 32 pages, not 14 — confirmed the rest, which
// is this set. The count is authoritative: it is the length of the
// `GameType` enum in fairwayiq-flutter `lib/core/models/betting.dart`.
// Add a game to the app and it needs an entry here, or its long-tail
// search traffic has nowhere to land, which is the whole point of R3.
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
  {
    slug: 'aces-and-deuces',
    name: 'Aces & Deuces',
    aka: ['Acey Deucey', 'aces and deuces golf'],
    players: '3–4',
    summary:
      'Low score on the hole is the Ace and collects from everyone. High score is the Deuce and pays everyone half. Ties wash.',
    rules: [
      'On every hole the lowest score is the Ace and the highest is the Deuce.',
      'The Ace collects one unit from every other player.',
      'The Deuce pays half a unit to every other player.',
      'A tie for low means no Ace that hole. A tie for high means no Deuce. Both can happen on the same hole.',
      'The two awards are independent — one hole can have an Ace and no Deuce, or neither.',
    ],
    example: {
      setup: '$2 a unit, four players, par 4.',
      play: [
        'Scores: A = 4, B = 5, C = 6, D = 5.',
        'A is alone at the low, so A is the Ace. C is alone at the high, so C is the Deuce.',
      ],
      result:
        'A collects $2 from each of the other three, +$6. C pays $1 to each of the other three, −$3. B and D net +$1 each.',
    },
    variations: [
      'Some groups play the Deuce at a full unit rather than a half. The app pays the half, which is the common version.',
      'Played gross in most groups. Net works and is the app default; switch it in the game settings.',
    ],
    inApp: [
      'Add Aces & Deuces at setup with three or four players and a unit value.',
      'Enter scores as normal — nothing extra to tap, both awards come off the scores.',
      'Settlement lists each hole and who was Ace or Deuce, then nets it.',
    ],
    faq: [
      {
        q: 'What if two players tie for low?',
        a: 'No Ace that hole. The award has to be outright, which is what keeps the game honest on a crowded leaderboard.',
      },
      {
        q: 'Can one player be both Ace and Deuce?',
        a: 'Only in a twosome, where the same hole makes one player low and the other high. With three or more it cannot happen.',
      },
    ],
    related: ['nines', 'skins', 'defender'],
  },
  {
    slug: 'arnies',
    name: 'Arnies',
    aka: ['Arnie', 'Arnold Palmer bet'],
    players: '2–4',
    summary:
      'Make par or better without ever touching the fairway off the tee. Named for Arnold Palmer, who made pars from places nobody else visited.',
    rules: [
      'An Arnie is par or better on a hole where your tee shot missed the fairway.',
      'The player who makes one collects a unit from every other player.',
      'More than one player can make an Arnie on the same hole; each is paid separately.',
      'Par 3s are usually excluded because there is no fairway to miss. Check what your group plays.',
      'Needs fairways tracked — the bet reads the FIR field, so without it there is nothing to score.',
    ],
    example: {
      setup: '$5 a unit, four players.',
      play: [
        'B pulls the drive into the rough on a par 4.',
        'B chips back to the fairway, hits the green, and one-putts for par.',
      ],
      result: 'That is an Arnie. B collects $5 from each of the other three, +$15.',
    },
    variations: [
      'Some groups require the tee shot to be in a hazard or bunker, not merely the rough. The app scores any missed fairway.',
      'Others pay double for a birdie Arnie. Not in the app; settle that part by hand.',
    ],
    inApp: [
      'Turn on Track FIR/GIR/putts at round start, or the fairway field never appears.',
      'Add Arnies at setup with a unit value.',
      'Record the fairway miss and the score on each hole; the Arnie is detected from the pair.',
    ],
    faq: [
      {
        q: 'Do par 3s count?',
        a: 'Most groups say no, since there is no fairway in regulation to miss. Decide before the first tee — the app scores whatever the fairway field says.',
      },
      {
        q: 'Why is nothing scoring?',
        a: 'Almost always because FIR tracking is off. Arnies reads the fairway field, so the round has to be started with stats on.',
      },
    ],
    related: ['firs', 'dots', 'greenies'],
  },
  {
    slug: 'banker',
    name: 'Banker',
    aka: ['banker golf game', 'threesome banker'],
    players: '3 (exactly)',
    summary:
      'A threesome game. Each hole one player is the Banker and plays two separate matches at double stakes — one against each opponent.',
    rules: [
      'The Banker rotates in order: player one on hole 1, player two on hole 2, player three on hole 3, then repeat.',
      'The Banker plays head-to-head against each of the other two players on that hole.',
      'Each of those two matches pays double the unit, because the Banker is exposed twice.',
      'Ties push — no money on that pairing.',
      'The two non-Bankers do not play each other on that hole.',
    ],
    example: {
      setup: '$2 a unit, three players. A is the Banker on hole 1.',
      play: [
        'Scores: A = 4, B = 5, C = 3.',
        'A beats B, so A collects double the unit: +$4.',
        'C beats A, so A pays double: −$4.',
      ],
      result: 'A nets $0 for the hole. C is +$4 and B is −$4.',
    },
    variations: [
      'Some groups let the Banker double the stake once per round. Not in the app.',
      'Others rotate the Banker by who won the previous hole instead of a fixed order. The app uses the fixed rotation.',
    ],
    inApp: [
      'Add Banker at setup — it needs exactly three players.',
      'Enter scores; the rotation and both matches are computed from the hole number.',
      'Settlement shows each hole, who banked, and the two results.',
    ],
    faq: [
      {
        q: 'Why does the Banker pay double?',
        a: 'Because the Banker is in two matches at once while everyone else is in one. The double stake is what balances the exposure.',
      },
      {
        q: 'Can we play Banker with four?',
        a: 'Not in the app — the rotation and the double-exposure math are built for a threesome. With four, Wolf or Round Robin is the closer game.',
      },
    ],
    related: ['nines', 'wolf', 'defender'],
  },
  {
    slug: 'bloodsome',
    name: 'Bloodsome',
    aka: ['Reverse Scramble', 'Bloodsomes', 'disaster scramble'],
    players: '4 (2v2)',
    summary:
      'A scramble run backwards: both partners tee off and the team must play the WORSE drive, then alternate shots in.',
    rules: [
      'Both players on a team tee off on every hole.',
      'The team plays from the worse of the two drives — the opposing team chooses if there is any argument.',
      'From there the partners alternate shots until the ball is holed.',
      'The player whose drive was not used plays the second shot, so the alternation follows from the choice.',
      'Match play by hole: the lower team score wins the hole.',
    ],
    example: {
      setup: 'Two teams of two, match play.',
      play: [
        'On hole 7 Team A hits one drive 240 down the middle and one 180 into the rough.',
        'They must play the 180 from the rough.',
      ],
      result:
        'Team A plays the hole from the worse spot. It is a strategic, punishing format — the safe tee shot is worth more than the long one.',
    },
    variations: [
      'Some groups let the team choose the worse ball themselves rather than the opponents. Same outcome nearly always.',
      'Handicap allowance for Bloodsome is 100% in the app and the format is scored as individual match play on the team score.',
    ],
    inApp: [
      'Bloodsome is available as a tournament round format and as a side game for a foursome in two teams.',
      'Enter one team score per hole — the alternate-shot detail happens on the course, not in the app.',
      'The live screen shows the match status hole by hole.',
    ],
    faq: [
      {
        q: 'Is Bloodsome the same as Foursomes?',
        a: 'Alternate shot is the same. The difference is the tee shot: Foursomes alternates who tees off, Bloodsome has both play and forces the worse ball.',
      },
      {
        q: 'Who plays the second shot?',
        a: 'Whoever did not hit the ball being played. That falls out of the rule rather than needing its own decision.',
      },
    ],
    related: ['low-ball-high-ball', 'vegas', 'scotch'],
  },
  {
    slug: 'sandies',
    name: 'Sandies',
    aka: ['sand saves', 'up and down'],
    players: '2\u20136',
    summary:
      'Par or better on a hole where you were in a bunker. The classic sandie: get up and down out of the sand and everyone pays you for it.',
    rules: [
      'You have to have been in a bunker on the hole. No bunker, no sandie, however good the score.',
      'Par or better on that hole and you have saved it. The unit comes to you from every other player.',
      'Gross par, not net. A sandie is a sandie — net would let a high handicap \u201csave\u201d with a bogey.',
      'Bogey or worse out of the sand and nothing happens. You are not punished for it in this game.',
      'Two players can both save on the same hole. Each collects from everyone else, so in a twosome they cancel out.',
      'It reads the same per-hole bunker toggle Bunkers uses, plus the score you already entered. There is nothing extra to tap.',
      'A hole only counts once both are in, so a bunker toggled before the score is entered is not a free sandie.',
      'Zero-sum.',
    ],
    example: {
      setup: '$2 a unit, four players \u2014 A, B, C and D.',
      play: [
        'A is bunkered on 4 and makes par. That is a sandie.',
        'A is bunkered again on 11 and makes bogey. Nothing.',
        'C is bunkered on 15 and makes birdie. That is a sandie too.',
      ],
      result:
        'Hole 4: A +$6, B, C and D \u2212$2 each. Hole 15: C +$6, A, B and D \u2212$2 each. Across the round A is +$4, C is +$4, B and D are \u2212$4 each.',
    },
    variations: [
      'Run it alongside Bunkers and the two cancel on a successful escape: Bunkers charges you for finding the sand, Sandies pays you for getting out. A bunker you fail to save from costs you once, which is the point.',
      'Some groups only count greenside bunkers and let fairway sand go. Decide before the round \u2014 the app counts whatever you toggle.',
      'A stricter version requires the save to come from a single shot out of the sand. That is a conversation, not a setting.',
    ],
    inApp: [
      'Add Sandies at setup. There is no mode to pick and no extra row on the live screen.',
      'Tap the bunker toggle for any player who found sand on a hole, the same toggle Bunkers and Bunker Hunt use.',
      'Enter the score as usual. The sandie resolves itself once both are in.',
    ],
    faq: [
      {
        q: 'How is this different from Bunkers?',
        a: 'They are opposites. Bunkers charges you a unit for every hole you find sand, full stop. Sandies pays you a unit for every hole you find sand and still make par or better. Run both and a good escape costs you nothing.',
      },
      {
        q: 'Is it net or gross?',
        a: 'Gross. The traditional sandie is about the shot, not the handicap, and on a net basis a 24 handicap would collect for a bogey.',
      },
      {
        q: 'Do I need to record anything extra?',
        a: 'No. It reads the bunker toggle you are already tapping for Bunkers, plus the score. If you are not tracking bunkers at all, nothing will score.',
      },
      {
        q: 'What if two of us save on the same hole?',
        a: 'Both collect from everyone else. In a foursome that is a net wash between the two savers and a loss for the other two; in a twosome the two savers simply cancel.',
      },
    ],
    related: ['bunkers', 'bunker-hunt', 'dots'],
  },
  {
    slug: 'bunkers',
    name: 'Bunkers',
    aka: ['sandies', 'sand bet', 'bunker bet'],
    players: '2–4',
    summary:
      'An inverse penalty bet. Every hole you find sand costs you a unit to each opponent. The sand does not care how you got there.',
    rules: [
      'Any hole on which you end up in a bunker costs one unit, paid to every other player.',
      'It is once per hole, not once per bunker shot — three swings in the same bunker is still one unit.',
      'Needs the bunker toggle on the live screen; the bet reads that, not the score.',
      'Zero-sum per hole, so it layers safely on top of any other game.',
    ],
    example: {
      setup: '$2 a unit, four players.',
      play: ['A finds the greenside bunker on hole 5. Nobody else does.'],
      result: 'A pays $2 to each of the other three, −$6 for the hole.',
    },
    variations: [
      'The traditional "Sandie" is the opposite bet — a par saved FROM a bunker, which pays the player. We renamed this one Bunkers because it punishes landing in the sand rather than rewarding the escape.',
      'Some groups exempt fairway bunkers and only count greenside. Decide before the round; the app counts whatever you toggle.',
    ],
    inApp: [
      'Add Bunkers at setup with a unit value.',
      'On each hole tap the bunker toggle for any player who found sand.',
      'Settlement lists the holes and who paid.',
    ],
    faq: [
      {
        q: 'Is this the same as a Sandie?',
        a: 'No, it is the inverse. A Sandie rewards getting up and down from sand; Bunkers charges you for being there. The app has this version, and the name change is deliberate so nobody bets the wrong direction.',
      },
      {
        q: 'Do two bunkers on one hole cost double?',
        a: 'No. One unit per hole, however many times you visit.',
      },
    ],
    related: ['lost-balls', 'snake', 'dots'],
  },
  {
    slug: 'bunker-hunt',
    name: 'Bunker Hunt',
    aka: ['bimodal bunkers'],
    players: '2–4',
    summary:
      'The sand bet with a choice of temperament. Pick Holder and it plays like Snake — the last player in a bunker carries it home and pays. Pick Count and every bunkered hole settles on the spot.',
    rules: [
      'You choose the mode when you set the game up. It is locked for the round, so decide on the first tee.',
      'HOLDER — the last player to find sand holds it. Whoever is holding at the last putt pays one unit to every other player, for every bunker anybody found all day. Rotates all round; the only hole that matters is the last one somebody caught it on.',
      'COUNT — on any hole where somebody is in sand, each bunkered player pays one unit to each player who stayed out. Stay dry and you collect a full unit from every player who did not.',
      'In Count, a full unit goes to every saver — the payout does not shrink as more players stay clean.',
      'A hole where everybody is in sand washes to zero. Nobody is left to pay.',
      'Both modes read the per-hole bunker toggle on the score modal, not the score.',
      'Zero-sum either way.',
    ],
    example: {
      setup: '$2 a unit, three players — A, B and C.',
      play: [
        'HOLDER: A is bunkered on 3, C on 8, B never. C is holding at the end and the day saw two bunkers.',
        'COUNT, same round: on 3 only A is in sand; on 4 A and C are in and B is clean.',
      ],
      result:
        'Holder — C pays $2 × 2 others × 2 bunkers = −$8; A and B each +$4. Count — hole 3: A −$4, B +$2, C +$2. Hole 4: A −$2, C −$2, B +$4.',
    },
    variations: [
      'Holder rewards finishing clean; Count punishes every visit. Holder is the crueller of the two — one careless bunker on 18 can hand you the whole day.',
      'Some groups exempt fairway bunkers. Decide before the round; the app counts whatever you toggle.',
    ],
    inApp: [
      'Add Bunker Hunt at setup and pick Holder or Count on the mode control.',
      'Tap the bunker toggle for any player who found sand on a hole.',
      'The live screen shows who is holding it in Holder mode, and the running pot in Count.',
    ],
    faq: [
      {
        q: 'How is this different from Bunkers?',
        a: 'Bunkers is a flat penalty — every hole you find sand costs you a unit to each opponent, full stop. Bunker Hunt reads the same toggle but settles it one of two ways, and Holder mode means you can visit the sand five times and still pay nothing if somebody else is holding at the end.',
      },
      {
        q: 'Can I change mode mid-round?',
        a: 'No. It is locked when the game is created, because the two modes settle completely differently and switching would make the holes already played mean something else.',
      },
      {
        q: 'What if everyone finds sand on the same hole?',
        a: 'Nothing happens on that hole in Count mode — there is nobody clean to collect. In Holder mode it still counts toward the pot and whoever was last in sand holds it.',
      },
    ],
    related: ['bunkers', 'snake', 'lost-balls'],
  },
  {
    slug: 'chairman',
    name: 'Chairman',
    aka: ['chairman golf game', 'the chair'],
    players: '3–4',
    summary:
      'Win a hole and you become the Chairman, which earns you the right to set what the next hole is worth.',
    rules: [
      'The player who wins a hole outright becomes the Chairman.',
      'The Chairman sets the multiplier for the next hole: one, two, or three times the unit.',
      'A tied hole pays nothing and the Chairman carries over unchanged.',
      'Whoever wins the inflated hole collects at that rate and becomes the new Chairman.',
      'The first hole is played at the base unit, since nobody has earned the chair yet.',
    ],
    example: {
      setup: '$5 unit, four players.',
      play: [
        'C wins hole 3 and becomes Chairman.',
        'C sets hole 4 at three times — $15 a unit.',
        'A wins hole 4 at the inflated rate.',
      ],
      result: 'A collects at $15 and takes the chair for hole 5.',
    },
    variations: [
      'Some groups let the Chairman double only, not triple. The app offers one, two or three.',
      'Others make the Chairman play alone against the field. That is closer to Defender.',
    ],
    inApp: [
      'Add Chairman at setup with a base unit.',
      'After each hole the live screen asks the Chairman for the next multiplier.',
      'Settlement shows each hole at the rate it was actually played.',
    ],
    faq: [
      {
        q: 'What happens if a hole ties?',
        a: 'Nothing is paid and the current Chairman keeps the chair. The multiplier they set stays in force for the next hole.',
      },
      {
        q: 'Can the Chairman set a lower rate?',
        a: 'They can set one times, which is the base unit. There is no way to go below it.',
      },
    ],
    related: ['hammer', 'defender', 'skins'],
  },
  {
    slug: 'closeout',
    name: 'Closeout',
    aka: ['closeout match', 'auto-restart match play'],
    players: '2–4',
    summary:
      'Match play that refuses to have dead holes. The moment a match is mathematically over it pays out and a fresh one starts on what is left.',
    rules: [
      'Start with an 18-hole match for a set amount.',
      'When one side leads by more holes than remain, the match is decided and pays immediately.',
      'A new match begins on the remaining holes for half the original amount.',
      'If that one closes out early too, another starts at half again.',
      'The round can therefore settle several matches at descending stakes.',
    ],
    example: {
      setup: 'A $20 match over 18 holes.',
      play: [
        'A goes five up with four to play, so the match is decided.',
        'A wins $20 and a new $10 match starts on holes 15 to 18.',
      ],
      result:
        'If that second match also closes out early, a $5 match starts on whatever is left. No hole is meaningless.',
    },
    variations: [
      'Some groups restart at the full amount rather than half. The app halves it, which keeps the back nine from outweighing the front.',
      'Others play a "press" instead of a restart. Presses are supported separately on match play.',
    ],
    inApp: [
      'Add Closeout at setup with the match amount.',
      'Enter scores; the app detects the closeout and opens the next match on its own.',
      'Settlement lists every match, the holes it covered, and its amount.',
    ],
    faq: [
      {
        q: 'How is this different from a press?',
        a: 'A press adds a new bet alongside the one still running. A closeout ends the first bet because it cannot change, then starts a clean one.',
      },
      {
        q: 'What if the match is all square after 18?',
        a: 'It pushes. No money on a halved match, which is the ordinary match-play outcome.',
      },
    ],
    related: ['match-play', 'nassau', 'hammer'],
  },
  {
    slug: 'defender',
    name: 'Defender',
    aka: ['defender golf game', 'king of the hill'],
    players: '2–4',
    summary:
      'Win a hole and you hold the crown. You collect from everyone on every hole you keep winning — until somebody takes it, or a tie knocks it off you.',
    rules: [
      'The player with the lowest net score on a hole becomes the Defender.',
      'On each following hole the Defender wins outright, they collect one unit from every other player.',
      'A tied hole pays nothing AND clears the Defender slot. The crown is empty until someone wins outright again.',
      'Whoever next wins a hole outright becomes a fresh Defender from scratch.',
    ],
    example: {
      setup: '$2 a unit, four players.',
      play: [
        'B wins hole 1 and becomes Defender.',
        'Nobody beats B on holes 2, 3 or 4, so B collects $6 a hole — $18.',
        'On hole 5 C posts a lower net.',
      ],
      result: 'C is the new Defender and starts collecting from hole 6 onward.',
    },
    variations: [
      'Some groups let the Defender keep the crown through a tie. The app clears it, which stops a hot start from paying all afternoon.',
      'Others escalate the unit for each hole successfully defended. Not in the app.',
    ],
    inApp: [
      'Add Defender at setup with a unit value.',
      'Enter scores; the crown and the collections come off the nets.',
      'Settlement shows who held it on each hole and what it paid.',
    ],
    faq: [
      {
        q: 'Does a tie keep the Defender?',
        a: 'No — a tie pays nothing and clears the slot. That is deliberate: without it one good hole early can earn money for the rest of the round with no defending required.',
      },
      {
        q: 'Is it net or gross?',
        a: 'Net by default so handicaps matter. Switch it in the game settings if your group plays gross.',
      },
    ],
    related: ['rabbits', 'chairman', 'skins'],
  },
  {
    slug: 'deuces',
    name: 'Deuces',
    aka: ['deuce pot', 'twos'],
    players: '2–4',
    summary:
      'Make a 2 on any hole and collect from everybody. Unlike skins, deuces never cancel each other out.',
    rules: [
      'Any score of 2 collects one unit from every other player, for that hole.',
      'A par-3 birdie and a par-4 eagle both count — the game cares about the number, not the par.',
      'Two players making a 2 on the same hole both get paid in full by everyone who did not.',
      'A player who makes more than one deuce in a round is paid separately for each.',
    ],
    example: {
      setup: 'Four players, $2 a unit.',
      play: [
        'A makes a 2 on the par-3 third: A is +$6, and B, C and D are each −$2.',
        'B makes a 2 on the par-3 sixth: B is +$6 for that hole, and A, C and D are each −$2.',
      ],
      result:
        'Across both holes A is +$4, B is +$4, and C and D are −$4 each. It sums to zero, as it must.',
    },
    variations: [
      'Some groups run a deuce pot everyone contributes to, split at the end among whoever made one. The app pays hole by hole instead, which settles cleanly even if nobody deuces.',
      'Others pay double for a 2 on a par 5. Not in the app.',
    ],
    inApp: [
      'Add Deuces at setup with a unit value.',
      'Nothing extra to tap — it reads the scores.',
      'Settlement lists each deuce, the hole, and what it paid.',
    ],
    faq: [
      {
        q: 'Do two deuces on the same hole cancel out?',
        a: 'No. That is the difference from skins. Each deucer collects a full unit from each player who did not make one.',
      },
      {
        q: 'Does a hole-in-one count as a deuce?',
        a: 'A 1 is not a 2, so no. Most groups have a separate — and considerably larger — arrangement for an ace.',
      },
    ],
    related: ['skins', 'greenies', 'dots'],
  },
  {
    slug: 'dots',
    name: 'Dots',
    aka: ['Garbage', 'trash', 'junk', 'dots golf game'],
    players: '2–4',
    summary:
      'The garbage bag: a pile of small awards and penalties layered on any round. Tally the dots at the end and pay the difference.',
    rules: [
      'Positive dots: a greenie (closest on a par 3) is +1, a sandie (up and down from a bunker) is +1, a chip-in is +2, a birdie is +1.',
      'Negative dots: a three-putt is −1, a double bogey or worse is −1.',
      'Dots accumulate all round; nothing resets.',
      'At the end each player settles the difference in dots against every other player at the unit value.',
    ],
    example: {
      setup: '$1 a dot, three players.',
      play: ['After 18 holes the tallies are A +8, B +2, C −3.'],
      result:
        'A collects $6 from B and $11 from C. B collects $5 from C. Everything nets out against everyone.',
    },
    variations: [
      'Every group has its own bag. Common extras: a "polly" for hitting a tree and making par, an "oozle" for first on the green. The app ships the six above.',
      'Some play dots at a different value from the main game. Set its own unit at setup.',
    ],
    inApp: [
      'Add Dots at setup with a unit per dot.',
      'Tap the dot chips on each hole as they happen; three-putts and doubles come off the score and putts automatically.',
      'Settlement shows every dot by hole and player, then nets the difference.',
    ],
    faq: [
      {
        q: 'Can we add our own dots?',
        a: 'Not yet — the six in the app are the common set. Track a house dot on paper and settle it alongside.',
      },
      {
        q: 'Do I need stats tracking on?',
        a: 'For the automatic ones, yes: three-putts need putts tracked and sandies need the bunker toggle. Birdies and doubles come off the score alone.',
      },
    ],
    related: ['greenies', 'snake', 'arnies'],
  },
  {
    slug: 'firs',
    name: 'FIRs',
    aka: ['fairways in regulation', 'fairway bet'],
    players: '2–4',
    summary:
      'A point for every fairway you hit. The straightest driver in the group gets paid by everyone else.',
    rules: [
      'Each fairway hit in regulation is worth one point.',
      'At settlement every opponent pays one unit per fairway you hit more than they did.',
      'Par 3s do not count — there is no fairway in regulation.',
      'Needs fairways tracked, or there is nothing for the bet to read.',
    ],
    example: {
      setup: '$1 a fairway, three players.',
      play: ['A hits 11 fairways, B hits 7, C hits 9.'],
      result: 'A collects $4 from B and $2 from C. C collects $2 from B.',
    },
    variations: [
      'Some groups pay only the outright winner rather than settling every pair. The app settles pairwise, which keeps it zero-sum.',
      'Others count a fairway bunker as a miss. The app follows whatever the fairway field records.',
    ],
    inApp: [
      'Turn on Track FIR/GIR/putts at round start.',
      'Add FIRs at setup with a unit value.',
      'Record the fairway on each hole; the running count shows on the live screen.',
    ],
    faq: [
      {
        q: 'Why is my FIRs bet showing zero?',
        a: 'The round was almost certainly started without stats tracking. The bet reads the fairway field, and without it every player sits at zero.',
      },
      {
        q: 'Does the tee shot on a par 5 count?',
        a: 'Yes. Any hole with a fairway in regulation counts, which is every par 4 and par 5.',
      },
    ],
    related: ['girs', 'arnies', 'dots'],
  },
  {
    slug: 'girs',
    name: 'GIRs',
    aka: ['greens in regulation', 'green bet'],
    players: '2–4',
    summary:
      'A point for every green you hit in regulation. The same shape as FIRs, one club further along.',
    rules: [
      'Each green hit in regulation is worth one point.',
      'At settlement every opponent pays one unit per green you hit more than they did.',
      'In regulation means on the green in par minus two — so two shots on a par 4, three on a par 5, one on a par 3.',
      'Needs greens tracked.',
    ],
    example: {
      setup: '$1 a green, three players.',
      play: ['A hits 12 greens, B hits 8, C hits 10.'],
      result: 'A collects $4 from B and $2 from C. C collects $2 from B.',
    },
    variations: [
      'Some groups combine FIRs and GIRs into one "ball striking" bet. Add both and set the same unit.',
      'Others count the fringe as a green. The app follows the green field as recorded.',
    ],
    inApp: [
      'Turn on Track FIR/GIR/putts at round start.',
      'Add GIRs at setup with a unit value.',
      'Record the green on each hole, with the miss direction if you want the career stats to be useful later.',
    ],
    faq: [
      {
        q: 'Does a par 3 count?',
        a: 'Yes — in regulation on a par 3 means the tee shot finishes on the green.',
      },
      {
        q: 'Why is nothing scoring?',
        a: 'Stats tracking is off. Start the round with Score + stats and the green field appears on every hole.',
      },
    ],
    related: ['firs', 'greenies', 'dots'],
  },
  {
    slug: 'greenies',
    name: 'Greenies',
    aka: ['greenie', 'closest to the pin', 'KP'],
    players: '2–4',
    summary:
      'Closest to the pin on a par 3 — but only if you convert. Stiff it and three-putt and the greenie is void.',
    rules: [
      'On every par 3 the player whose tee shot finishes closest to the hole wins the greenie.',
      'The tee shot must finish on the green to qualify.',
      'The winner must then make par or better. If they do not, no greenie is awarded on that hole.',
      'The greenie pays one unit from every other player.',
    ],
    example: {
      setup: '$5 greenies, four players.',
      play: [
        'Hole 7, a par 3: C hits it to eight feet, closest of the group, and two-putts for par. C collects $5 from each player.',
        'Hole 12: A hits it to four feet but three-putts for bogey.',
      ],
      result: 'No greenie on 12 — the closest shot did not convert, which is the point of the rule.',
    },
    variations: [
      'Some groups drop the par requirement and pay the closest shot outright. The app requires the par, which is the traditional game.',
      'Others carry an unconverted greenie to the next par 3. Not in the app.',
    ],
    inApp: [
      'Add Greenies at setup with a unit value.',
      'On each par 3 tap the closest-to-pin player; the app checks the score for the par itself.',
      'Settlement lists each par 3, who was closest, and whether it converted.',
    ],
    faq: [
      {
        q: 'What if the closest shot misses the green?',
        a: 'It does not qualify — the shot has to finish on the green. If nobody is on in one, there is no greenie.',
      },
      {
        q: 'Why did my greenie not pay?',
        a: 'Almost always the par requirement. Closest to the pin and then a bogey wins nothing.',
      },
    ],
    related: ['dots', 'deuces', 'bingo-bango-bongo'],
  },
  {
    slug: 'hammer',
    name: 'Hammer',
    aka: ['the hammer', 'hammer golf bet'],
    players: '2–4',
    summary:
      'Match play with a dare bolted on. Any player can throw the hammer mid-hole to double it — accept, or concede at the old price.',
    rules: [
      'Every hole starts at the unit value, played as match play.',
      'At any point during a hole a player can call the hammer, doubling that hole.',
      'The opponent must accept and play on at the doubled stake, or concede the hole at the value before the hammer.',
      'If accepted, the opponent can re-hammer to double again. Taps chain.',
      'Once scores are entered the hole settles at whatever multiple it reached.',
    ],
    example: {
      setup: '$5 a hole, two players.',
      play: [
        'A splits the fairway and calls the hammer — the hole is now $10.',
        'B accepts, then hits an approach to three feet and re-hammers — now $20.',
      ],
      result: 'A must accept at $20 or concede the hole for $10. The shot, not the score, is what moves the money.',
    },
    variations: [
      'Some groups cap the hammer at two throws a hole. The app does not cap it.',
      'Others only allow the hammer from behind. The app lets anyone throw at any time.',
    ],
    inApp: [
      'Add Hammer at setup with a base unit.',
      'Tap Hammer on the live screen during the hole; the multiplier shows in the banner.',
      'Settlement shows each hole at the multiple it was played for.',
    ],
    faq: [
      {
        q: 'What happens if I concede?',
        a: 'You pay the hole at its value before the hammer that you refused. Conceding is the cheap exit, which is what makes the throw worth something.',
      },
      {
        q: 'Is there a limit on doubling?',
        a: 'Not in the app — 2×, 4×, 8× and onward if both of you keep going. Agree a ceiling out loud if you want one.',
      },
    ],
    related: ['wolf-hammer', 'chairman', 'match-play'],
  },
  {
    slug: 'low-ball-high-ball',
    name: 'Low Ball / High Ball',
    aka: ['low ball high ball', 'best ball worst ball', 'two-point'],
    players: '4 (2v2)',
    summary:
      'Two points a hole: one for the better ball, one for the better of the two worse balls. Your best plays their best and your worst plays their worst.',
    rules: [
      'Two points are available on every hole.',
      'One point goes to the team with the lower individual score on the hole — the low ball.',
      'One point goes to the team with the lower of the two highest scores — the high ball.',
      'A tie on either comparison washes that point.',
      'A team can win both, split, or lose both. Both partners matter, which is the appeal.',
    ],
    example: {
      setup: 'Two teams of two.',
      play: [
        'Hole 5 — Team A scores 4 and 6; Team B scores 5 and 5.',
        'Low ball: A wins it, 4 against 5.',
        'High ball: B wins it, 5 against 6.',
      ],
      result: 'One point each — the hole splits. A big number from one partner cost A the hole they had won on the low ball.',
    },
    variations: [
      'Some groups play a third point for combined total. That is closer to Scotch.',
      'Others play low ball for two points and high ball for one. The app plays them evenly.',
    ],
    inApp: [
      'Add Low Ball / High Ball at setup with four players in two teams and a unit per point.',
      'Enter individual scores; both comparisons come off them.',
      'Settlement shows the two points by hole.',
    ],
    faq: [
      {
        q: 'Is high ball the worst score or the best of the worst?',
        a: 'The better of the two teams’ high scores. You are not trying to have a bad hole — you are trying for your weaker score to beat their weaker score.',
      },
      {
        q: 'Net or gross?',
        a: 'Both work. Net is the default so handicaps count on both comparisons.',
      },
    ],
    related: ['scotch', 'vegas', 'bloodsome'],
  },
  {
    slug: 'lost-balls',
    name: 'Lost Balls',
    aka: ['lost ball bet', 'ball bet'],
    players: '2–4',
    summary:
      'Every ball you lose costs you, and the players who kept theirs in play split the proceeds. Zero-sum every hole.',
    rules: [
      'Each ball lost on a hole costs its owner one unit.',
      'The pot for that hole is split among the ball-savers — the players who lost none.',
      'If everyone loses at least one, the rebate is weighted so whoever lost the fewest still comes out ahead.',
      'Zero-sum per hole, so it layers safely on any other game.',
      'The count also feeds your career stats whether or not this side game is on.',
    ],
    example: {
      setup: '$2 a unit, three players.',
      play: ['On hole 7 A loses two balls; B and C lose none.'],
      result: 'The pot is $4. A pays $4 and B and C take $2 each. The hole balances to zero.',
    },
    variations: [
      'Some groups charge double for a ball lost off the tee. The app charges one unit per ball wherever it went.',
      'Others play a provisional as not lost. Count it however your group plays — the app scores the number you enter.',
    ],
    inApp: [
      'Turn on Track FIR/GIR/putts at round start and a lost-balls field appears on every hole.',
      'Add Lost Balls at setup with a unit value if you want money on it.',
      'The count rolls into your career stats as lost balls per round either way — the side game is optional, the stat is not.',
    ],
    faq: [
      {
        q: 'Do I need the side game on for the stat?',
        a: 'No. Lost balls per round shows on your career stats from the per-hole field alone. The side game only adds money to it.',
      },
      {
        q: 'What if everyone loses a ball on the same hole?',
        a: 'The rebate is weighted, so whoever lost the fewest is still ahead of whoever lost the most. Nobody escapes, but the worst offender pays.',
      },
    ],
    related: ['bunkers', 'snake', 'dots'],
  },
  {
    slug: 'modified-stableford',
    name: 'Modified Stableford',
    aka: ['modified stableford points', 'Barracuda scoring'],
    players: '2–4',
    summary:
      'Stableford with the reward and the punishment both turned up — the scoring the PGA Tour uses at the Barracuda.',
    rules: [
      'Points per hole: hole-in-one on a par 5 is +15, an albatross is +10, an eagle is +6, a birdie is +3, a par is +1.',
      'A bogey is 0 and a double bogey or worse is −2.',
      'Each player’s total runs head-to-head against every other player.',
      'Differences settle at the unit value.',
      'Going for it pays here in a way it does not in regular Stableford, and a blow-up genuinely hurts.',
    ],
    example: {
      setup: '$1 a point, two players.',
      play: [
        'A makes four birdies, an eagle, ten pars and three doubles: 12 + 6 + 10 − 6 = 22.',
        'B makes two birdies, fourteen pars and two bogeys: 6 + 14 + 0 = 20.',
      ],
      result: 'A wins by 2 points and collects $2.',
    },
    variations: [
      'The tour table is the one in the app. Some groups soften the double-bogey penalty to −1.',
      'Played net in the app by default, which changes which holes are pars for whom.',
    ],
    inApp: [
      'Add Modified Stableford at setup with a unit per point.',
      'Enter scores; points come off the score against par with handicap strokes applied.',
      'The live screen shows the running points race.',
    ],
    faq: [
      {
        q: 'How is this different from Stableford?',
        a: 'Regular Stableford is 4/3/2/1/0 and never goes negative. This one pays much more for an eagle and takes points away for a double, so it rewards aggression instead of steadiness.',
      },
      {
        q: 'Is a bogey really worth nothing?',
        a: 'Yes — zero, not negative. Only a double or worse costs you points.',
      },
    ],
    related: ['stableford', 'quota', 'nines'],
  },
  {
    slug: 'nines',
    name: 'Nines',
    aka: ['nines golf game', '5-3-1', 'nine point'],
    players: '3 (exactly)',
    summary:
      'Nine points on every hole, split five to the best score, three to the middle, one to the worst. A threesome game with no dead holes.',
    rules: [
      'Nine points are available on each hole: 5 for the best score, 3 for the middle, 1 for the worst.',
      'Tied for best: 4, 4, 1.',
      'Tied for worst: 5, 2, 2.',
      'All three tied: 3, 3, 3.',
      'Totals after 18 holes always come to 162, which is a useful check that nothing was mis-entered.',
      'Settle at the unit value per point of difference.',
    ],
    example: {
      setup: '$1 a point, three players.',
      play: [
        'Hole 1: A = 4, B = 5, C = 5. A takes 5; B and C tie for worst and take 2 each.',
        'After 18: A = 62, B = 50, C = 50.',
      ],
      result: 'A collects $12 from B and $12 from C. The three totals add to 162.',
    },
    variations: [
      'Some foursomes split 6 points a hole as 3/2/1/0. That points variant is not in the app (it is not the Sixes side game, which is partners); Nines needs exactly three.',
      'Net is the default. Gross works and changes the tie pattern considerably.',
    ],
    inApp: [
      'Add Nines at setup — it needs exactly three players.',
      'Enter scores; the split and every tie case are computed for you.',
      'Settlement shows the per-hole split and the running totals.',
    ],
    faq: [
      {
        q: 'Why do the totals have to reach 162?',
        a: 'Nine points a hole across 18 holes. If your totals do not add to 162 a score is missing — it is the cheapest error check in any of these games.',
      },
      {
        q: 'Can we play Nines with four?',
        a: 'Not in the app. The 5-3-1 split is built for three; with four, Nassau or Low Ball / High Ball fits better.',
      },
    ],
    related: ['banker', 'stableford', 'aces-and-deuces'],
  },
  {
    slug: 'quota',
    name: 'Quota',
    aka: ['quota points', 'point quota', 'chicago'],
    players: '2–4',
    summary:
      'Everyone gets a points target from their handicap. Beat your number by more than the next player beats theirs and you win.',
    rules: [
      'Each player’s quota is usually 36 minus their course handicap.',
      'Points per hole are Stableford-style: eagle 4, birdie 3, par 2, bogey 1, double or worse 0.',
      'Finish above your quota for a surplus; below it for a deficit.',
      'Players settle the difference between their surpluses at the unit value.',
      'A high handicap is not a disadvantage — the quota already accounts for it.',
    ],
    example: {
      setup: 'Two players, $1 a point.',
      play: [
        'A is a 10 handicap, so the quota is 26. A scores 28 points: +2.',
        'B is a 20 handicap, so the quota is 16. B scores 19 points: +3.',
      ],
      result: 'B beats A by one point of surplus and collects $1. The 20 handicap beat the 10 on the day.',
    },
    variations: [
      'Some clubs set quotas from a fixed table rather than 36 minus handicap. Adjust the handicaps at setup if your club differs.',
      'Others play gross quota for a scratch field. The points table is the same.',
    ],
    inApp: [
      'Add Quota at setup with a unit value.',
      'Quotas are computed from each player’s course handicap — check they look right before you start.',
      'The live screen shows each player against their own number, not against each other.',
    ],
    faq: [
      {
        q: 'Where does 36 come from?',
        a: 'A scratch golfer shooting par on every hole scores 36 Stableford points. Subtracting the handicap gives everyone a target they should hit playing to their ability.',
      },
      {
        q: 'What if everyone misses their quota?',
        a: 'Then the smallest deficit wins. The settlement is on the difference between surpluses, so negative numbers work the same way.',
      },
    ],
    related: ['stableford', 'modified-stableford', 'nines'],
  },
  {
    slug: 'rabbits',
    name: 'Rabbits',
    aka: ['rabbit', 'chasing the rabbit'],
    players: '2–4',
    summary:
      'Win a hole and you catch the rabbit. Hold it to the turn and you get paid — hold it to 18 and you get paid again.',
    rules: [
      'Winning a hole outright catches the rabbit.',
      'Another player winning a hole outright sets it free and takes it.',
      'Whoever holds the rabbit at the end of hole 9 collects one unit from every other player.',
      'The rabbit then resets, and whoever holds it at the end of hole 18 collects again.',
      'Two separate rabbits a round — front nine and back nine.',
    ],
    example: {
      setup: '$5 rabbit, four players.',
      play: [
        'C wins hole 3 and catches the rabbit.',
        'Nobody wins a hole outright through hole 9.',
      ],
      result: 'C is holding it at the turn and collects $5 from each player, +$15. A fresh rabbit starts on hole 10.',
    },
    variations: [
      'Some groups play one rabbit for all 18 rather than resetting at the turn. The app resets, which keeps the back nine live.',
      'Others require the rabbit to be caught before it can be paid, so an untouched front nine pays nothing. The app pays whoever holds it.',
    ],
    inApp: [
      'Add Rabbits at setup with a unit value.',
      'Enter scores; the live screen shows who currently holds it.',
      'Settlement shows the holder at 9 and at 18 and what each collected.',
    ],
    faq: [
      {
        q: 'What if nobody has the rabbit at the turn?',
        a: 'That happens when no hole on the front was won outright. Nothing is paid and a new rabbit starts on the back.',
      },
      {
        q: 'Does a tie take the rabbit away?',
        a: 'No — a tie changes nothing. The holder keeps it until somebody wins a hole outright.',
      },
    ],
    related: ['defender', 'snake', 'skins'],
  },
  {
    slug: 'round-robin',
    name: 'Round Robin',
    aka: ['round robin golf', 'switch'],
    players: '4 (exactly)',
    summary:
      'Partners change every six holes so you play with everyone once. Three mini match-play matches in one round.',
    rules: [
      'Holes 1 to 6: players one and two against three and four.',
      'Holes 7 to 12: one and three against two and four.',
      'Holes 13 to 18: one and four against two and three.',
      'Each six-hole segment is its own match-play match, settling at the unit value.',
      'By the end everyone has partnered everyone and played against everyone.',
    ],
    example: {
      setup: '$10 a segment, four players.',
      play: [
        'Holes 1 to 6: A and B beat C and D — each of A and B is +$10.',
        'Holes 7 to 12: B and D win.',
        'Holes 13 to 18: A and D win.',
      ],
      result: 'Three segments settle separately and the net falls out of the three results.',
    },
    variations: [
      'Sixes uses the same rotation but scores best ball within each segment instead of match play.',
      'Some groups carry a running total across segments rather than settling each. The app settles per segment.',
    ],
    inApp: [
      'Add Round Robin at setup — it needs exactly four players.',
      'The rotation is applied automatically as the round crosses holes 7 and 13.',
      'Settlement shows the three segments and who partnered whom.',
    ],
    faq: [
      {
        q: 'How is this different from Sixes?',
        a: 'Same partner rotation. Round Robin plays each segment as match play, hole by hole; Sixes scores best ball across the segment.',
      },
      {
        q: 'Can we pick our own partners?',
        a: 'The rotation is fixed so that everyone pairs with everyone. If you want to choose, Wolf is the game for that.',
      },
    ],
    related: ['sixes', 'wolf', 'nassau'],
  },
  {
    slug: 'sixes',
    name: 'Sixes',
    // Renamed from Six-Six-Six 2026-10-07; the old names stay searchable.
    aka: ['six-six-six', '666', 'six six six golf'],
    players: '4 (exactly)',
    summary:
      'Three six-hole segments with rotating partners, each scored as best ball. The name is the three sixes.',
    rules: [
      'Partners rotate every six holes, the same pattern as Round Robin.',
      'Each segment is scored as best ball rather than hole-by-hole match play.',
      'The better team score on each hole counts toward the segment.',
      'Each segment settles at the unit value.',
      'The scorekeeper is prompted for new partners as the round crosses into hole 7 and hole 13; dismiss it and the standard rotation applies.',
    ],
    example: {
      setup: '$5 a segment, four players.',
      play: ['Segment one: A and B beat C and D by two holes.'],
      result: 'A and B are each +$10 and C and D each −$10. Segments two and three repeat with rotated partners.',
    },
    variations: [
      'Some groups play the segments as match play instead — that is Round Robin.',
      'Others play nine-hole segments with a threesome. Not in the app; this needs four.',
    ],
    inApp: [
      'Add Sixes at setup with exactly four players.',
      'Confirm or change partners when the app prompts at holes 7 and 13.',
      'Settlement shows each segment with its partners and margin.',
    ],
    faq: [
      {
        q: 'What if I miss the partner prompt?',
        a: 'The built-in rotation applies, which is the standard pattern. You can still change it before the segment finishes.',
      },
      {
        q: 'Is it best ball or match play?',
        a: 'Best ball within the segment. Round Robin is the match-play version of the same rotation.',
      },
    ],
    related: ['round-robin', 'wolf', 'low-ball-high-ball'],
  },
  {
    slug: 'snake',
    name: 'Snake',
    aka: ['the snake', 'three-putt snake'],
    players: '2–4',
    summary:
      'Nobody wants the snake. Three-putt and it is yours, until somebody else three-putts. Whoever holds it at 18 pays everyone.',
    rules: [
      'The first player to three-putt gets the snake.',
      'It passes to whoever three-putts next.',
      'Only one player ends up paying — whoever is holding it after the last hole.',
      'The holder pays one unit to every other player.',
      'Needs putts tracked, since the bet reads the putt count.',
    ],
    example: {
      setup: '$10 snake, four players.',
      play: [
        'A three-putts hole 4 and takes the snake.',
        'C three-putts hole 11 and it passes to C.',
        'Nobody three-putts again.',
      ],
      result: 'C holds it at 18 and pays $10 to each of the other three, −$30.',
    },
    variations: [
      'Some groups escalate the snake — the value doubles each time it passes. Not in the app.',
      'Others count a four-putt as two passes. The app passes it once per three-putt-or-worse hole.',
    ],
    inApp: [
      'Turn on Track FIR/GIR/putts at round start, or there is no putt count to read.',
      'Add Snake at setup with a unit value.',
      'The live screen shows who currently holds it — which is most of the fun.',
    ],
    faq: [
      {
        q: 'What if nobody three-putts all round?',
        a: 'Nobody pays. The snake has to be caught before it can be handed on.',
      },
      {
        q: 'Why is the snake not moving?',
        a: 'Putts are not being tracked. Start the round with stats on and the putt field appears on every hole.',
      },
    ],
    related: ['dots', 'rabbits', 'lost-balls'],
  },
  {
    slug: 'wolf-hammer',
    name: 'Wolf Hammer',
    aka: ['wolf with hammer', 'hammer wolf'],
    players: '4 (exactly)',
    summary:
      'Wolf, with the hammer on top. The rotating-partner game you know, and any player can double the hole while it is being played.',
    rules: [
      'Play Wolf exactly as normal: the Wolf tees off first, watches the other drives, and either picks a partner or goes Lone Wolf.',
      'On any hole, any player can tap Hammer to double that hole’s stake.',
      'Taps chain — 2×, 4×, 8× — until scores are entered.',
      'The hole then settles on the standard Wolf compare: best ball for a pair, or the Lone Wolf against the other three.',
      'The Lone Wolf still plays for double, and the hammer multiplies on top of that.',
    ],
    example: {
      setup: '$1 a unit, four players. Hole 3, Sam is the Wolf and picks Patrick.',
      play: [
        'Sam and Patrick against Casey and Tim.',
        'Casey taps Hammer, taking the hole to 2×. Sam re-taps, taking it to 4×.',
        'Nets: Sam 4, Patrick 5, Casey 5, Tim 3.',
      ],
      result:
        'Team lows are Sam’s 4 against Tim’s 3, so the opponents win. At 4× Sam and Patrick each pay $4 and Casey and Tim each collect $4 — $8 changes hands instead of $2.',
    },
    variations: [
      'Some groups only let the team that is behind throw the hammer. The app lets anyone throw.',
      'Others cap it at 4×. No cap in the app — agree one out loud if you want it.',
    ],
    inApp: [
      'Add Wolf Hammer at setup with exactly four players and a base unit.',
      'Pick the partner or go Lone Wolf on each hole, then tap Hammer any time before scores are in.',
      'The live screen shows the current multiplier; settlement shows each hole at the multiple it reached.',
    ],
    faq: [
      {
        q: 'Does the hammer stack with the Lone Wolf double?',
        a: 'Yes, and it gets expensive quickly. A Lone Wolf hole at 4× is eight units a player against you.',
      },
      {
        q: 'When is it too late to hammer?',
        a: 'Once scores for the hole are entered. Until then anybody can throw it.',
      },
    ],
    related: ['wolf', 'hammer', 'round-robin'],
  },
];

/** Slugs a game USED to live at → where it lives now. The [slug] page
 *  answers these with a 301, so old links and search rankings carry over. */
export const RENAMED_SIDE_GAME_SLUGS: Record<string, string> = {
  'six-six-six': 'sixes', // 2026-10-07: Six-Six-Six → Sixes (Sam)
};

export const sideGameBySlug = (slug: string): SideGame | undefined =>
  sideGames.find((g) => g.slug === slug);
