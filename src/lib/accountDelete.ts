// Web account deletion — the second door Google Play requires.
//
// Play's Data safety rules ask for a web page where someone can get their
// account deleted without reinstalling the app. `/delete-account` explains
// both doors; the web one is the "Delete account" section on
// `/app/profile`, which posts to `api/account/delete.ts`. That route
// proxies `DELETE /api/users/me` on Railway — the exact route the app's
// Profile → Delete Account calls — so nothing about what gets deleted is
// decided here.

/** What the user has to type before the button does anything. */
export const CONFIRM_PHRASE = 'DELETE';

/** Case-sensitive on purpose: typing it in capitals is the deliberate act. */
export function confirmMatches(input: unknown): boolean {
  return typeof input === 'string' && input.trim() === CONFIRM_PHRASE;
}

/** Where the browser lands once the account is gone. */
export const DELETED_LANDING = '/delete-account?deleted=1';
