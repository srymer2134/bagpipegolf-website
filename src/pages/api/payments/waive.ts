import type { APIRoute } from 'astro';
import { recordRosterAction, type RouteCtx } from '../../../lib/paymentsRoutes';

// POST /api/payments/waive — W5's "Waive" (contract §2.7). Owner only.
// Form fields: exactly `scope`, `id`, `profile_id`, and an optional
// `reason`. NO AMOUNT — anything else is a 400 and Railway is never
// called. A waiver means no money moved; it is not "Paid (cash)".
//
// Off (404) unless PAYMENTS_ENABLED. See `recordRosterAction`.
export const POST: APIRoute = (ctx) => recordRosterAction(ctx as unknown as RouteCtx, 'waive');
