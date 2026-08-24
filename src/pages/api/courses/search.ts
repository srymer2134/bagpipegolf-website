import type { APIRoute } from 'astro';
import { callRailway, RailwayApiError } from '../../../lib/railway';

// GET /api/courses/search?q=<term>
//
// Thin proxy to Railway's `/api/courses/search`. Used by the
// tournament-create wizard's Basics step (course autocomplete).
// Same cascade the mobile app hits (curated → OpenGolfAPI → GHIN →
// GolfCourseAPI); we just want to piggy-back off it instead of
// re-implementing the search on the site.
//
// Auth: the Railway endpoint requires a signed-in user. Our
// `callRailway` helper forwards the visitor's Supabase JWT from
// `Astro.locals.session.access_token`. Signed-out visitors get 401
// straight through (the wizard is behind the /app auth gate anyway
// so this is defense-in-depth).

export type CourseSearchHit = {
  id: string;
  club_name: string | null;
  course_name: string | null;
  location: string | null;
  state: string | null;
  country: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

export type CourseSearchResponse = {
  courses: CourseSearchHit[];
  source?: string;
};

export const GET: APIRoute = async (ctx) => {
  const q = ctx.url.searchParams.get('q')?.trim() ?? '';
  if (q.length < 2) {
    // Mirror the app-side rule — 1-char queries are noise + they
    // 400 from Railway. Return empty list so the wizard renders a
    // "keep typing" state instead of an error toast.
    return json({ courses: [] });
  }

  try {
    const result = await callRailway<CourseSearchResponse>(ctx, {
      method: 'GET',
      path: '/api/courses/search',
      query: { q },
    });
    return json(result);
  } catch (err) {
    if (err instanceof RailwayApiError) {
      return json({ error: err.message }, err.status);
    }
    console.error('[api/courses/search] unexpected error', err);
    return json({ error: 'Course search failed' }, 500);
  }
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
