// Password reset — the half of the flow that lands back on the website.
//
// /forgot-password asks Supabase to email a link whose redirect is
// /reset-password. Supabase verifies the one-time token, then sends the
// browser here with either `?code=` (PKCE — what @supabase/ssr requests)
// or, if the email template is ever switched to a token-hash link,
// `?token_hash=&type=recovery`. The page trades that for a session and
// shows the new-password form.
//
// Before 2026-10-13 the redirect was /login, which ignores both, so a
// reset link could never work on the website — and because /login was
// not on Supabase's redirect allow-list, the link fell back to the
// project's Site URL, http://localhost:3000.

/** Same rule as /signup. */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * Short-lived marker set only after a recovery link is exchanged. The
 * POST requires it, so an ordinary signed-in session cannot reach the
 * form and change the password without proving it opened the email.
 */
export const RECOVERY_COOKIE = 'bp_pw_recovery';
export const RECOVERY_COOKIE_MAX_AGE_S = 15 * 60;

export type RecoveryParams =
  | { kind: 'code'; code: string }
  | { kind: 'token_hash'; tokenHash: string }
  | { kind: 'error'; message: string }
  | { kind: 'none' };

export function readRecoveryParams(url: URL): RecoveryParams {
  const p = url.searchParams;
  const err = p.get('error_description') ?? p.get('error');
  if (err) return { kind: 'error', message: err };
  const code = p.get('code');
  if (code) return { kind: 'code', code };
  const tokenHash = p.get('token_hash');
  if (tokenHash && (p.get('type') ?? 'recovery') === 'recovery') {
    return { kind: 'token_hash', tokenHash };
  }
  return { kind: 'none' };
}

/** Returns a user-facing error, or null when the pair is acceptable. */
export function validateNewPassword(password: string, confirm: string): string | null {
  if (!password || !confirm) return 'Enter your new password twice.';
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password !== confirm) return "The two passwords don't match.";
  return null;
}

export const EXPIRED_LINK_MESSAGE =
  'This reset link has expired or was already used. Links work once, ' +
  'in the same browser you requested them from. Request a new one below.';
