import type { APIContext } from 'astro';

// ── Railway API wrapper ─────────────────────────────────────────
//
// Thin fetch helper used by the /api/* proxy routes on the website
// to forward requests to the Railway backend
// (`fairwayiqmobile-production.up.railway.app`). Same base URL the
// mobile app uses; single validation layer between web + phone.
//
// Auth: forwards the signed-in user's Supabase JWT (available on
// `Astro.locals.session.access_token`) as `Authorization: Bearer
// <jwt>`. The Railway `requireAuth` middleware validates it and
// exposes `req.userId` to the route handler — same as the mobile
// call site, so a website-created tournament ends up owned by the
// same user the app would.
//
// Why proxy at all (vs. calling Railway from the browser directly):
//   1. Keeps the JWT out of client-visible network traffic.
//   2. Lets us log/scrub/rate-limit at the edge before hitting
//      Railway, once we care to.
//   3. Same-origin fetches from the site avoid CORS entirely.

export class RailwayApiError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

type RailwayCallInit = {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  body?: unknown;
  query?: Record<string, string | number | undefined>;
};

/**
 * Fetch a Railway endpoint on behalf of the signed-in user.
 *
 * Throws when:
 *   * `RAILWAY_API_URL` is not bound in the runtime env
 *   * The caller is not signed in (no `session.access_token`)
 *   * The upstream returns a non-2xx status (surfaced as
 *     [RailwayApiError] so route handlers can shape a 4xx/5xx
 *     response body appropriately)
 */
export async function callRailway<T = unknown>(
  ctx: APIContext,
  init: RailwayCallInit,
): Promise<T> {
  const env = (ctx.locals as App.Locals).runtime?.env;
  const baseUrl = env?.RAILWAY_API_URL;
  if (!baseUrl || typeof baseUrl !== 'string') {
    throw new RailwayApiError(
      500,
      'RAILWAY_API_URL is not bound in the Worker runtime. ' +
        'Set it in .dev.vars (local) or via wrangler secret / ' +
        'Cloudflare dashboard (prod).',
      null,
    );
  }

  const session = (ctx.locals as App.Locals).session;
  const accessToken = session?.access_token;
  if (!accessToken) {
    throw new RailwayApiError(
      401,
      'Not authenticated — no Supabase access token available.',
      null,
    );
  }

  const url = new URL(init.path, baseUrl);
  if (init.query) {
    for (const [k, v] of Object.entries(init.query)) {
      if (v === undefined) continue;
      url.searchParams.set(k, String(v));
    }
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
  };
  const requestInit: RequestInit = { method: init.method, headers };
  if (init.body !== undefined) {
    headers['content-type'] = 'application/json';
    requestInit.body = JSON.stringify(init.body);
  }

  const res = await fetch(url.toString(), requestInit);
  const contentType = res.headers.get('content-type') ?? '';
  const isJson = contentType.includes('application/json');
  const parsed = isJson ? await res.json().catch(() => null) : await res.text();

  if (!res.ok) {
    const message =
      (isJson && parsed && typeof parsed === 'object' && 'error' in parsed
        ? String((parsed as { error: unknown }).error)
        : null) ??
      `Railway ${init.method} ${init.path} failed with ${res.status}`;
    throw new RailwayApiError(res.status, message, parsed);
  }

  return parsed as T;
}
