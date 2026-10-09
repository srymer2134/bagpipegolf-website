// Card payments — the request handlers shared by the routes under
// `src/pages/api/{merchants,payments}/` and `src/pages/app/payments/`.
//
// Each handler 404s first when `PAYMENTS_ENABLED` is unset, before it
// reads a session or a body, so production answers every payments path
// exactly the way it answers a path that does not exist.

import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseClient } from './supabase';
import {
  eventPath,
  isKindAllowed,
  paymentsSetupPath,
  type PaymentScope,
  type PaymentsMode,
} from './payments';
import { fixtureParam, markOffline, modeFor, notFound, onboard, waive } from './paymentsServer';
import { parseRosterAction, type RosterAction } from './paymentsRoster';

/** What every handler needs from Astro — satisfied by both an
 *  `APIContext` and the `Astro` global. */
export type RouteCtx = {
  request: Request;
  url: URL;
  cookies: Parameters<typeof createSupabaseClient>[0]['cookies'];
  locals: App.Locals;
};

/** The thing being paid for, as the website needs to know it. */
export type Payable = {
  scope: PaymentScope;
  id: string;
  name: string;
  ownerId: string | null;
  /** League scope only — `leagues.dues_cents`. Display only; the
   *  server derives the charged amount on its own (contract §0 rule 1). */
  duesCents: number | null;
  duesDueDate: string | null;
};

export async function loadPayable(
  supabase: SupabaseClient,
  scope: PaymentScope,
  id: string,
): Promise<Payable | null> {
  if (scope === 'league') {
    const { data, error } = await supabase
      .from('leagues')
      .select('id, name, user_id, dues_cents, dues_due_date')
      .eq('id', id)
      .maybeSingle();
    if (error || !data) return null;
    const r = data as Record<string, unknown>;
    return {
      scope,
      id,
      name: String(r.name ?? 'League'),
      ownerId: (r.user_id as string | null) ?? null,
      duesCents: typeof r.dues_cents === 'number' ? r.dues_cents : null,
      duesDueDate: (r.dues_due_date as string | null) ?? null,
    };
  }
  const { data, error } = await supabase
    .from('tournaments')
    .select('id, name, user_id')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return null;
  const r = data as Record<string, unknown>;
  return {
    scope,
    id,
    name: String(r.name ?? 'Tournament'),
    ownerId: (r.user_id as string | null) ?? null,
    duesCents: null,
    duesDueDate: null,
  };
}

export function supabaseFor(ctx: RouteCtx): SupabaseClient {
  return createSupabaseClient({ request: ctx.request, cookies: ctx.cookies, locals: ctx.locals });
}

/**
 * F5: exactly one login per league reaches the money account — the
 * row's OWNER (`leagues.user_id` / `tournaments.user_id`), not any
 * co-commissioner. The API enforces the same (`not_director`); this
 * check means a co-director never sees a button the API would refuse.
 */
export function isOwner(p: Payable | null, userId: string | null | undefined): boolean {
  return Boolean(p && userId && p.ownerId && p.ownerId === userId);
}

/** A Stripe-hosted URL, and nothing else, may be a redirect target.
 *  The API is trusted, but a payments route that would 302 anywhere a
 *  response told it to is an open redirect one bug away. */
export function isStripeUrl(raw: unknown, host: 'connect' | 'checkout'): boolean {
  if (typeof raw !== 'string') return false;
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && u.hostname === `${host}.stripe.com`;
  } catch {
    return false;
  }
}

function redirect(location: string, status = 303): Response {
  return new Response(null, { status, headers: { Location: location } });
}

function withQuery(path: string, q: Record<string, string | null | undefined>): string {
  const u = new URL(path, 'https://x');
  for (const [k, v] of Object.entries(q)) if (v) u.searchParams.set(k, v);
  return u.pathname + u.search;
}

