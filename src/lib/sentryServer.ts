/**
 * Server-side Sentry helper for the Cloudflare Worker.
 *
 * `@sentry/astro` handles the browser SDK via the integration in
 * `astro.config.mjs`. This helper covers the OTHER half — errors that
 * happen inside the Worker (middleware, page render, API routes).
 *
 * Idempotent init pattern per Worker instance: Cloudflare reuses V8
 * isolates across requests, so `_inited` short-circuits so we don't
 * re-register hooks on every request. When `SENTRY_DSN` is unset (dev
 * / no Sentry project bound) we no-op silently — matches the Flutter
 * app's guard in `main.dart`.
 *
 * Mirrors the app's Sentry config:
 *   - `sendDefaultPii: false` — no email/IP forwarded
 *   - `tracesSampleRate: 0` — errors only, no perf traces
 *   - `beforeSend` filters dev environments so they don't pollute the
 *     prod project dashboard
 */

import * as Sentry from '@sentry/cloudflare';

let _inited = false;

interface InitOpts {
  dsn?: string;
  environment?: string;
}

/** Lazy init — safe to call from every request. */
export function ensureSentryInit(opts: InitOpts): void {
  if (_inited) return;
  const dsn = (opts.dsn ?? '').trim();
  if (!dsn) {
    // Silent no-op — matches the app's behavior when SENTRY_DSN is
    // absent. Callers can still call `captureServerError` and it will
    // fall through to a console.error only.
    _inited = true;
    return;
  }
  const environment = (opts.environment ?? 'production').trim() || 'production';
  Sentry.init({
    dsn,
    environment,
    tracesSampleRate: 0,
    sendDefaultPii: false,
    beforeSend: (event) => {
      // Drop local dev + preview environments from the prod project's
      // dashboard so the signal-to-noise ratio stays useful. Only
      // 'production' lands.
      if (environment !== 'production') return null;
      return event;
    },
  });
  _inited = true;
}

/**
 * Capture a server-side exception. Safe to call whether or not Sentry
 * is inited — falls through to a console.error when the SDK isn't
 * available so the error is still visible in Cloudflare's Worker logs.
 */
export function captureServerError(
  err: unknown,
  context?: {
    userId?: string | null;
    path?: string;
    tags?: Record<string, string>;
  },
): void {
  if (!_inited) {
    // Best-effort console fallback so an error before init still lands
    // in the Worker's built-in logs. Not sent to Sentry — dropping is
    // preferable to buffering, since a broken init is usually a config
    // problem not a transient blip.
    // eslint-disable-next-line no-console
    console.error('[sentry-uninit]', err, context);
    return;
  }
  Sentry.withScope((scope) => {
    if (context?.path) scope.setTag('path', context.path);
    if (context?.tags) {
      for (const [k, v] of Object.entries(context.tags)) scope.setTag(k, v);
    }
    if (context?.userId) {
      // ID only — email / IP intentionally omitted per sendDefaultPii=false.
      scope.setUser({ id: context.userId });
    }
    Sentry.captureException(err);
  });
}
