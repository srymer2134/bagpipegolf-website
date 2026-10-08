import type { APIRoute } from 'astro';
import { buildLlmsTxt } from '../lib/llmsTxt';

// Built once at deploy time from the site's own data (see src/lib/llmsTxt.ts).
export const prerender = true;

export const GET: APIRoute = () =>
  new Response(buildLlmsTxt(), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
