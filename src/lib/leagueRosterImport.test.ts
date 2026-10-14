import { describe, expect, it } from 'vitest';
// The template endpoint is a six-line wrapper around the generator, but
// its headers are what makes a browser save a file instead of showing
// one, and nothing else checks them.
import { GET as templateRoute } from '../pages/roster-template.csv';
import {
  importableRows,
  invitableRows,
  isEmailShape,
  parseEmailList,
  parseRosterCsv,
  pendingOnlyRows,
  rosterCsvTemplate,
  ROSTER_COLUMNS,
  splitCsv,
} from './leagueRosterImport';

const HEADER = 'name,email,handicap_index,phone,grade,gender,team';

describe('rosterCsvTemplate', () => {
  it('is generated from the column list, in order', () => {
    const [header] = rosterCsvTemplate().split('\n');
    expect(header).toBe(ROSTER_COLUMNS.map((c) => c.name).join(','));
  });

  it('round-trips through its own parser with no errors', () => {
    // The guard that matters: the file we hand a director must be a
    // file we accept back. A column renamed on one side only breaks
    // here rather than in front of a league.
    const out = parseRosterCsv(rosterCsvTemplate());
    expect(out.fatal).toBeNull();
    expect(out.ignored).toEqual([]);
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0].errors).toEqual([]);
    expect(out.rows[0].name).toBe('Jamie Fraser');
  });

  it('is served as an attachment with a sensible filename', async () => {
    const res = await (templateRoute as (c: unknown) => Response | Promise<Response>)({});
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    expect(res.headers.get('content-disposition')).toBe(
      'attachment; filename="bagpipe-roster-template.csv"',
    );
    expect(await res.text()).toBe(rosterCsvTemplate());
  });

  it('declares name as the only required column', () => {
    expect(ROSTER_COLUMNS.filter((c) => c.required).map((c) => c.name)).toEqual(['name']);
  });
});

describe('splitCsv', () => {
  it('handles quoted cells, embedded commas and doubled quotes', () => {
    expect(splitCsv('a,"b,c","d""e"')).toEqual([['a', 'b,c', 'd"e']]);
  });

  it('accepts LF, CRLF and bare CR line endings', () => {
    expect(splitCsv('a\nb\r\nc\rd')).toEqual([['a'], ['b'], ['c'], ['d']]);
  });

  it('does not invent a row for a trailing newline', () => {
    expect(splitCsv('a,b\n')).toEqual([['a', 'b']]);
  });

  it('keeps a newline that is inside quotes', () => {
    expect(splitCsv('a,"line1\nline2"')).toEqual([['a', 'line1\nline2']]);
  });

  it('strips a UTF-8 BOM so the first header is not "\\uFEFFname"', () => {
    expect(splitCsv('﻿name,email')).toEqual([['name', 'email']]);
  });
});

describe('parseRosterCsv — whole-file failures', () => {
  it('rejects an empty file', () => {
    expect(parseRosterCsv('').fatal).toBe('That file is empty.');
    expect(parseRosterCsv('   \n\n').fatal).toBe('That file is empty.');
  });

  it('rejects a file with no name column', () => {
    const out = parseRosterCsv('email,team\na@b.com,Varsity');
    expect(out.fatal).toMatch(/no name column/);
    expect(out.rows).toEqual([]);
  });

  it('reports a header-only file rather than importing nothing quietly', () => {
    const out = parseRosterCsv(`${HEADER}\n`);
    expect(out.fatal).toBe('That file has a header row and no players.');
    expect(out.rows).toEqual([]);
  });
});

describe('parseRosterCsv — headers', () => {
  it('accepts a name-only file', () => {
    const out = parseRosterCsv('name\nJamie\nClaire');
    expect(out.fatal).toBeNull();
    expect(out.columns).toEqual(['name']);
    expect(out.rows.map((r) => r.name)).toEqual(['Jamie', 'Claire']);
  });

  it('is case- and separator-insensitive, and honours common aliases', () => {
    const out = parseRosterCsv('Player Name,E-Mail,HCP\nJamie,JAMIE@X.COM,7.2');
    expect(out.fatal).toBeNull();
    expect(out.columns).toEqual(['name', 'email', 'handicap_index']);
    expect(out.rows[0]).toMatchObject({ name: 'Jamie', email: 'jamie@x.com', handicap_index: 7.2 });
  });

  it('reads columns in whatever order the file used them', () => {
    const out = parseRosterCsv('team,name,grade\nVarsity,Jamie,11');
    expect(out.rows[0]).toMatchObject({ name: 'Jamie', team: 'Varsity', grade: 11 });
  });

  it('ignores an unrecognised column instead of failing the file', () => {
    const out = parseRosterCsv('name,Locker,notes\nJamie,14,likes links golf');
    expect(out.fatal).toBeNull();
    expect(out.ignored).toEqual(['Locker', 'notes']);
    expect(out.rows[0].errors).toEqual([]);
  });
});

