import type { APIRoute } from 'astro';
import { recordRosterAction, type RouteCtx } from '../../../lib/paymentsRoutes';

// POST /api/payments/mark-offline — W5's "Mark paid in cash"
// (contract §2.6). Owner only. Form fields: exactly `scope`, `id`,
// `profile_id`, and an optional `note`. NO AMOUNT — anything else is a
// 400 and Railway is never called. Records; moves no money.
//
// Off (404) unless PAYMENTS_ENABLED. See `recordRosterAction`.
export const POST: APIRoute = (ctx) => recordRosterAction(ctx as unknown as RouteCtx, 'mark_offline');
