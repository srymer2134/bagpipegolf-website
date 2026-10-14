/**
 * How `/join/<raw>` classifies what it was given.
 *
 * Extracted from the page so it can be tested: a server-rendered
 * `.astro` cannot be unit-tested, and this branch silently broke every
 * invite link we ever emailed.
 *
 * 2026-10-13 — the page accepted only a UUID-shaped token, while the
 * API mints `crypto.randomBytes(16).toString('hex')`: 32 hex
 * characters, no dashes (fairwayiq-api `routes/leagues.ts:123` and
 * `routes/tournaments.ts:937`). So a real invite was classified
 * `invalid` and shown "That link doesn't look right" — the API was
 * never even called. The email was correct; the destination rejected
 * it.
 */
export type JoinKind = 'invite' | 'code' | 'invalid';

/** Legacy / app deep-link form. Kept because it costs nothing. */
const UUID_SHAPE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** What the API actually mints today. */
const HEX_TOKEN_SHAPE = /^[0-9a-f]{32}$/i;

/** A shared 6-character join code, typed by hand. */
const CODE_SHAPE = /^[A-Za-z0-9]{6}$/;

export function classifyJoinParam(raw: string | null | undefined): JoinKind {
  const v = (raw ?? '').trim();
  if (UUID_SHAPE.test(v) || HEX_TOKEN_SHAPE.test(v)) return 'invite';
  if (CODE_SHAPE.test(v)) return 'code';
  return 'invalid';
}

/**
 * Is this an invite token (as opposed to a 6-char join code)?
 *
 * Exists so the page and the accept proxy cannot drift. They already
 * did: #163 widened the PAGE to accept the 32-hex token the API mints,
 * and `/api/invites/[token]/accept` kept its own `/^[0-9a-fA-F-]{36}$/`
 * gate. The result was a page that rendered "You're invited" correctly
 * and an Accept button that returned "Missing or malformed invite
 * token" — a half-fix, which reads worse to a user than the original
 * break because it looks like it should work.
 */
export function isInviteToken(raw: string | null | undefined): boolean {
  return classifyJoinParam(raw) === 'invite';
}
