import type { APIRoute } from 'astro';

// Server-side proxy so the browser never sees the Supabase access
// token. The Railway `/api/courses/search` endpoint requires a
// Bearer JWT — we grab it from the current SSR session (populated
// by middleware) and forward it upstream. Reimplementing the full
// curated → OpenGolfAPI → GHIN → GolfCourseAPI cascade on the web
// side would duplicate the Railway route's logic and inevitably
// drift.

export const GET: APIRoute = async ({ url, locals }) => {
  const q = url.searchParams.get('q')?.trim() ?? '';
  if (q.length < 2) {
    return new Response(JSON.stringify({ courses: [], source: 'short_query' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }

  const session = (locals as App.Locals).session;
  const accessToken = session?.access_token;
  if (!accessToken) {
    return new Response(JSON.stringify({ error: 'not_signed_in' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }

  const runtimeEnv = (locals as App.Locals).runtime?.env;
  const apiBase = runtimeEnv?.RAILWAY_API_URL;
  if (!apiBase) {
    return new Response(JSON.stringify({ error: 'railway_api_url_missing' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }

  const upstream = new URL('/api/courses/search', apiBase);
  upstream.searchParams.set('q', q);

  try {
    const res = await fetch(upstream.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });
    const body = await res.text();
    return new Response(body, {
      status: res.status,
      headers: {
        'content-type': res.headers.get('content-type') ?? 'application/json',
        'cache-control': 'private, max-age=60',
      },
    });
  } catch (err: any) {
    console.error('[api/courses/search] upstream fetch failed', err);
    return new Response(
      JSON.stringify({ error: 'upstream_unreachable', detail: err?.message ?? String(err) }),
      { status: 502, headers: { 'content-type': 'application/json' } },
    );
  }
};
