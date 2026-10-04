// ============================================================
// `?next=` — an allow-list, not a prefix check
// ============================================================
// The sign-in and sign-up pages take a `next` query param and redirect
// to it after auth. The guard was:
//
//     next.startsWith('/') ? next : '/app'
//
// which is an OPEN REDIRECT. `//evil.com` starts with `/`, and a
// browser reads a protocol-relative URL as a different ORIGIN — so
// `/login?next=//evil.com` sent a freshly-signed-in user to an
// attacker's page, from a link that showed our domain. That is the
// credential-phishing shape: the victim has just typed a password on a
// real bagpipegolf.com page and is then handed somewhere else.
//
// The backslash spelling is the same trick; several browsers normalise
// it to a double slash.
//
// Found by Patrick's 2026-10-04 platform audit (F12 / PA-S6).

/// A safe same-origin destination, or the fallback.
///
/// Accepts only a path on THIS origin: it must start with a single
/// slash, must not start with a double slash or slash-backslash (both
/// read as another origin), and must not smuggle a scheme or any
/// control character. Anything else falls back rather than being
/// repaired — a half-trusted redirect target is not worth guessing at.
export function safeNext(next: unknown, fallback = '/app'): string {
  if (typeof next !== 'string') return fallback;

  // Control characters and whitespace can split a header or defeat the
  // prefix checks below once a browser normalises them.
  // Written as escape sequences on purpose: an earlier version of
  // this file carried the raw bytes, which any reformat would eat,
  // silently narrowing the guard to whitespace only.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\s]/.test(next)) return fallback;

  if (!next.startsWith('/')) return fallback;

  // Protocol-relative, in both spellings a browser accepts.
  if (next.startsWith('//') || next.startsWith('/\\')) return fallback;

  // A scheme after the leading slashes means something is being
  // smuggled; refuse rather than sanitise.
  if (/^\/+[a-z][a-z0-9+.-]*:/i.test(next)) return fallback;

  return next;
}