describe('parseRosterCsv — per-row validation', () => {
  it('flags a blank name and keeps the rest of the file importable', () => {
    const out = parseRosterCsv(`${HEADER}\n,a@b.com,,,,,\nJamie,c@d.com,,,,,`);
    expect(out.rows[0].errors).toEqual(['Name is required.']);
    expect(out.rows[1].errors).toEqual([]);
    expect(importableRows(out.rows).map((r) => r.name)).toEqual(['Jamie']);
  });

  it('flags a malformed email', () => {
    const out = parseRosterCsv('name,email\nJamie,not-an-email');
    expect(out.rows[0].errors).toEqual(['"not-an-email" is not an email address.']);
    expect(out.rows[0].email).toBeNull();
  });

  it('flags a duplicate email against the line it first appeared on', () => {
    const out = parseRosterCsv('name,email\nJamie,a@b.com\nClaire,A@B.COM');
    expect(out.rows[0].errors).toEqual([]);
    expect(out.rows[1].errors).toEqual(['Same email as line 2.']);
  });

  it('flags a duplicate name only when neither row has an email', () => {
    const dupes = parseRosterCsv('name\nJamie\njamie');
    expect(dupes.rows[1].errors).toEqual(['Same name as line 2, with no email.']);

    const distinct = parseRosterCsv('name,email\nJamie,a@b.com\nJamie,c@d.com');
    expect(distinct.rows.every((r) => r.errors.length === 0)).toBe(true);
  });

  it('parses a plus handicap as the negative number golf means by it', () => {
    const out = parseRosterCsv('name,handicap_index\nJamie,+2.1');
    expect(out.rows[0].handicap_index).toBe(-2.1);
    expect(out.rows[0].errors).toEqual([]);
  });

  it('rounds a handicap to the one decimal numeric(4,1) stores', () => {
    const out = parseRosterCsv('name,handicap_index\nJamie,12.46');
    expect(out.rows[0].handicap_index).toBe(12.5);
  });

  it('rejects a non-numeric or out-of-range handicap', () => {
    const out = parseRosterCsv('name,handicap_index\nJamie,scratch\nClaire,124\nBrian,-11');
    expect(out.rows[0].errors).toEqual(['Handicap "scratch" is not a number.']);
    expect(out.rows[1].errors).toEqual(['Handicap 124 is outside -10 to 54.']);
    expect(out.rows[2].errors).toEqual(['Handicap -11 is outside -10 to 54.']);
  });

  it('rejects a grade that is not a whole 1-12', () => {
    const out = parseRosterCsv('name,grade\nJamie,13\nClaire,10.5\nBrian,senior');
    expect(out.rows.map((r) => r.errors.length)).toEqual([1, 1, 1]);
    expect(out.rows[0].errors[0]).toMatch(/whole number from 1 to 12/);
  });

  it('collects every problem in a row, not just the first', () => {
    const out = parseRosterCsv('name,email,grade\n,nope,99');
    expect(out.rows[0].errors).toHaveLength(3);
  });

  it('skips blank lines rather than calling them nameless rows', () => {
    const out = parseRosterCsv('name\nJamie\n\n,\nClaire\n');
    expect(out.rows.map((r) => r.name)).toEqual(['Jamie', 'Claire']);
    expect(out.rows.every((r) => r.errors.length === 0)).toBe(true);
  });

  it('trims cells and turns an empty optional into null', () => {
    const out = parseRosterCsv(`${HEADER}\n  Jamie  , , , , , , `);
    expect(out.rows[0]).toMatchObject({
      name: 'Jamie',
      email: null,
      handicap_index: null,
      phone: null,
      grade: null,
      gender: null,
      team: null,
    });
  });

  it('tolerates a short row with trailing columns missing', () => {
    const out = parseRosterCsv(`${HEADER}\nJamie,a@b.com`);
    expect(out.rows[0].errors).toEqual([]);
    expect(out.rows[0].team).toBeNull();
  });
});

describe('split by destination', () => {
  const out = parseRosterCsv(
    `${HEADER}\n` +
      'Jamie,jamie@x.com,7.2,,,,\n' + // invite
      'Claire,,,,11,F,Varsity\n' + //   pending-only
      ',broken,,,,,\n', //              neither
  );

  it('routes emailed rows to the invite path', () => {
    expect(invitableRows(out.rows).map((r) => r.email)).toEqual(['jamie@x.com']);
  });

  it('routes emailless rows to the pending path', () => {
    expect(pendingOnlyRows(out.rows).map((r) => r.name)).toEqual(['Claire']);
  });

  it('routes an invalid row nowhere', () => {
    expect(importableRows(out.rows)).toHaveLength(2);
  });
});

