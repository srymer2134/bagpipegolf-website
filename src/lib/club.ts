// Club management on the website (Club plan B2) — the pure half.
//
// /app/club posts every button to ONE route, /api/clubs/action, with an
// `action` field. This file turns (action, form fields) into exactly one
// API call, or refuses. It is the allowlist: an action not named here, or a
// field that fails its check, never reaches the API. The API's SQL
// functions are the authorization (they take the signed-in user as the
// actor); this file only keeps garbage and surprises out.
//
// The invite token is the one secret on these pages. It arrives in the
// invite email's link, is posted once to `accept`, and is never echoed back
// into a URL or the page.

export type ClubCall = {
  method: 'POST' | 'DELETE';
  path: string;
  body?: Record<string, string>;
};

export type ClubAction =
  | 'create'
  | 'invite'
  | 'revoke'
  | 'accept'
  | 'remove'
  | 'leave'
  | 'transfer'
  | 'attach'
  | 'detach'
  | 'dissolve';

const ID = /^[A-Za-z0-9_-]{1,128}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN = /^[0-9a-f]{16,128}$/i;

function field(form: { get(k: string): unknown }, k: string): string {
  const v = form.get(k);
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * The API call for a form post, or a refusal code for the page to show.
 * `me` is the signed-in user — used only so "leave" can name yourself.
 */
export function clubCall(
  form: { get(k: string): unknown },
  me: string,
): ClubCall | { refuse: string } {
  const action = field(form, 'action') as ClubAction;
  const org = field(form, 'org_id');
  const needOrg = (): boolean => ID.test(org);
  const enc = encodeURIComponent;

  switch (action) {
    case 'create': {
      const name = field(form, 'name');
      if (!name || name.length > 120) return { refuse: 'club_name_required' };
      return { method: 'POST', path: '/api/clubs', body: { name } };
    }
    case 'invite': {
      const email = field(form, 'email').toLowerCase();
      if (!needOrg()) return { refuse: 'club_not_found' };
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return { refuse: 'email_required' };
      return { method: 'POST', path: `/api/clubs/${enc(org)}/invites`, body: { email } };
    }
    case 'revoke': {
      const invite = field(form, 'invite_id');
      if (!UUID.test(invite)) return { refuse: 'invite_invalid' };
      return { method: 'DELETE', path: `/api/clubs/invites/${enc(invite)}` };
    }
    case 'accept': {
      const token = field(form, 'token');
      if (!TOKEN.test(token)) return { refuse: 'invite_invalid' };
      return { method: 'POST', path: '/api/clubs/accept', body: { token } };
    }
    case 'remove':
    case 'leave': {
      const user = action === 'leave' ? me : field(form, 'user_id');
      if (!needOrg()) return { refuse: 'club_not_found' };
      if (!UUID.test(user)) return { refuse: 'club_member_not_found' };
      return { method: 'DELETE', path: `/api/clubs/${enc(org)}/members/${enc(user)}` };
    }
    case 'transfer': {
      const user = field(form, 'user_id');
      if (!needOrg()) return { refuse: 'club_not_found' };
      if (!UUID.test(user)) return { refuse: 'club_transfer_not_admin' };
      return { method: 'POST', path: `/api/clubs/${enc(org)}/transfer`, body: { user_id: user } };
    }
    case 'attach':
    case 'detach': {
      const league = field(form, 'league_id');
      if (!needOrg()) return { refuse: 'club_not_found' };
      if (!ID.test(league)) return { refuse: 'league_not_found' };
      return action === 'attach'
        ? { method: 'POST', path: `/api/clubs/${enc(org)}/leagues`, body: { league_id: league } }
        : { method: 'DELETE', path: `/api/clubs/${enc(org)}/leagues/${enc(league)}` };
    }
    case 'dissolve': {
      if (!needOrg()) return { refuse: 'club_not_found' };
      if (field(form, 'confirm') !== 'yes') return { refuse: 'confirm_required' };
      return { method: 'DELETE', path: `/api/clubs/${enc(org)}` };
    }
    default:
      return { refuse: 'unknown_action' };
  }
}

/** The sentence /app/club shows for `?club=<code>`. Never the raw code. */
/**
 * Where /api/clubs/action sends the browser afterwards.
 *
 * It used to be the constant '/app/club', which was invisible while anyone
 * had exactly one club — the list page forwards straight to it — and wrong
 * the moment they had two: inviting an admin to club B landed you on the
 * list. It is also wrong for any button that lives somewhere else, which
 * /app/billing's "Attach to your club" now does.
 *
 * STILL NOT AN OPEN REDIRECT. The caller's `back` is matched against a
 * closed pattern — /app/billing, /app/club, /app/club/<id> — and anything
 * else is discarded rather than followed. With no `back`, an action that
 * names an org returns to THAT club's page, which is the fix for the
 * two-club case.
 */
const BACK_OK = /^\/app\/(billing|club(\/[A-Za-z0-9_-]{1,128})?)$/;

export function clubBack(form: { get(k: string): unknown }): string {
  const asked = field(form, 'back');
  if (BACK_OK.test(asked)) return asked;
  const org = field(form, 'org_id');
  return ID.test(org) ? `/app/club/${encodeURIComponent(org)}` : '/app/club';
}

export function clubMessage(code: string | null | undefined): { text: string; good: boolean } | null {
  if (!code) return null;
  const good: Record<string, string> = {
    created: 'Your club is set up. Invite your admins and attach your leagues.',
    invited: 'Invite sent. It’s good for 14 days.',
    invited_not_emailed: 'Invite created, but the email didn’t send. Remove it and try again.',
    revoked: 'Invite cancelled.',
    joined: 'You’re an admin of the club now. Attach your leagues below.',
    removed: 'Admin removed. Their leagues are no longer covered by the club.',
    left: 'You left the club. Your leagues are no longer covered by it.',
    transferred: 'The club has a new owner.',
    transferred_paying:
      'The club has a new owner. Its Club plan is still billed to you, and the club stays covered while it’s active. To stop paying, cancel it in Billing. To move it to the new owner, email hello@bagpipegolf.com.',
    attached: 'League attached.',
    detached: 'League detached. It’s back on its own plan.',
    dissolved: 'Club dissolved. Your leagues are back on their own plans.',
  };
  const bad: Record<string, string> = {
    club_name_required: 'Give the club a name.',
    email_required: 'That doesn’t look like an email address.',
    club_seats_full: 'All 4 admin seats are taken (the owner counts). Remove someone or cancel an invite first.',
    club_already_member: 'That person is already an admin.',
    club_not_owner: 'Only the club’s owner can do that.',
    invite_invalid: 'That invite has expired, been used, or been cancelled. Ask the club’s owner for a new one.',
    invite_email_mismatch: 'This invite was sent to a different email. Sign in with that address to accept it.',
    club_owner_cannot_leave: 'The owner can’t leave. Hand the club to another admin first, or dissolve it.',
    club_transfer_not_admin: 'Pick one of the club’s current admins.',
    club_transfer_paid: 'A club with an active plan can’t change owner here yet. Email hello@bagpipegolf.com.',
    club_not_sole_member: 'Remove the other admins before dissolving the club.',
    club_has_plan: 'Cancel the Club plan before dissolving the club.',
    org_id_no_consent: 'Only a league’s owner can attach it to a club.',
    org_id_not_admin: 'You need an admin seat in the club for that.',
    league_not_found: 'That league couldn’t be found.',
    club_not_found: 'That club couldn’t be found.',
    club_member_not_found: 'That admin couldn’t be found.',
    confirm_required: 'Tick the box to confirm.',
  };
  if (good[code]) return { text: good[code], good: true };
  return { text: bad[code] ?? 'Something went wrong, and nothing was changed. Please try again.', good: false };
}

/**
 * The `?club=` code to show after a successful action. `youStillPay`: a
 * transfer of a paid club leaves the plan on the payer's card (20261214), so
 * the outgoing owner is told they are still paying.
 */
export function clubDone(action: string, emailed?: boolean, youStillPay?: boolean): string {
  switch (action) {
    case 'create': return 'created';
    case 'invite': return emailed === false ? 'invited_not_emailed' : 'invited';
    case 'revoke': return 'revoked';
    case 'accept': return 'joined';
    case 'remove': return 'removed';
    case 'leave': return 'left';
    case 'transfer': return youStillPay ? 'transferred_paying' : 'transferred';
    case 'attach': return 'attached';
    case 'detach': return 'detached';
    case 'dissolve': return 'dissolved';
    default: return 'error';
  }
}
