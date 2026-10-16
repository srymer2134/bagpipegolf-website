// Creating league invites from the browser, in chunks.
//
// Shared by both roster panels — the typed-email one and the CSV
// import — so there is one answer to "what happens when invite 30 of
// 200 fails", rather than two that drift.
//
// WHY CHUNK AT ALL. `POST /api/leagues/:id/invites` loops over the
// array serially on Railway, with two or three queries plus a SendGrid
// call per address. A 200-name import in one request is a request that
// runs for a minute and dies at some edge timeout we do not control,
// having written an unknown prefix of the roster. The website route
// caps a request at 50; this chunks at 25, which keeps a slow chunk a
// delay rather than a failure.
//
// WHY A FAILED CHUNK DOES NOT DISCARD THE EARLIER ONES. The upstream
// route is idempotent per (league_id, lower(email)) — a unique index,
// not an application check — so re-running the whole file after a
// failure creates nothing twice. Keeping the successful results and
// reporting the error is therefore strictly better than rolling back a
// partial import we cannot roll back anyway.

/** What the API returns per address. `sent` is SendGrid's answer, and
 *  it is false whenever the mail provider is unconfigured — which is
 *  why no caller may render it as "sent" without checking. */
export type InviteResult = {
  email: string;
  token?: string;
  sent: boolean;
  error?: string;
};

export const INVITE_CHUNK_SIZE = 25;

/** Split a list into request-sized batches. Pure, so the boundary
 *  arithmetic is tested rather than inspected. */
export function chunkEmails(emails: string[], size = INVITE_CHUNK_SIZE): string[][] {
  if (size < 1) throw new RangeError('chunk size must be at least 1');
  const out: string[][] = [];
  for (let i = 0; i < emails.length; i += size) out.push(emails.slice(i, i + size));
  return out;
}

export type SendInvitesOutcome = {
  /** Every per-address result we got back, across all chunks. */
  invites: InviteResult[];
  /** Set when a chunk failed outright. The remaining chunks are not
   *  attempted: a 403 or a 500 repeats for all of them. */
  failed: string | null;
};

export async function sendInvites(
  leagueId: string,
  emails: string[],
  fetchImpl: typeof fetch = fetch,
): Promise<SendInvitesOutcome> {
  const invites: InviteResult[] = [];
  let failed: string | null = null;

  for (const slice of chunkEmails(emails)) {
    try {
      const res = await fetchImpl(`/api/leagues/${encodeURIComponent(leagueId)}/invites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails: slice }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        invites?: InviteResult[];
        error?: string;
      };
      if (!res.ok) {
        failed = body.error ?? 'Could not create those invites.';
        break;
      }
      invites.push(...(body.invites ?? []));
    } catch {
      failed = 'Could not reach the server.';
      break;
    }
  }

  return { invites, failed };
}

/** How many of these results had their email handed to the mail
 *  provider. Everything else was created and not emailed — the panel
 *  has to say so, and this is the only number it may say it with. */
export function emailedCount(invites: InviteResult[]): number {
  return invites.filter((r) => !r.error && r.sent).length;
}

/** Created, but no email went out. These need a link the director can
 *  deliver themselves or they are unreachable rows. */
export function unsentCount(invites: InviteResult[]): number {
  return invites.filter((r) => !r.error && !r.sent).length;
}

/** Not created at all. */
export function failedCount(invites: InviteResult[]): number {
  return invites.filter((r) => Boolean(r.error)).length;
}
