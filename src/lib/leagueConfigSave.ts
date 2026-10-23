// The whole job of `POST /api/leagues/[id]/config`, with the Supabase
// client injected so it is unit-tested (`leagueConfigSave.test.ts`).
// The route file only wires it — same split as `saveOwnParticipation`.
//
// Order, each a guard:
//   1. the body is an object and names at least one generated column;
//   2. the league exists, and the caller OWNS it (`leagues.user_id`) —
//      checked here so a co-commissioner gets a clear 403 before any
//      validation, not after;
//   3. the patch is a DIFF against the current row;
//   4. the merged row passes the database's generated cross-field
//      rules, and the season dues columns pass `validateDuesPatch`
//      (their CHECK is not in the generated rules);
//   5. the write, as the signed-in user. RLS (`Owner manages own
//      leagues`, ALL, `user_id = auth.uid()`) is the second lock: a
//      non-owner's UPDATE matches zero rows, which is a 403 too.

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  LEAGUE_CONFIG_FIELDS,
  validateLeagueConfigRow,
  type CreateLeagueProblem,
} from './leagueCreate';
import { buildConfigPatch } from './leagueConfigForm';
import { validateDuesPatch } from './leagueDues';

export type SaveResult = { status: number; body: Record<string, unknown> };

/** Every column this route will ever write. Anything else in the body
 *  is ignored — not rejected, because a future client sending a field
 *  this deploy does not know about should not fail the whole save. */
export const WRITABLE_CONFIG_COLUMNS: ReadonlySet<string> =
  new Set(LEAGUE_CONFIG_FIELDS.map((f) => f.name));

const OWNER_ONLY = 'Only the league owner can change these settings.';

export async function saveLeagueConfig(
  supabase: SupabaseClient,
  leagueId: string,
  userId: string,
  body: unknown,
): Promise<SaveResult> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { status: 400, body: { error: 'Malformed request.' } };
  }
  const submitted: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    if (WRITABLE_CONFIG_COLUMNS.has(k)) submitted[k] = v;
  }
  if (Object.keys(submitted).length === 0) {
    return { status: 400, body: { error: 'Nothing to save.' } };
  }

  // Read the current row first. Two reasons, both load-bearing: the
  // patch is a DIFF (so a save never rewrites a column the director
  // did not touch), and the cross-field rules have to be checked
  // against the MERGED row — `absent_rule` alone is legal or illegal
  // only in the company of `week_format`. `user_id` rides along for
  // the owner check; it is never in the patch (not a config column).
  const cols = [...WRITABLE_CONFIG_COLUMNS, 'user_id'].join(', ');
  const { data: current, error: readErr } = await supabase
    .from('leagues')
    .select(cols)
    .eq('id', leagueId)
    .maybeSingle();
  if (readErr) {
    console.error('[leagueConfigSave:read]', readErr);
    return { status: 500, body: { error: 'Could not read this league.' } };
  }
  if (!current) return { status: 404, body: { error: 'League not found.' } };

  const { user_id: ownerId, ...currentRow } = current as unknown as Record<string, unknown>;
  if (ownerId !== userId) return { status: 403, body: { error: OWNER_ONLY } };

  const patch = buildConfigPatch(submitted, currentRow);
  if (Object.keys(patch).length === 0) {
    return { status: 200, body: { ok: true, changed: [], message: 'No changes.' } };
  }

  const problems: CreateLeagueProblem[] = validateLeagueConfigRow({
    ...currentRow,
    ...patch,
  });
  const duesProblem = validateDuesPatch(patch);
  if (duesProblem) problems.unshift(duesProblem);
  if (problems.length) {
    return { status: 400, body: { error: problems[0].message, problems } };
  }

  const { data, error } = await supabase
    .from('leagues')
    .update(patch)
    .eq('id', leagueId)
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('[leagueConfigSave:write]', error);
    // 23514 = a CHECK we did not mirror. It should be unreachable —
    // validateLeagueConfigRow + validateDuesPatch implement the same
    // constraints — so it means the generated schema is behind the
    // database. Say that, rather than "something went wrong".
    if (error.code === '23514') {
      return {
        status: 400,
        body: {
          error:
            'The database rejected these settings. The web form may be out of ' +
            'date with the league rules — please set this in the app and tell us.',
        },
      };
    }
    if (error.code === '23502') {
      return { status: 400, body: { error: 'A required setting cannot be blank.' } };
    }
    return { status: 500, body: { error: 'Could not save these settings.' } };
  }
  // RLS matched zero rows: not the owner, whatever the read said.
  if (!data) return { status: 403, body: { error: OWNER_ONLY } };

  return { status: 200, body: { ok: true, changed: Object.keys(patch).sort() } };
}