/**
 * Mint an Account Link and send the browser to it — the only place
 * that happens. Called from the POST behind "Set up card payments" /
 * "Continue setup" and from Stripe's own `refresh_url` redirect, never
 * from a page render (single-use links; link-preview bots burn them).
 */
export async function startOnboarding(
  ctx: RouteCtx,
  scope: PaymentScope,
  id: string,
): Promise<Response> {
  const mode: PaymentsMode = modeFor(ctx.locals);
  if (mode === 'off') return notFound();
  const user = ctx.locals.user;
  const setup = paymentsSetupPath(scope, id);
  if (!user) return redirect(`/login?next=${encodeURIComponent(setup)}`);

  const payable = await loadPayable(supabaseFor(ctx), scope, id);
  if (!isOwner(payable, user.id)) return redirect(eventPath(scope, id));
  const email = user.email?.trim();
  if (!email) return redirect(withQuery(setup, { setup: 'no_email' }));

  const fixture = fixtureParam(mode, ctx.url);
  const res = await onboard(ctx, mode, scope, id, email, fixture);
  if (!res.ok) return redirect(withQuery(setup, { setup: res.code, fixture }));

  if (mode === 'fixtures') {
    // Stand-in for Stripe sending the browser back from onboarding, so
    // the whole loop is walkable locally. Never reached in a built
    // Worker.
    return redirect(withQuery('/app/payments/return', { scope, id, fixture: 'merchant_ready' }));
  }
  if (!isStripeUrl(res.data.onboarding_url, 'connect')) {
    return redirect(withQuery(setup, { setup: 'bad_link' }));
  }
  return redirect(res.data.onboarding_url);
}

/**
 * W5 — "Mark paid in cash" (§2.6) and "Waive" (§2.7), the POSTs behind
 * the owner's roster. Shared by `/api/payments/mark-offline` and
 * `/api/payments/waive`.
 *
 * Order matters and each step is a guard:
 *   1. flag off → 404 before the body or session is read;
 *   2. the form is EXACTLY the contract's fields (no amount, no status —
 *      `parseRosterAction`), else 400;
 *   3. signed in, else login;
 *   4. the caller OWNS the league/tournament (F5 — `user_id`, not any
 *      commissioner), else back to the event page and Railway is never
 *      called. The API refuses a non-owner too (`not_director`);
 *   5. the Railway body is rebuilt from the validated request.
 *
 * Always lands back on the payments page with `?roster=<code>`, so the
 * owner reads "Recorded." or the refusal. It never says "sent".
 */
export async function recordRosterAction(ctx: RouteCtx, action: RosterAction): Promise<Response> {
  const mode: PaymentsMode = modeFor(ctx.locals);
  if (mode === 'off') return notFound();

  let form: FormData;
  try {
    form = await ctx.request.formData();
  } catch {
    return new Response('Bad request', { status: 400 });
  }
  const parsed =
    action === 'mark_offline'
      ? parseRosterAction('mark_offline', form.entries())
      : parseRosterAction('waive', form.entries());
  if (!parsed.ok) return new Response(`Bad request: ${parsed.reason}`, { status: 400 });
  const req = parsed.value;
  const setup = paymentsSetupPath(req.scope, req.id);

  const user = ctx.locals.user;
  if (!user) return redirect(`/login?next=${encodeURIComponent(setup)}`);

  const payable = await loadPayable(supabaseFor(ctx), req.scope, req.id);
  if (!isOwner(payable, user.id)) return redirect(eventPath(req.scope, req.id));

  const fixture = fixtureParam(mode, ctx.url);
  const res =
    action === 'mark_offline'
      ? await markOffline(ctx, mode, req as Parameters<typeof markOffline>[2], fixture)
      : await waive(ctx, mode, req as Parameters<typeof waive>[2], fixture);
  const code = res.ok ? (action === 'mark_offline' ? 'recorded_offline' : 'recorded_waived') : res.code;
  return redirect(withQuery(setup, { roster: code, fixture }) + '#roster');
}

export { isKindAllowed, withQuery, redirect };
