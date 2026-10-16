// Roster CSV import — the parser, the validator, and the template.
//
// THE TEMPLATE IS GENERATED FROM THE COLUMN LIST, NOT HAND-WRITTEN.
// `ROSTER_COLUMNS` below is the single definition: the download a
// director gets, the headers the parser recognises, and the per-field
// rules all read it. A hand-authored template.csv would be a second
// definition of the same thing, and the two would drift the first time
// a column moved — which is the failure mode the generated league
// settings form was built to avoid (see leagueConfigForm.ts).
//
// The columns ARE `public.league_pending_members`
// (20260815_create_league_pending_members.sql): name NOT NULL, then
// email, handicap_index numeric(4,1), phone, grade int, gender, team.
// `grade`/`gender`/`team` date the table to the Bad Birdie High pilot,
// where a coach uploads a team roster; a club league simply leaves
// them blank.
//
// NOTHING HERE TOUCHES THE NETWORK. Parsing and validation are pure so
// the preview-before-commit step (no silent partial imports) can be
// tested without a browser or a database.

export type RosterColumn = {
  /** The database column name. Doubles as the CSV header. */
  readonly name: string;
  readonly required: boolean;
  /** What a director sees next to the field in the preview header. */
  readonly label: string;
  readonly kind: 'text' | 'email' | 'decimal' | 'int';
  /** Goes in the template's example row, so the shape is obvious. */
  readonly example: string;
};

export const ROSTER_COLUMNS: readonly RosterColumn[] = [
  { name: 'name', required: true, label: 'Name', kind: 'text', example: 'Jamie Fraser' },
  { name: 'email', required: true, label: 'Email', kind: 'email', example: 'jamie@example.com' },
  { name: 'handicap_index', required: false, label: 'Handicap index', kind: 'decimal', example: '12.4' },
  { name: 'phone', required: false, label: 'Phone', kind: 'text', example: '555-0142' },
  { name: 'grade', required: false, label: 'Grade', kind: 'int', example: '11' },
  { name: 'gender', required: false, label: 'Gender', kind: 'text', example: 'F' },
  { name: 'team', required: false, label: 'Team', kind: 'text', example: 'Varsity' },
];

export const REQUIRED_COLUMNS = ROSTER_COLUMNS.filter((c) => c.required).map((c) => c.name);

/** One parsed CSV row, with every problem found in it. */
export type RosterImportRow = {
  /** 1-based line number in the uploaded file, so the preview can say
   *  "line 7" and the director can find it in their spreadsheet. */
  line: number;
  name: string;
  email: string | null;
  handicap_index: number | null;
  phone: string | null;
  grade: number | null;
  gender: string | null;
  team: string | null;
  /** Empty means importable. Anything here blocks this row only. */
  errors: string[];
};

export type RosterImportResult = {
  /** Recognised headers, in the order the file used them. */
  columns: string[];
  /** Headers we did not recognise. Ignored, not rejected — a column a
   *  director added for their own notes should not fail the import. */
  ignored: string[];
  rows: RosterImportRow[];
  /** Set when the whole file is unusable. `rows` is then empty. */
  fatal: string | null;
};

/**
 * The CSV a director downloads: header row + one example row.
 *
 * The example row is deliberately present rather than a bare header.
 * A bare header leaves "does handicap go in as 12.4 or 12?" to guess,
 * and the first thing most people do is overwrite line 2.
 */
export function rosterCsvTemplate(): string {
  // Leads with first_name, last_name, email — the three Sam set as the
  // minimum (2026-10-14) — then the optional columns. `name` is still
  // accepted on upload for anyone who already has a single-column
  // roster; it is simply not what we hand out, because a template that
  // shows seven columns reads as "seven columns are needed", which is
  // the confusion that prompted the change.
  const cols = [
    { name: 'first_name', example: 'Jamie' },
    { name: 'last_name', example: 'Fraser' },
    ...ROSTER_COLUMNS.filter((c) => c.name !== 'name').map((c) => ({
      name: c.name,
      example: c.example,
    })),
  ];
  const header = cols.map((c) => c.name).join(',');
  const example = cols.map((c) => csvCell(c.example)).join(',');
  return `${header}\n${example}\n`;
}

/** Quote a cell only when it needs it, so the template stays readable. */
function csvCell(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/**
 * Split CSV text into rows of cells.
 *
 * Hand-rolled rather than a dependency because the input is one
 * spreadsheet export: quoted fields, `""` for a literal quote inside
 * one, and any of CRLF / CR / LF as the line ending (Excel on Windows
 * writes CRLF; Numbers on a Mac has historically written CR). A
 * trailing newline does not produce a phantom final row.
 */
export function splitCsv(text: string): string[][] {
  // Strip a UTF-8 BOM — Excel's "CSV UTF-8" adds one, and it would
  // otherwise become part of the first header ("﻿name").
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];

    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      // Consume CRLF as one terminator.
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }

  // The last line, when the file does not end in a newline.
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** `Handicap Index`, `handicap-index` and `HANDICAP_INDEX` are all the
 *  same column to a human, so they are to us too. */
