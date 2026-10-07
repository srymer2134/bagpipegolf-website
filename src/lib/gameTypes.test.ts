import { describe, expect, it } from 'vitest';
import {
  EXPECTED_GAME_TYPE_COUNT,
  LEGACY_ALIASES,
  RESERVED_WIRES,
  GAME_TYPE_COUNT,
  gameTypeLabels,
  gameTypeWires,
  resolveGameType,
  resolveGameTypes,
  slugForWire,
  snakeToCamel,
} from './gameTypes';
import { sideGameBySlug, sideGames } from './sideGames';

describe('the map covers every game the app ships', () => {
  it('has one wire value per side game', () => {
    expect(GAME_TYPE_COUNT).toBe(EXPECTED_GAME_TYPE_COUNT);
    expect(GAME_TYPE_COUNT).toBe(sideGames.length);
  });

  it('every wire value points at a rules page that exists', () => {
    const broken = gameTypeWires().filter((w) => !resolveGameType(w).slug);
    expect(broken, 'wire values with no rules page').toEqual([]);
  });

  it('no two wire values claim the same game', () => {
    const slugs = gameTypeWires().map((w) => resolveGameType(w).slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('every game in the library is reachable from some wire value', () => {
    // The other direction. A game with a page and no wire value can
    // never be named on /app/side-games, which is the bug this module
    // was written to fix.
    const reached = new Set(
      gameTypeWires().map((w) => resolveGameType(w).slug),
    );
    const orphans = sideGames
      .map((g) => g.slug)
      .filter((s) => !reached.has(s));
    expect(orphans, 'rules pages no game type maps to').toEqual([]);
  });
});

describe('the two sand bets do not get swapped', () => {
  // The whole reason this is a table and not a transform. The values
  // crossed over on 2026-10-06/07: `bunkers` was Bunker Hunt's, and
  // the flat penalty game stored `sandies` while labelled "Bunkers".
  it('wire "bunkers" is the flat penalty game', () => {
    const r = resolveGameType('bunkers');
    expect(r.label).toBe('Bunkers');
    expect(r.href).toBe('/side-games/bunkers');
  });

  it('wire "bunker_hunt" is Bunker Hunt', () => {
    const r = resolveGameType('bunker_hunt');
    expect(r.label).toBe('Bunker Hunt');
    expect(r.href).toBe('/side-games/bunker-hunt');
  });

  it('and they are different games', () => {
    expect(resolveGameType('bunkers').slug)
      .not.toBe(resolveGameType('bunker_hunt').slug);
  });
});

describe('both spellings the app writes resolve', () => {
  // `ApiService._gameToApiPatch` sends `GameType.name` (camelCase);
  // `GameTypeValue.value` defines snake_case for storage and
  // `GameType.fromValue` accepts either, so rows carry both.
  it('camelCase resolves the same as snake_case', () => {
    for (const wire of gameTypeWires()) {
      const camel = snakeToCamel(wire);
      expect(resolveGameType(camel).slug, `${camel} vs ${wire}`)
        .toBe(resolveGameType(wire).slug);
    }
  });

  it('the multi-word ones specifically', () => {
    expect(resolveGameType('matchPlay').label).toBe('Match Play');
    expect(resolveGameType('bingoBangoBongo').label).toBe('Bingo Bango Bongo');
    expect(resolveGameType('lowBallHighBall').label).toBe('Low Ball / High Ball');
    expect(resolveGameType('sixSixSix').label).toBe('Six-Six-Six');
    expect(resolveGameType('acesDeuces').label).toBe('Aces & Deuces');
    expect(resolveGameType('lostBalls').label).toBe('Lost Balls');
    expect(resolveGameType('wolfHammer').label).toBe('Wolf Hammer');
    expect(resolveGameType('roundRobin').label).toBe('Round Robin');
    expect(resolveGameType('modifiedStableford').label)
      .toBe('Modified Stableford');
  });

  it('snakeToCamel does what it says', () => {
    expect(snakeToCamel('low_ball_high_ball')).toBe('lowBallHighBall');
    expect(snakeToCamel('six_six_six')).toBe('sixSixSix');
    expect(snakeToCamel('wolf')).toBe('wolf');
  });
});

describe('no raw wire value reaches the reader', () => {
  it('no label carries an underscore or a camelCase hump', () => {
    for (const wire of gameTypeWires()) {
      const { label } = resolveGameType(wire);
      expect(label, `${wire} label`).not.toMatch(/_/);
      expect(label, `${wire} label`).not.toMatch(/[a-z][A-Z]/);
      expect(label[0], `${wire} label starts lowercase`)
        .toBe(label[0].toUpperCase());
    }
  });

  it('the old behaviour would have failed this', () => {
    // What the pages used to do. Kept as a test so the regression is
    // described, not just prevented.
    const old = (g: string) => g.replace(/_/g, ' ');
    expect(old('bunkers')).toBe('bunkers');          // a bare wire value
    expect(old('matchPlay')).toBe('matchPlay');      // untouched
    expect(resolveGameType('bunkers').label).toBe('Bunkers');
    expect(resolveGameType('matchPlay').label).toBe('Match Play');
  });
});

describe('resolveGameTypes on a real row', () => {
  it('maps a list, keeping order', () => {
    const out = resolveGameTypes(['skins', 'bunker_hunt', 'matchPlay']);
    expect(out.map((g) => g.label)).toEqual([
      'Skins', 'Bunker Hunt', 'Match Play',
    ]);
  });

  it('drops nulls and blanks rather than rendering an empty chip', () => {
    expect(gameTypeLabels(['skins', null, '', undefined, '  '])).toEqual([
      'Skins',
    ]);
    expect(gameTypeLabels(null)).toEqual([]);
  });

  it('keeps an unknown game instead of hiding it, with no rules link', () => {
    // A 34th game shipped by an app build newer than this deploy. The
    // player still sees it in their own game.
    const r = resolveGameType('bunkerRush');
    expect(r.label).toBe('Bunker Rush');
    expect(r.slug).toBeNull();
    expect(r.href).toBeNull();
  });

  it('an unknown snake value is titled too', () => {
    expect(resolveGameType('super_sixes').label).toBe('Super Sixes');
  });
});

describe('the library names are the single source', () => {
  it('a label change in sideGames.ts flows through', () => {
    // Proves the label is read, not copied. If this module ever grows
    // its own name table, these two diverge and this fails.
    for (const wire of gameTypeWires()) {
      const r = resolveGameType(wire);
      expect(r.label).toBe(sideGameBySlug(r.slug!)!.name);
    }
  });
});

describe('the settled bunker vocabulary', () => {
  // Those two values crossed over on 2026-10-06/07, and the wrong
  // pairing sends a game to another game's rules page. No migration
  // ever ran: Sam asked whether clearing `sandies` would remove what
  // was associated with Bunkers, it would have, so the five live rows
  // were left alone and the new game took `sand_save`.
  it('bunkers is the flat penalty game', () => {
    const r = resolveGameType('bunkers');
    expect(r.label).toBe('Bunkers');
    expect(r.href).toBe('/side-games/bunkers');
  });

  it('bunker_hunt is Bunker Hunt, in both spellings', () => {
    expect(resolveGameType('bunker_hunt').label).toBe('Bunker Hunt');
    expect(resolveGameType('bunkerHunt').label).toBe('Bunker Hunt');
    expect(resolveGameType('bunker_hunt').href)
      .toBe('/side-games/bunker-hunt');
  });

  it('the legacy sandies still resolves, to the flat penalty game', () => {
    // Five live bets depend on this and it does not expire.
    expect(LEGACY_ALIASES.sandies).toBe('bunkers');
    expect(resolveGameType('sandies').label).toBe('Bunkers');
    expect(resolveGameType('sandies').href).toBe('/side-games/bunkers');
  });

  it('the two games never collapse into one', () => {
    expect(resolveGameType('bunkers').slug)
      .not.toBe(resolveGameType('bunker_hunt').slug);
    expect(resolveGameType('sandies').slug)
      .toBe(resolveGameType('bunkers').slug);
  });

  it('sand_save is reserved and resolves to nothing yet', () => {
    // The Sandies game is not built. Resolving its name to some other
    // game is the exact bug the reservation guards against.
    expect(RESERVED_WIRES.has('sand_save')).toBe(true);
    expect(slugForWire('sand_save')).toBeNull();
  });

  it('no reserved value is already claimed', () => {
    for (const reserved of RESERVED_WIRES) {
      expect(gameTypeWires()).not.toContain(reserved);
      expect(LEGACY_ALIASES[reserved]).toBeUndefined();
    }
  });
});
