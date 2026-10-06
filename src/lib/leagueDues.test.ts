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