function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

const KNOWN = new Map(ROSTER_COLUMNS.map((c) => [c.name, c]));

/** Headers people reach for that are not the column name. */
const HEADER_ALIASES: Record<string, string> = {
  player: 'name',
  player_name: 'name',
  full_name: 'name',
  handicap: 'handicap_index',
  index: 'handicap_index',
  hcp: 'handicap_index',
  e_mail: 'email',
  email_address: 'email',
  phone_number: 'phone',
  mobile: 'phone',
  sex: 'gender',
  year: 'grade',
  // First/last as separate columns. The table stores ONE `name`, but
  // almost every roster a director already has — a club export, a
  // spreadsheet someone keeps by hand, a Google Form — splits them.
  // Asking them to concatenate in Excel before uploading is the kind
  // of small tax that stops people using a feature at all.
  first: 'first_name',
  firstname: 'first_name',
  given_name: 'first_name',
  last: 'last_name',
  lastname: 'last_name',
  surname: 'last_name',
  family_name: 'last_name',
};

/** Joined into `name` when the file has no `name` column. */
const NAME_PARTS = ['first_name', 'last_name'] as const;

/**
 * Parse and validate an uploaded roster CSV.
 *
 * Every problem is reported against its row and nothing is thrown, so
 * the preview can show a 40-row file with three bad lines and let the
 * director import the other 37 — rather than refusing the file and
 * making them bisect it.
 */
export function parseRosterCsv(text: string): RosterImportResult {
  const empty = (fatal: string): RosterImportResult => ({
    columns: [],
    ignored: [],
    rows: [],
    fatal,
  });

  if (text.trim().length === 0) {
    return empty('That file is empty.');
  }

  const grid = splitCsv(text).filter(
    // Drop lines that are entirely blank. Spreadsheet exports are full
    // of them, and they are not "rows with a missing name".
    (r) => r.some((c) => c.trim().length > 0),
  );
  if (grid.length === 0) {
    return empty('That file is empty.');
  }

  const rawHeaders = grid[0].map(normalizeHeader);
  const headers = rawHeaders.map((h) => HEADER_ALIASES[h] ?? h);
  const columns: string[] = [];
  const ignored: string[] = [];
  headers.forEach((h, i) => {
    if (h.length === 0) return;
    if (KNOWN.has(h) && !columns.includes(h)) columns.push(h);
    // NAME_PARTS are recognised but are not columns of their own — they
    // fold into `name`. Without this they landed in `ignored`, so the
    // preview told a director we had ignored the very headers our own
    // template hands them.
    else if (!KNOWN.has(h) && !(NAME_PARTS as readonly string[]).includes(h)) {
      ignored.push(grid[0][i].trim());
    }
  });

  // `first_name` / `last_name` stand in for `name`. They are not
  // ROSTER_COLUMNS — the table has one `name` — so they are recognised
  // here and joined per row below.
  const hasNameParts = NAME_PARTS.some((p) => headers.includes(p));
  const missing = REQUIRED_COLUMNS.filter(
    (c) => !columns.includes(c) && !(c === 'name' && hasNameParts),
  );
  if (missing.length > 0) {
    return empty(
      `This file has no ${missing.join(' or ')} column — ` +
        'a `name` column, or `first_name` and `last_name`. ' +
        'Download the template and use its header row.',
    );
  }
  if (!columns.includes('name') && hasNameParts) columns.push('name');

  if (grid.length === 1) {
    return {
      columns,
      ignored,
      rows: [],
      fatal: 'That file has a header row and no players.',
    };
  }

  // Index of each recognised column, so a reordered file still works.
  const at = new Map<string, number>();
  headers.forEach((h, i) => {
    if ((KNOWN.has(h) || (NAME_PARTS as readonly string[]).includes(h)) && !at.has(h)) {
      at.set(h, i);
    }
  });

  const rows: RosterImportRow[] = [];
  // Duplicate detection is per FILE, not per row: the second occurrence
  // is the error, and it names the line the first one was on. The
  // invite route is idempotent per (league, email) upstream, but a file
  // listing the same person twice is a mistake worth showing.
  const emailFirstSeen = new Map<string, number>();
  const nameFirstSeen = new Map<string, number>();

  for (let r = 1; r < grid.length; r += 1) {
    const cells = grid[r];
    const cell = (col: string): string => {
      const i = at.get(col);
      return i === undefined ? '' : (cells[i] ?? '').trim();
    };
    // `line` is the row's position in the filtered grid, which is what
    // the preview shows. Blank lines were dropped, so this is "the Nth
    // row with content" — close enough to a spreadsheet row to find,
    // and honest about what was parsed.
    const line = r + 1;
    const errors: string[] = [];

    // A `name` column wins; otherwise join first + last. Either part
    // alone is accepted — a roster with only surnames is poor data but
    // it is the director's data, and refusing the whole file over it
    // helps nobody.
    const name =
      cell('name') ||
      NAME_PARTS.map((p) => cell(p))
        .filter((v) => v.length > 0)
        .join(' ');
    if (name.length === 0) errors.push('Name is required.');

    const rawEmail = cell('email').toLowerCase();
    let email: string | null = null;
    if (rawEmail.length === 0) {
      // Sam, 2026-10-14: "emails, first and last name should be the
      // minimum requirement to upload."
      //
      // This is why the importer no longer needs a home for people
      // without an account: every row is now invitable, so the whole
      // file goes through the existing invite path. The gap that
      // required a `league_pending_members` write endpoint
      // (PATRICK_BACKLOG §87) is closed by the requirement, not by
      // building the endpoint.
      errors.push('Email is required.');
    } else {
      if (!isEmailShape(rawEmail)) {
        errors.push(`"${rawEmail}" is not an email address.`);
      } else {
        email = rawEmail;
        const first = emailFirstSeen.get(email);
        if (first !== undefined) {
          errors.push(`Same email as line ${first}.`);
        } else {
          emailFirstSeen.set(email, line);
        }
      }
    }

    // A duplicate NAME is only reported when neither row has an email
    // to tell them apart — two different Jamie Frasers with two
    // addresses are two people, and a league is allowed both.
    if (name.length > 0 && email === null) {
      const key = name.toLowerCase();
      const first = nameFirstSeen.get(key);
      if (first !== undefined) errors.push(`Same name as line ${first}, with no email.`);
      else nameFirstSeen.set(key, line);
    }

    const hcpRaw = cell('handicap_index');
    let handicap_index: number | null = null;
    if (hcpRaw.length > 0) {
      // A plus handicap is written "+2.1" in golf and means BELOW
      // scratch, i.e. -2.1 as a number. Anyone typing it means the
      // golf sense, so honour it rather than parsing "+2.1" as 2.1.
      const plus = /^\+\s*\d/.test(hcpRaw);
      const n = Number(hcpRaw.replace(/^\+/, '').trim());
      if (!Number.isFinite(n)) {
        errors.push(`Handicap "${hcpRaw}" is not a number.`);
      } else {
        const signed = plus ? -n : n;
        // numeric(4,1) holds -999.9..999.9; the WHS range is the real
        // constraint, and a mistyped "124" should not reach the roster.
        if (signed < -10 || signed > 54) {
          errors.push(`Handicap ${hcpRaw} is outside -10 to 54.`);
        } else {
          handicap_index = Math.round(signed * 10) / 10;
        }
      }
    }

    const gradeRaw = cell('grade');
    let grade: number | null = null;
    if (gradeRaw.length > 0) {
      const n = Number(gradeRaw);
      if (!Number.isInteger(n) || n < 1 || n > 12) {
        errors.push(`Grade "${gradeRaw}" must be a whole number from 1 to 12.`);
      } else {
        grade = n;
      }
    }

    rows.push({
      line,
      name,
      email,
      handicap_index,
      phone: cell('phone') || null,
      grade,
      gender: cell('gender') || null,
      team: cell('team') || null,
      errors,
    });
  }

  return { columns, ignored, rows, fatal: null };
}

