import type { APIRoute } from 'astro';
import { callRailway, RailwayApiError } from '../../../lib/railway';
import { redirect, withQuery } from '../../../lib/paymentsRoutes';
import { clubCall, clubDone } from '../../../lib/club';

// POST /api/clubs/action — every button on /app/club and /app/club/accept.
//
// NOT a transparent proxy: lib/club.ts turns the form into exactly one of a
// fixed set of API calls, each from validated fields, and refuses anything
// else. The API's SQL functions decide who may do what, acting as the
// signed-in user (Club plan B2).
//
// Always 303 back to /app/club with `?club=<code>`; the back-link is a
// constant, so this can't be an open redirect. The invite token is never
// put into that URL.
export const POST: APIRoute = async (ctx) => {
  const locals = ctx.locals as App.Locals;
  const back = '/app/club';
  if (!locals.user) return redirect(`/login?next=${encodeURIComponent(back)}`);

  let form: FormData;
  try {
    form = await ctx.request.formData();
  } catch {
    return new Response('Bad request', { status: 400 });
  }

  const call = clubCall(form, locals.user.id);
  if ('refuse' in call) return redirect(withQuery(back, { club: call.refuse }));

  let data: { emailed?: unknown; plan_payer?: unknown } | null = null;
  try {
    data = await callRailway<{ emailed?: unknown; plan_payer?: unknown }>(ctx, {
      method: call.method,
      path: call.path,
      ...(call.body ? { body: call.body } : {}),
    });
  } catch (err) {
    const code =
      err instanceof RailwayApiError &&
      err.body &&
      typeof err.body === 'object' &&
      typeof (err.body as { code?: unknown }).code === 'string'
        ? (err.body as { code: string }).code
        : 'error';
    return redirect(withQuery(back, { club: code }));
  }

  const action = String(form.get('action') ?? '');
  const emailed = typeof data?.emailed === 'boolean' ? data.emailed : undefined;
  const youStillPay = data?.plan_payer === locals.user.id;
  return redirect(withQuery(back, { club: clubDone(action, emailed, youStillPay) }));
};
