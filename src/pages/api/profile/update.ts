import type { APIRoute } from 'astro';
import { createSupabaseFromApi } from '../../../lib/supabase';

// Progressive-enhancement handler. The profile form POSTs here
// with a standard urlencoded body; success = 303 redirect back to
// /app/profile with a query flag the page reads to show a toast.

const HANDICAP_MIN = -10;
const HANDICAP_MAX = 54;

function parseHandicap(raw: FormDataEntryValue | null): { value?: number; error?: string } {
  if (raw == null || raw === '') return { value: undefined };
  const n = Number(raw);
  if (!isFinite(n)) return { error: 'Handicap must be a number.' };
  if (n < HANDICAP_MIN || n > HANDICAP_MAX) {
    return { error: `Handicap must be between ${HANDICAP_MIN} and ${HANDICAP_MAX}.` };
  }
  return { value: Math.round(n * 10) / 10 };
}

export const POST: APIRoute = async (ctx) => {
  const user = ctx.locals.user;
  if (!user) return ctx.redirect('/login', 303);

  const form = await ctx.request.formData();
  const displayName = String(form.get('display_name') ?? '').trim();
  const handicap = parseHandicap(form.get('handicap'));
  const homeCourse = String(form.get('home_course') ?? '').trim();

  if (!displayName) {
    return ctx.redirect('/app/profile?err=name_required', 303);
  }
  if (handicap.error) {
    return ctx.redirect(`/app/profile?err=${encodeURIComponent(handicap.error)}`, 303);
  }

  const supabase = createSupabaseFromApi(ctx);
  const patch: Record<string, unknown> = { display_name: displayName };
  if (handicap.value !== undefined) patch.handicap = handicap.value;
  if (homeCourse) patch.home_course_id = homeCourse;

  const { error } = await supabase.from('profiles').update(patch).eq('id', user.id);
  if (error) {
    console.error('[api/profile/update]', error);
    return ctx.redirect(`/app/profile?err=${encodeURIComponent(error.message)}`, 303);
  }

  return ctx.redirect('/app/profile?saved=1', 303);
};

export const GET: APIRoute = () =>
  new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } });
