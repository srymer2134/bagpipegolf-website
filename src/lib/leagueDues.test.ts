import { describe, expect, it } from 'vitest';
import { formatDuesCents, formatDuesDueDate, formatDuesLine } from './leagueDues';

describe('formatDuesCents', () => {
  it('whole dollars drop the cents', () => {
    expect(formatDuesCents(4500)).toBe('$45');
    expect(formatDuesCents(120000)).toBe('$1200');
  });

  it('partial dollars keep two places', () => {
    expect(formatDuesCents(4550)).toBe('$45.50');
    expect(formatDuesCents(1)).toBe('$0.01');
  });

  it('no dues renders as nothing, never $0', () => {
    expect(formatDuesCents(0)).toBeNull();
    expect(formatDuesCents(null)).toBeNull();
    expect(formatDuesCents(undefined)).toBeNull();
    expect(formatDuesCents(-100)).toBeNull();
    expect(formatDuesCents('nonsense')).toBeNull();
  });

  it('accepts the string PostgREST sometimes returns for a number', () => {
    expect(formatDuesCents('4500')).toBe('$45');
  });
});

describe('formatDuesDueDate', () => {
  it('formats a Postgres date', () => {
    expect(formatDuesDueDate('2026-04-15')).toBe('Apr 15');
    expect(formatDuesDueDate('2026-12-01')).toBe('Dec 1');
  });

  it('does not shift the day across a timezone', () => {
    // new Date('2026-01-01') is UTC midnight, which is Dec 31 in every
    // US timezone. Parsing the parts avoids that.
    expect(formatDuesDueDate('2026-01-01')).toBe('Jan 1');
  });

  it('null, empty and garbage render nothing', () => {
    expect(formatDuesDueDate(null)).toBeNull();
    expect(formatDuesDueDate('')).toBeNull();
    expect(formatDuesDueDate('   ')).toBeNull();
    expect(formatDuesDueDate('not a date')).toBeNull();
    expect(formatDuesDueDate('2026-13-01')).toBeNull();
    expect(formatDuesDueDate(20260415)).toBeNull();
  });
});

describe('formatDuesLine', () => {
  it('amount with a due date', () => {
    expect(formatDuesLine(4500, '2026-04-15')).toBe('$45 · due Apr 15');
  });

  it('amount with no date', () => {
    expect(formatDuesLine(4500, null)).toBe('$45');
    expect(formatDuesLine(4500, 'garbage')).toBe('$45');
  });

  it('a date with no amount is still nothing — the amount leads', () => {
    expect(formatDuesLine(0, '2026-04-15')).toBeNull();
  });
});

// ── The web Season dues setting (Manage → Season dues) ────────────
// Mirrors fairwayiq-flutter lib/features/leagues/widgets/
// league_dues_dialog.dart (`duesCentsFromInput`: dollars → whole cents,
// clamped at 0; blank = 0 = no dues; optional yyyy-MM-dd date) and the
// DB's `leagues_dues_cents_chk` (dues_cents >= 0).
import { MAX_DUES_CENTS, validateDuesPatch } from './leagueDues';

describe('validateDuesPatch', () => {
  it('accepts whole cents from 0 (no dues) to the ceiling', () => {
    expect(validateDuesPatch({ dues_cents: 0 })).toBeNull();
    expect(validateDuesPatch({ dues_cents: 4500 })).toBeNull();
    expect(validateDuesPatch({ dues_cents: 4550 })).toBeNull();
    expect(validateDuesPatch({ dues_cents: MAX_DUES_CENTS })).toBeNull();
  });

  it('refuses negative, fractional, huge and non-numeric amounts', () => {
    expect(validateDuesPatch({ dues_cents: -1 })).toEqual({ field: 'dues_cents', message: 'Season dues cannot be negative.' });
    expect(validateDuesPatch({ dues_cents: 45.5 })?.message).toMatch(/whole number of cents/);
    expect(validateDuesPatch({ dues_cents: MAX_DUES_CENTS + 1 })?.message).toMatch(/too large/);
    for (const bad of [NaN, Infinity, '4500', null, true]) {
      expect(validateDuesPatch({ dues_cents: bad })?.field, String(bad)).toBe('dues_cents');
    }
  });

  it('a due date is optional: null clears it, a real day is kept', () => {
    expect(validateDuesPatch({ dues_due_date: null })).toBeNull();
    expect(validateDuesPatch({ dues_due_date: '2027-04-15' })).toBeNull();
    expect(validateDuesPatch({ dues_due_date: '2028-02-29' })).toBeNull();
  });

  it('refuses a date that is not a real yyyy-MM-dd day', () => {
    for (const bad of ['2027-02-30', '2027-13-01', '04/15/2027', '2027-4-15', 'soon', '', 20270415, '0202-04-15']) {
      expect(validateDuesPatch({ dues_due_date: bad })?.field, String(bad)).toBe('dues_due_date');
    }
  });

  it('ignores every other column', () => {
    expect(validateDuesPatch({ timezone: 'nonsense', team_size: -4 })).toBeNull();
  });
});
