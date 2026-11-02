// ============================================================
// Public pages read the scrubbed view; editors read the table
// ============================================================
// One-run plan 1.2 (Flutter migration 20261119). `tournaments_public`
// replaces every account id but the viewer's own with a per-tournament
// hash. That is what a page anyone can open must read — and exactly what
// an editor must NOT read, because the editors write `players` back and
// would store the hashes over the real ids.
//
// After 1.3 drops the two `qual true` policies, a public page left on the
// table renders "Not found" for everyone but the owner. Both mistakes are
// silent at build time, so this pins each file to its door.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

const VIEW_READERS = [
  'pages/app/tournaments/[id]/index.astro',
  'pages/app/tournaments/[id]/leaderboard.astro',
  'pages/app/tournaments/[id]/scorecard.astro',
  'lib/paymentsRoutes.ts',
  'pages/api/leagues/[id]/events.ts',
];

const EDITORS = [
  'pages/app/tournaments/[id]/manage.astro',
  'pages/app/tournaments/[id]/pairings.astro',
  'pages/app/tournaments/[id]/competitions.astro',
  'pages/api/tournaments/[id]/competition-config.ts',
  'pages/api/tournaments/[id]/competitions.ts',
  'pages/api/tournaments/[id]/duplicate.ts',
  'pages/api/tournaments/[id]/pairings.ts',
  'pages/api/tournaments/[id]/rounds.ts',
];

describe('tournament read doors', () => {
  it.each(VIEW_READERS)('%s reads the scrubbed view, never the table', (rel) => {
    const src = read(rel);
    expect(/getTournamentView|from\('tournaments_public'\)/.test(src)).toBe(true);
    expect(src).not.toMatch(/getPublicTournament\(/);
    expect(src).not.toMatch(/from\('tournaments'\)/);
  });

  // Mixed file: the bind picker (`fetchMyTournaments`) is owner-scoped and
  // stays on the table; the schedule's bound-event lookup is not.
  it('leagueEvents fetchBoundTournaments reads the view', () => {
    const src = read('lib/leagueEvents.ts');
    const body = src.slice(src.indexOf('export async function fetchBoundTournaments'),
      src.indexOf('export async function fetchBoundTournaments') + 800);
    expect(body).toMatch(/from\('tournaments_public'\)/);
  });

  it.each(EDITORS)('%s reads the table, never the scrubbed view', (rel) => {
    const src = read(rel);
    expect(src).not.toMatch(/getTournamentView|tournaments_public/);
  });
});