describe('parseEmailList', () => {
  it('splits on commas, semicolons, spaces and newlines', () => {
    const { emails } = parseEmailList('a@x.com, b@x.com;c@x.com\nd@x.com e@x.com');
    expect(emails).toEqual(['a@x.com', 'b@x.com', 'c@x.com', 'd@x.com', 'e@x.com']);
  });

  it('lower-cases and de-duplicates', () => {
    expect(parseEmailList('A@X.com, a@x.com').emails).toEqual(['a@x.com']);
  });

  it('reads a pasted "Name <addr>" pair', () => {
    const out = parseEmailList('Jamie Fraser <jamie@x.com>, Claire <claire@x.com>');
    expect(out.emails).toEqual(['jamie@x.com', 'claire@x.com']);
    expect(out.invalid).toEqual([]);
  });

  it('reports a token that tried to be an address and failed', () => {
    const out = parseEmailList('good@x.com, bad@, @also-bad');
    expect(out.emails).toEqual(['good@x.com']);
    expect(out.invalid).toEqual(['bad@', '@also-bad']);
  });

  it('returns nothing for empty input', () => {
    expect(parseEmailList('   \n ')).toEqual({ emails: [], invalid: [] });
  });
});

describe('isEmailShape', () => {
  it('accepts unusual but valid addresses', () => {
    expect(isEmailShape('a+tag@sub.example.co.uk')).toBe(true);
    expect(isEmailShape("o'brien@example.com")).toBe(true);
  });

  it('rejects anything without a dotted domain', () => {
    expect(isEmailShape('a@b')).toBe(false);
    expect(isEmailShape('a b@c.com')).toBe(false);
    expect(isEmailShape('')).toBe(false);
  });
});

/**
 * Sam, 2026-10-14: "CSV Template for leagues has school, handicap, etc.
 * Can just a first, last name and email suffice for the upload on
 * leagues?"
 *
 * Two answers. Only `name` was ever required, so `name,email` already
 * worked — the template merely SHOWED all seven columns, which made
 * them look mandatory. And a roster a director already has almost
 * always splits first and last, so those are now accepted and joined.
 */
describe('a minimal league roster', () => {
  it('name,email alone imports cleanly', () => {
    const r = parseRosterCsv('name,email\nJamie Fraser,jamie@example.com\n');
    expect(r.fatal).toBeFalsy();
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].errors).toEqual([]);
    expect(r.rows[0].name).toBe('Jamie Fraser');
    expect(r.rows[0].handicap_index).toBeNull();
    expect(r.rows[0].grade).toBeNull();
  });

  it('first_name,last_name,email is joined into one name', () => {
    const r = parseRosterCsv(
      'first_name,last_name,email\nJamie,Fraser,jamie@example.com\n',
    );
    expect(r.fatal).toBeFalsy();
    expect(r.rows[0].name).toBe('Jamie Fraser');
    expect(r.rows[0].email).toBe('jamie@example.com');
    expect(r.rows[0].errors).toEqual([]);
  });

  it('accepts the aliases people actually type', () => {
    for (const header of [
      'First,Last,Email',
      'firstname,lastname,e_mail',
      'given_name,surname,email_address',
    ]) {
      const r = parseRosterCsv(`${header}\nJamie,Fraser,jamie@example.com\n`);
      expect(r.fatal, header).toBeFalsy();
      expect(r.rows[0].name, header).toBe('Jamie Fraser');
    }
  });

  it('one part alone still yields a name', () => {
    // Poor data, but it is the director's data — refusing the whole
    // file over a missing first name helps nobody.
    expect(parseRosterCsv('last_name\nFraser\n').rows[0].name).toBe('Fraser');
    expect(parseRosterCsv('first_name\nJamie\n').rows[0].name).toBe('Jamie');
  });

  it('an explicit name column wins over the parts', () => {
    const r = parseRosterCsv(
      'name,first_name,last_name\nJamie Fraser,Ignore,Me\n',
    );
    expect(r.rows[0].name).toBe('Jamie Fraser');
  });

  it('a file with neither name nor parts is refused, and says how', () => {
    const r = parseRosterCsv('email\njamie@example.com\n');
    expect(r.fatal).toContain('first_name');
  });

  it('blank parts are still a missing name, not a space', () => {
    const r = parseRosterCsv('first_name,last_name,email\n , ,a@b.com\n');
    expect(r.rows[0].errors).toContain('Name is required.');
  });
});