/**
 * Deliberately loose. The authority on whether an address exists is
 * the mail server, and the API re-checks for `@` of its own; a clever
 * regex here only rejects valid-but-unusual addresses.
 */
export function isEmailShape(v: string): boolean {
  return /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(v.trim());
}

/** The rows that may be committed — no errors. */
export function importableRows(rows: RosterImportRow[]): RosterImportRow[] {
  return rows.filter((r) => r.errors.length === 0);
}

/** Importable rows WITH an email → the invite path (Phase 1). */
export function invitableRows(rows: RosterImportRow[]): RosterImportRow[] {
  return importableRows(rows).filter((r) => r.email !== null);
}

/**
 * Parse a hand-typed list of addresses — commas, semicolons, spaces or
 * newlines, and `Jamie Fraser <jamie@example.com>` as pasted out of a
 * mail client.
 *
 * Returns both halves: what we will send, and what we could not read.
 * Showing the rejects matters more than it looks — a director who
 * pastes 20 addresses and sees "18 invites" needs to know which two
 * were dropped, and why.
 *
 * Only a token containing `@` is ever reported as invalid. A bare word
 * is treated as a display name and silently ignored, because `Jamie`
 * out of `Jamie <jamie@x.com>` and a genuinely mistyped address with
 * the `@` left out are the same string to us, and nagging about every
 * pasted first name is the worse of the two mistakes.
 */
export function parseEmailList(raw: string): { emails: string[]; invalid: string[] } {
  const emails: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();

  for (const piece of raw.split(/[\s,;]+/)) {
    // `<a@b.com>` and a trailing `,` have already been split off; the
    // brackets have not.
    const t = piece.trim().replace(/^</, '').replace(/>$/, '');
    if (t.length === 0) continue;
    if (!t.includes('@')) continue;
    const lower = t.toLowerCase();
    if (!isEmailShape(lower)) {
      invalid.push(t);
      continue;
    }
    if (seen.has(lower)) continue;
    seen.add(lower);
    emails.push(lower);
  }
  return { emails, invalid };
}
