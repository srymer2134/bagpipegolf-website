import type { APIRoute } from 'astro';
import { rosterCsvTemplate } from '../lib/leagueRosterImport';

// GET /roster-template.csv — the roster CSV a league director fills in.
//
// GENERATED, NOT STORED. The body is `rosterCsvTemplate()`, built from
// `ROSTER_COLUMNS`, which is also the list the importer recognises and
// the column set of `public.league_pending_members`. A file checked
// into /public would be a second definition of the roster shape and
// would drift from the importer the first time a column changed. A
// test round-trips this exact text back through the parser.
//
// WHY A ROUTE RATHER THAN A `data:` URL ON THE LINK. Both are generated
// from the same function, so neither can drift — but a real response
// with `Content-Disposition: attachment` is governed by nothing
// surprising, downloads without JavaScript, and names the file itself.
// A `data:` anchor leans on download-attribute behaviour and on the
// page CSP never growing a navigation directive, neither of which can
// be verified from a test.
//
// NOT LEAGUE-SCOPED AND NOT AUTHENTICATED, deliberately: the template
// is a header row and an example, identical for every league, and
// carries nothing about anyone. Scoping it to a league id would imply
// it contained that league's data.

export const GET: APIRoute = () =>
  new Response(rosterCsvTemplate(), {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="bagpipe-roster-template.csv"',
      // The content changes only when the column list does, i.e. on a
      // deploy. An hour is long enough to be worth caching and short
      // enough that a director who re-downloads after a release gets
      // the new shape.
      'cache-control': 'public, max-age=3600',
    },
  });
