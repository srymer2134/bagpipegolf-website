import type { APIRoute } from 'astro';
import { refundRosterPayment, type RouteCtx } from '../../../lib/paymentsRoutes';

// POST /api/payments/refund — Phase 5's "Refund" on the owner's roster.
// Owner only. Form fields: exactly `scope`, `id`, `payment_id`. NO
// AMOUNT — full refunds only (Sam, 2026-10-21); anything else is a 400
// and Railway is never called. Calls Railway's
// `POST /api/payments/:id/refund` with no body.
//
// Off (404) unless PAYMENTS_ENABLED. See `refundRosterPayment`.
export const POST: APIRoute = (ctx) => refundRosterPayment(ctx as unknown as RouteCtx);
