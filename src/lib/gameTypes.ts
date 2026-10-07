// ============================================================
// The app's game-type values → a name a reader recognises
// ============================================================
// Sam, 2026-10-06: "Bunker Hunt is missing from the website."
//
// The side-games LIBRARY has it — a full rules page, and a card in the
// catalog. What was missing is the only place it matters once a game
// actually exists: `/app/side-games`, the signed-in list of your games
// and the detail view of one. Both of those named a game like this:
//
//     (bet.game_types ?? []).map((g) => g.replace(/_/g, ' '))
//
// So a real Bunker Hunt game rendered as **"bunkers"** — which is not
// its name, and worse, IS the name of a different game. The app has two
// sand bets and the wire values cross over:
//
//     wire `bunkers`  → "Bunker Hunt"   (the bimodal holder/count game)
//     wire `sandies`  → "Bunkers"       (the flat per-hole penalty)
//
// `GameType.sandies` was renamed to "Bunkers" for users and kept its
// old wire value; `GameType.bunkers` shipped later as Bunker Hunt. Any
// scheme that derives a slug from the wire value by text alone sends a
// Bunker Hunt game to the Bunkers rules page — the wrong rules, told
// confidently. That is why this is a table and not a transform.
//
// The underscore strip was wrong twice over, because the app writes the
// **camelCase** spelling on the path that reaches `bets.game_types`
// (`ApiService._gameToApiPatch`: `g.gameTypes.map((t) => t.name)`),
// while `GameTypeValue.value` defines a snake_case spelling for storage
// and `GameType.fromValue` accepts either. So rows carry both shapes,
// and a `_`-strip did nothing at all to `matchPlay` or
// `bingoBangoBongo`. Both spellings resolve here, the camel one derived
// from the snake one rather than listed twice.
//
// NAMES ARE NOT DUPLICATED HERE. The display name comes from
// `sideGames.ts`, which already carries the reader-facing name for all
// 33 games. This module owns one fact only: which wire value is which
// game.

import { sideGames, sideGameBySlug, type SideGame } from './sideGames';
import generated from './__generated__/formats.json';

/**
 * Wire value (snake_case, as `GameTypeValue.value` defines it) → the
 * `sideGames.ts` slug for that game.
 *
 * Hand-maintained on purpose, and guarded by `gameTypes.test.ts`:
 * every slug must exist, no slug may be claimed twice, and the count
 * must equal the generated `sideGameCount`. Adding a 34th game fails
 * the test until it is listed.
 */
const WIRE_TO_SLUG: Record<string, string> = {
  nassau: 'nassau',
  skins: 'skins',
  stableford: 'stableford',
  match_play: 'match-play',
  wolf: 'wolf',
  bingo_bango_bongo: 'bingo-bango-bongo',
  rabbits: 'rabbits',
  hammer: 'hammer',
  low_ball_high_ball: 'low-ball-high-ball',
  dots: 'dots',
  vegas: 'vegas',
  six_six_six: 'six-six-six',
  arnies: 'arnies',
  defender: 'defender',
  scotch: 'scotch',
  snake: 'snake',
  aces_deuces: 'aces-and-deuces',
  closeout: 'closeout',
  greenies: 'greenies',
  nines: 'nines',
  banker: 'banker',
  chairman: 'chairman',
  quota: 'quota',
  bloodsome: 'bloodsome',
  round_robin: 'round-robin',
  firs: 'firs',
  girs: 'girs',
  // ⚠️ The crossover. Do not "simplify" either of these two lines.
  sandies: 'bunkers',
  bunkers: 'bunker-hunt',
  modified_stableford: 'modified-stableford',
  deuces: 'deuces',
  wolf_hammer: 'wolf-hammer',
  lost_balls: 'lost-balls',
};

/** `low_ball_high_ball` → `lowBallHighBall`, matching Dart's `.name`. */
export function snakeToCamel(wire: string): string {
  return wire.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

/** Both spellings the app writes, resolved to a slug. */
const LOOKUP: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const [wire, slug] of Object.entries(WIRE_TO_SLUG)) {
    out[wire] = slug;
    out[snakeToCamel(wire)] = slug;
    out[wire.toLowerCase()] = slug;
  }
  return out;
})();

export const GAME_TYPE_COUNT = Object.keys(WIRE_TO_SLUG).length;
export const EXPECTED_GAME_TYPE_COUNT: number = generated.sideGameCount;

/** Every wire value this module knows, snake spelling. */
export const gameTypeWires = (): string[] => Object.keys(WIRE_TO_SLUG);

export type ResolvedGameType = {
  /** What the row actually held. */
  wire: string;
  /** Reader-facing name, from the rules library. */
  label: string;
  /** Rules-page slug, when the library has one. */
  slug: string | null;
  /** `/side-games/<slug>`, when there is a page to link to. */
  href: string | null;
};

/**
 * One game type as a reader should see it.
 *
 * An unknown value is NOT dropped and NOT guessed at. A game the
 * website has never heard of still appears in the list, tidied for
 * display, because a player looking at their own game should see all of
 * it — and a silent omission is how "Bunker Hunt is missing" happens in
 * the first place. It simply gets no rules link.
 */
export function resolveGameType(raw: string): ResolvedGameType {
  const wire = String(raw ?? '').trim();
  const slug = LOOKUP[wire] ?? LOOKUP[wire.toLowerCase()] ?? null;
  const game: SideGame | undefined = slug ? sideGameBySlug(slug) : undefined;
  return {
    wire,
    label: game?.name ?? prettifyUnknown(wire),
    slug: game ? slug : null,
    href: game ? `/side-games/${slug}` : null,
  };
}

export function resolveGameTypes(
  raw: Array<string | null | undefined> | null | undefined,
): ResolvedGameType[] {
  return (raw ?? [])
    .filter((g): g is string => typeof g === 'string' && g.trim() !== '')
    .map((g) => resolveGameType(g));
}

/** Just the names, for a dense surface with no room for links. */
export function gameTypeLabels(
  raw: Array<string | null | undefined> | null | undefined,
): string[] {
  return resolveGameTypes(raw).map((g) => g.label);
}

/**
 * Last resort for a value this deploy does not know: split camelCase
 * and snake_case into words and title-case them, so a future 34th game
 * reads as "Bunker Rush" rather than "bunkerRush". Never used for a
 * known game — those take their name from the library.
 */
function prettifyUnknown(wire: string): string {
  const words = wire
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return 'Side game';
  return words
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** The library, for surfaces that want the whole catalog. */
export const allSideGames = (): SideGame[] => sideGames;
