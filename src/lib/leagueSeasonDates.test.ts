import { describe, expect, it } from 'vitest';
import {
  addDays,
  datedSlots,
  daysBetween,
  parseIsoDate,
  seedFromDates,
  spaceDates,
  validateSeasonDates,
  weekRowsFor,
} from './leagueSeasonDates';

describe('parseIsoDate', () => {
  it('reads a plain calendar date', () => {
    expect(parseIsoDate('2026-04-15')).toEqual({ y: 2026, m: 4, d: 15 });
  });

  it('rejects anything else rather than guessing', () => {
    expect(parseIsoDate('')).toBeNull();
    expect(parseIsoDate('15/04/2026')).toBeNull();
    expect(parseIsoDate('2026-13-01')).toBeNull();
    expect(parseIsoDate('2026-04-15T10:00:00Z')).toBeNull();
    expect(parseIsoDate(20260415)).toBeNull();
  });
});

describe('daysBetween / addDays', () => {
  it('counts calendar days, not timezone hours', () => {
    expect(daysBetween('2026-04-15', '2026-04-22')).toBe(7);
    expect(daysBetween('2026-04-22', '2026-04-15')).toBe(-7);
    expect(daysBetween('2026-01-01', '2026-01-01')).toBe(0);
  });

  it('crosses a DST boundary without drifting', () => {
    // US DST starts 2026-03-08. A naive local-time diff gives 6.958 days.
    expect(daysBetween('2026-03-05', '2026-03-12')).toBe(7);
    expect(addDays('2026-03-05', 7)).toBe('2026-03-12');
  });

  it('crosses a month and a year end', () => {
    expect(addDays('2026-01-30', 2)).toBe('2026-02-01');
    expect(addDays('2026-12-28', 7)).toBe('2027-01-04');
  });
});

describe('spaceDates — the optional helper that replaced "days apart"', () => {
  it('spaces weekly', () => {
    expect(spaceDates('2026-04-07', 4, 7)).toEqual([
      '2026-04-07', '2026-04-14', '2026-04-21', '2026-04-28',
    ]);
  });

  it('spaces monthly-ish without pretending to know "the third Saturday"', () => {
    expect(spaceDates('2026-04-15', 3, 30)).toEqual([
      '2026-04-15', '2026-05-15', '2026-06-14',
    ]);
  });

  it('is a suggestion, not a cage — the caller edits any of them after', () => {
    const d = spaceDates('2026-04-07', 3, 7);
    d[1] = '2026-04-18';
    expect(validateSeasonDates(d)).toEqual([]);
  });

  it('refuses nonsense input', () => {
    expect(spaceDates('nope', 4, 7)).toEqual([]);
    expect(spaceDates('2026-04-07', 0, 7)).toEqual([]);
  });
});

describe('validateSeasonDates', () => {
  it('blanks are fine — a director may not know every date yet', () => {
    expect(validateSeasonDates(['2026-04-07', '', null, undefined])).toEqual([]);
  });

  it('two events on one day is the error that matters', () => {
    // league_weeks has unique (league_id, week_of); without this the
    // insert is a 23505 after the league already exists.
    const problems = validateSeasonDates(['2026-04-07', '2026-04-07']);
    expect(problems).toHaveLength(1);
    expect(problems[0].index).toBe(1);
    expect(problems[0].message).toMatch(/Events 1 and 2/);
  });

  it('an unreadable date is named by its event number', () => {
    const problems = validateSeasonDates(['2026-04-07', 'next tuesday']);
    expect(problems[0].message).toMatch(/Event 2/);
  });

  it('out-of-order dates are allowed — a rain-out gets rescheduled', () => {
    expect(validateSeasonDates(['2026-05-01', '2026-04-07'])).toEqual([]);
  });
});

describe('datedSlots / weekRowsFor', () => {
  it('keeps the slot index, so a blank can be filled in later', () => {
    expect(datedSlots(['2026-04-07', '', '2026-04-21'])).toEqual([
      { slot: 0, date: '2026-04-07' },
      { slot: 2, date: '2026-04-21' },
    ]);
  });

  it('builds only the rows that have a date — week_of is NOT NULL', () => {
    const rows = weekRowsFor('L1', ['2026-04-07', '', '2026-04-21']);
    expect(rows).toEqual([
      { league_id: 'L1', slot_index: 0, week_of: '2026-04-07' },
      { league_id: 'L1', slot_index: 2, week_of: '2026-04-21' },
    ]);
  });

  it('carries the course defaults when the league has them', () => {
    const rows = weekRowsFor('L1', ['2026-04-07'], { courseId: 'c1', tee: 'Blue', holes: 9 });
    expect(rows[0]).toMatchObject({ course_id: 'c1', tee: 'Blue', holes: 9 });
  });

  it('no dates means no rows, not an empty-string row', () => {
    expect(weekRowsFor('L1', ['', null])).toEqual([]);
  });
});

describe('seedFromDates — the jsonb every existing reader still gets', () => {
  it('infers the interval from the first two dates instead of asking', () => {
    expect(seedFromDates(['2026-04-07', '2026-04-14', '2026-04-21'], 3)).toEqual({
      startDate: '2026-04-07',
      intervalDays: 7,
      eventCount: 3,
    });
  });

  it('infers across a gap, dividing by the slots skipped', () => {
    // Events 1 and 3 dated, 28 days apart, two slots → 14.
    expect(seedFromDates(['2026-04-07', '', '2026-05-05'], 3)?.intervalDays).toBe(14);
  });

  it('a single date falls back to weekly rather than zero', () => {
    expect(seedFromDates(['2026-04-07', '', ''], 3)).toEqual({
      startDate: '2026-04-07',
      intervalDays: 7,
      eventCount: 3,
    });
  });

  it('irregular dates still produce a usable seed — it is only a hint', () => {
    const seed = seedFromDates(['2026-04-07', '2026-04-30', '2026-05-02'], 3);
    expect(seed?.startDate).toBe('2026-04-07');
    expect(seed?.intervalDays).toBe(23);
  });

  it('no dates at all means no schedule seed', () => {
    expect(seedFromDates(['', ''], 2)).toBeNull();
  });

  it('counts the events asked for, even when most are undated', () => {
    expect(seedFromDates(['2026-04-07', '', '', '', ''], 5)?.eventCount).toBe(5);
  });
});
