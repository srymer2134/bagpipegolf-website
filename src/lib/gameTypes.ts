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
  // ⚠️ These two crossed over on 2026-10-06/07 and the wrong pairing
  //    sends a game to another game's rules. Read LEGACY_ALIASES below
  //    before touching either line.
  bunkers: 'bunkers',
  bunker_hunt: 'bunker-hunt',
  modified_stableford: 'modified-stableford',
  deuces: 'deuces',
  wolf_hammer: 'wolf-hammer',
  lost_balls: 'lost-balls',
};

/**
 * Wire values an older client still writes, and the game they mean.
 *
 * ── The settled vocabulary, as of 2026-10-07 ────────────────────
 *
 *     'bunkers'      the flat per-hole bunker penalty  (label "Bunkers")
 *     'bunker_hunt'  the bimodal holder/count game     (label "Bunker Hunt")
 *     'sandies'      LEGACY — the same game as 'bunkers'
 *
 * Those two crossed over. `'bunkers'` was Bunker Hunt's value until
 * 2026-10-06; the flat penalty game stored `'sandies'` while being
 * labelled "Bunkers" for months. `fairwayiq-flutter` #1396 and #1399
 * moved both so the stored value matches the label.
 *
 * ── 🔒 `'sandies'` IS PERMANENT ─────────────────────────────────
 *
 * Five live bets and six `bagpipe.games` rows still hold it, and they
 * are real Bunkers games. **No migration ever ran.** Two were written
 * and both abandoned: Sam asked whether clearing `sandies` would remove
 * what was associated with Bunkers, it would have, so the rows were
 * left alone and the new game took `sand_save` instead.
 *
 * So this alias is the only thing resolving those five bets. It does
 * not expire.
 *
 * ── The residual ambiguity, stated rather than hidden ───────────
 *
 * A `'bunkers'` row written by App Store build 341 meant Bunker Hunt,
 * and nothing in the value distinguishes it from one written since.
 * Bounded by Bunker Hunt never having been played — 0 bets, 0 spine
 * games on dev and prod, verified 2026-10-06 — so in practice no such
 * row exists. Resolved in favour of today.
 *
 * There is no era switch any more. There was one while a migration was
 * pending; it is gone with the migration, and `gameTypes.test.ts` keeps
 * both the live and the legacy spelling asserted instead.
 */
export const LEGACY_ALIASES: Record<string, string> = {
  sandies: 'bunkers',
};

/** Reserved for the Sandies game, which does not exist yet. Mirrors
 *  `GameTypeValue.reservedWireValues` in the Flutter client — the
 *  traditional sandie, a par save FROM a bunker. `sandies` itself is
 *  permanently unavailable, hence the different name. */
export const RESERVED_WIRES: ReadonlySet<string> = new Set(['sand_save']);

/** `low_ball_high_ball` → `lowBallHighBall`, matching Dart's `.name`. */
export function snakeToCamel(wire: string): string {
  return wire.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

/** Every spelling that resolves, live plus legacy. */
const LOOKUP: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const [wire, slug] of Object.entries({
    ...WIRE_TO_SLUG,
    ...LEGACY_ALIASES,
  })) {
    out[wire] = slug;
    out[snakeToCamel(wire)] = slug;
  }
  return out;
})();

/** Slug for a wire value, live or legacy. Null when unknown. */
export function slugForWire(raw: string): string | null {
  const wire = String(raw ?? '').trim();
  return LOOKUP[wire] ?? LOOKUP[wire.toLowerCase()] ?? null;
}

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
  const slug = slugForWire(wire);
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
