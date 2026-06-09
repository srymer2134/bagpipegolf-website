import type { APIRoute } from 'astro';
import { createSupabaseFromApi } from '../../../lib/supabase';

export const POST: APIRoute = async (ctx) => {
  const supabase = createSupabaseFromApi(ctx);
  await supabase.auth.signOut();
  return ctx.redirect('/', 303);
};

export const GET: APIRoute = () =>
  new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } });
