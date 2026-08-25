import type { APIRoute } from 'astro';
import { callRailway, RailwayApiError } from '../../../lib/railway';

// GET /api/courses/:id
//
// Proxy to Railway `/api/courses/:id` — used by the tournament-create
// wizard when the user picks a course in Basics, so the Rounds step
// can render real tee boxes with rating + slope + par instead of the
// hardcoded fallback list. Same auth pattern as the search proxy —
// forwards the signed-in user's Supabase JWT via `callRailway`.
//
// Returns the full `course` payload including `tee_boxes` (name,
// gender, course_rating, slope_rating, par_total, total_yards) and
// per-hole `holes` data. See Railway's
// `packages/api/src/routes/courses.ts` GET handler for the shape.

export type CourseTeeBox = {
  tee_name: string;
  gender: 'male' | 'female' | string;
  course_rating: number | null;
  slope_rating: number | null;
  bogey_rating: number | null;
  total_yards: number | null;
  par_total: number | null;
};

export type CourseDetail = {
  id: string;
  club_name: string | null;
  course_name: string | null;
  location: string | null;
  tee_boxes: CourseTeeBox[];
  holes: Array<{
    number: number;
    par: number;
    yards: number | null;
    handicap: number | null;
  }>;
};

export const GET: APIRoute = async (ctx) => {
  const id = ctx.params.id;
  if (typeof id !== 'string' || id.length === 0) {
    return json({ error: 'Missing course id.' }, 400);
  }
  try {
    const result = await callRailway<{ course: CourseDetail }>(ctx, {
      method: 'GET',
      path: `/api/courses/${encodeURIComponent(id)}`,
    });
    return json(result);
  } catch (err) {
    if (err instanceof RailwayApiError) {
      return json({ error: err.message }, err.status);
    }
    console.error('[api/courses/[id]] unexpected error', err);
    return json({ error: 'Course lookup failed' }, 500);
  }
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
