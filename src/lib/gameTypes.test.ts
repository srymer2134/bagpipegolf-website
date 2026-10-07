import { describe, expect, it } from 'vitest';
import {
  BUNKERS_IS_BUNKER_HUNT,
  EXPECTED_GAME_TYPE_COUNT,
  GAME_TYPE_COUNT,
  gameTypeLabels,
  gameTypeWires,
  resolveGameType,
  resolveGameTypes,
  slugForWireInEra,
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
  // The whole reason this is a table. `GameType.sandies` is displayed
  // as "Bunkers" and `GameType.bunkers` is "Bunker Hunt", so deriving a
  // slug from the wire text sends Bunker Hunt to the wrong rules.
  it('wire "bunkers" is Bunker Hunt', () => {
    const r = resolveGameType('bunkers');
    expect(r.label).toBe('Bunker Hunt');
    expect(r.href).toBe('/side-games/bunker-hunt');
  });

  it('wire "sandies" is Bunkers', () => {
    const r = resolveGameType('sandies');
    expect(r.label).toBe('Bunkers');
    expect(r.href).toBe('/side-games/bunkers');
  });

  it('and they are different games', () => {
    expect(resolveGameType('bunkers').slug)
      .not.toBe(resolveGameType('sandies').slug);
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
    expect(old('bunkers')).toBe('bunkers');          // not "Bunker Hunt"
    expect(old('matchPlay')).toBe('matchPlay');      // untouched
    expect(resolveGameType('bunkers').label).toBe('Bunker Hunt');
    expect(resolveGameType('matchPlay').label).toBe('Match Play');
  });
});

describe('resolveGameTypes on a real row', () => {
  it('maps a list, keeping order', () => {
    const out = resolveGameTypes(['skins', 'bunkers', 'matchPlay']);
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

describe('the sandies -> bunkers -> bunker_hunt rename, both eras', () => {
  // Sam, 2026-10-06: rename the stored values so `sandies` is free for
  // a new game. The two renames chain, so `bunkers` means a different
  // game before and after. Both eras are asserted here so the flip of
  // `BUNKERS_IS_BUNKER_HUNT` cannot quietly swap two games' rules.
  const BEFORE = true;
  const AFTER = false;

  it('before the migration: sandies is the flat penalty, bunkers is Bunker Hunt', () => {
    // Ground truth 2026-10-06 on the live database: 5 bets and 6
    // bagpipe.games rows hold `sandies`; nothing holds `bunkers`.
    expect(slugForWireInEra('sandies', BEFORE)).toBe('bunkers');
    expect(slugForWireInEra('bunkers', BEFORE)).toBe('bunker-hunt');
  });

  it('after the migration: bunkers is the flat penalty, bunker_hunt is Bunker Hunt', () => {
    expect(slugForWireInEra('bunkers', AFTER)).toBe('bunkers');
    expect(slugForWireInEra('bunker_hunt', AFTER)).toBe('bunker-hunt');
    expect(slugForWireInEra('bunkerHunt', AFTER)).toBe('bunker-hunt');
  });

  it('the new spelling already resolves before the migration', () => {
    // A newer client build can write `bunker_hunt` into a row before
    // the migration rewrites anything. The site must not show that as
    // an unknown game.
    expect(slugForWireInEra('bunker_hunt', BEFORE)).toBe('bunker-hunt');
    expect(slugForWireInEra('bunkerHunt', BEFORE)).toBe('bunker-hunt');
  });

  it('the old spelling still resolves after the migration', () => {
    // Any row the migration missed, and any client that predates it.
    expect(slugForWireInEra('sandies', AFTER)).toBe('bunkers');
  });

  it('the two games never collapse into one, in either era', () => {
    for (const era of [BEFORE, AFTER]) {
      const flat = slugForWireInEra(era ? 'sandies' : 'bunkers', era);
      const hunt = slugForWireInEra(era ? 'bunkers' : 'bunker_hunt', era);
      expect(flat).toBe('bunkers');
      expect(hunt).toBe('bunker-hunt');
      expect(flat).not.toBe(hunt);
    }
  });

  it('the live module agrees with the era it declares', () => {
    for (const wire of gameTypeWires()) {
      expect(resolveGameType(wire).slug, wire)
        .toBe(slugForWireInEra(wire, BUNKERS_IS_BUNKER_HUNT));
    }
  });
});
