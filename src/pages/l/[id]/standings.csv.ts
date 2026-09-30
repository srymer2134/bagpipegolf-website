// Public league page — the standings as a CSV download (the "report").
// Same anon read as the pages; 404 for a private or unknown league.
import type { APIRoute } from 'astro';
import { createSupabaseClient } from '../../../lib/supabase';
import { getPublicLeague, standingsCsv } from '../../../lib/leaguePublic';

export const GET: APIRoute = async ({ params, request, cookies, locals }) => {
  const id = params.id;
  if (!id) return new Response('Not found', { status: 404 });
  try {
    const supabase = createSupabaseClient({ request, cookies, locals: locals as App.Locals });
    const league = await getPublicLeague(supabase, id);
    if (!league) return new Response('Not found', { status: 404 });
    const safeName = league.league.name.replace(/[^A-Za-z0-9 _-]+/g, '').trim().replace(/\s+/g, '_') || 'league';
    return new Response(standingsCsv(league), {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${safeName}_standings.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[league csv] failed', err);
    return new Response('Unavailable', { status: 503 });
  }
};
