import { describe, expect, it } from 'vitest';
import type { LeagueBindingSource } from './leagueEvents';
import {
  WEEK_FORMATS,
  buildEventRows,
  findBinding,
  formatHelp,
  formatLabel,
  formatsToList,
  isTeamFormat,
  mixedFormatCaveat,
  rsvpSummary,
  sanitiseFormats,
} from './leagueEvents';

describe('WEEK_FORMATS', () => {
  it('carries the same wire values as Dart LeagueWeekFormat', () => {
    // lib/core/models/league.dart — a value the app cannot parse would
    // be dropped on the app's next schedule write.
    expect(WEEK_FORMATS.map((f) => f.wire).sort()).toEqual([
      'best_ball', 'match_play', 'other', 'scramble', 'stableford', 'stroke_play',
    ]);
  });

  it('uses the app\'s own labels, word for word', () => {
    // lib/core/models/league.dart LeagueWeekFormatX.label. A director
    // who sets a format on the web and opens the app must read the
    // same word for it.
    expect(Object.fromEntries(WEEK_FORMATS.map((f) => [f.wire, f.label]))).toEqual({
      stroke_play: 'Stroke play',
      scramble: 'Scramble',
      best_ball: 'Best ball',
      stableford: 'Stableford',
      match_play: 'Match play',
      other: 'Other',
    });
  });

  it('never shows a raw wire value to a director', () => {
    for (const f of WEEK_FORMATS) {
      expect(f.label).not.toMatch(/_/);
      expect(f.label[0]).toBe(f.label[0].toUpperCase());
      expect(f.help.length).toBeGreaterThan(10);
    }
  });

  it('calls exactly scramble and best ball team formats', () => {
    // Dart's LeagueWeekFormat.isTeam. Match play is NOT a team format —
    // a match-play week still produces one gross score per player,
    // which is why it can sit mid-season anywhere.
    expect(WEEK_FORMATS.filter((f) => f.isTeam).map((f) => f.wire).sort())
      .toEqual(['best_ball', 'scramble']);
    expect(isTeamFormat('match_play')).toBe(false);
  });
});

describe('formatLabel / formatHelp', () => {
  it('are null for an unknown or missing value rather than echoing it', () => {
    expect(formatLabel('')).toBeNull();
    expect(formatLabel(null)).toBeNull();
    expect(formatLabel('invented')).toBeNull();
    expect(formatHelp('match_play')).toContain('Hole by hole');
  });
});

describe('sanitiseFormats', () => {
  it('keeps only known values, keyed by slot', () => {
    expect(sanitiseFormats(['stroke_play', '', 'match_play'])).toEqual({
      '0': 'stroke_play', '2': 'match_play',
    });
  });

  it('drops a value this deploy does not know', () => {
    expect(sanitiseFormats(['shamble'])).toEqual({});
  });

  it('treats whitespace as undeclared', () => {
    expect(sanitiseFormats(['  '])).toEqual({});
  });
});

describe('formatsToList', () => {
  it('is one entry per event, blank where undeclared', () => {
    expect(formatsToList({ '1': 'match_play' }, 3)).toEqual(['', 'match_play', '']);
  });

  it('caps at the schedule ceiling and floors at zero', () => {
    expect(formatsToList({}, 999).length).toBe(52);
    expect(formatsToList({}, -4)).toEqual([]);
  });
});

describe('mixedFormatCaveat — the mid-season format question', () => {
  it('says nothing for a match-play league with a match-play week', () => {
    // The whole point: a match play event mid-season is fine. Season
    // points come from points_model, the week is scored by its own
    // tournament.
    expect(mixedFormatCaveat('match_play', {
      '0': 'stroke_play', '4': 'match_play',
    })).toBeNull();
  });

  it('says nothing for a position league either', () => {
    expect(mixedFormatCaveat('position', {
      '0': 'stroke_play', '4': 'match_play', '7': 'scramble',
    })).toBeNull();
  });

  it('flags a stroke-aggregate season that mixes in a team week', () => {
    const msg = mixedFormatCaveat('stroke_aggregate', {
      '0': 'stroke_play', '4': 'scramble',
    });
    expect(msg).toContain('Scramble');
    expect(msg).toMatch(/not comparable/);
  });

  it('does NOT flag stroke aggregate for a match-play week', () => {
    // Match play produces an individual gross score, so it rolls up.
    expect(mixedFormatCaveat('stroke_aggregate', {
      '0': 'stroke_play', '4': 'match_play',
    })).toBeNull();
  });

  it('does not flag a season that is entirely one team format', () => {
    expect(mixedFormatCaveat('stroke_aggregate', {
      '0': 'scramble', '1': 'scramble',
    })).toBeNull();
  });

  it('is labelling only — it never claims anything was blocked', () => {
    const msg = mixedFormatCaveat('stroke_aggregate', {
      '0': 'stroke_play', '1': 'best_ball',
    })!;
    expect(msg).toMatch(/still add them up/);
  });

  it('is quiet when nothing is declared', () => {
    expect(mixedFormatCaveat('stroke_aggregate', {})).toBeNull();
    expect(mixedFormatCaveat('stroke_aggregate', null)).toBeNull();
  });
});

describe('buildEventRows', () => {
  const tournaments = new Map([
    ['t-mine', { id: 't-mine', name: 'Opening Day', user_id: 'me', completed_at: null }],
    ['t-theirs', { id: 't-theirs', name: 'Club Open', user_id: 'someone', completed_at: '2026-05-01' }],
  ]);

  const rows = buildEventRows({
    count: 4,
    dates: ['2026-05-07', '2026-05-14', '', '2026-05-28'],
    names: { '0': 'Opening Scramble', '1': '   ' },
    formats: { '0': 'scramble', '2': 'match_play' },
    bindings: { '0': 't-mine', '1': 't-theirs', '3': 't-missing' },
    tournaments,
    viewerId: 'me',
  });

  it('is one row per event, in slot order', () => {
    expect(rows.map((r) => r.slot)).toEqual([0, 1, 2, 3]);
  });

  it('falls back to "Event N" for a blank or absent name', () => {
    expect(rows[0].name).toBe('Opening Scramble');
    expect(rows[1].name).toBe('Event 2');
    expect(rows[2].name).toBe('Event 3');
  });

  it('lets the viewer manage only a tournament they own', () => {
    expect(rows[0].canManage).toBe(true);
    expect(rows[1].canManage).toBe(false); // readable, not editable
    expect(rows[1].tournament?.name).toBe('Club Open');
  });

  it('treats a binding whose tournament is gone as unbound', () => {
    // A deleted tournament leaves a stale id in the jsonb. The row must
    // not render a dead Manage link.
    expect(rows[3].tournament).toBeNull();
    expect(rows[3].canManage).toBe(false);
  });

  it('carries the declared format and the completed flag', () => {
    expect(rows[0].format).toBe('scramble');
    expect(rows[2].format).toBe('match_play');
    expect(rows[1].completed).toBe(true);
    expect(rows[0].completed).toBe(false);
  });

  it('nobody can manage anything when signed out', () => {
    const anon = buildEventRows({
      count: 1, dates: [], names: null, formats: null,
      bindings: { '0': 't-mine' }, tournaments, viewerId: null,
    });
    expect(anon[0].canManage).toBe(false);
  });
});

describe('findBinding', () => {
  const leagues: LeagueBindingSource[] = [
    {
      id: 'l1', name: 'Tuesday Night', points_model: 'match_play', role: 'commissioner',
      schedule: {
        bindings: { '3': 't-week4' },
        names: { '3': 'Match Play Night' },
        formats: { '3': 'match_play' },
      },
    },
    {
      id: 'l2', name: 'Saturday Skins', points_model: 'position', role: 'member',
      schedule: { bindings: { '0': 't-other' } },
    },
  ];

  it('finds the league and slot a tournament is bound to', () => {
    const ctx = findBinding(leagues, 't-week4')!;
    expect(ctx.leagueId).toBe('l1');
    expect(ctx.slot).toBe(3);
    expect(ctx.eventName).toBe('Match Play Night');
    expect(ctx.format).toBe('match_play');
    expect(ctx.isLeagueDirector).toBe(true);
  });

  it('reports a member as not the director', () => {
    expect(findBinding(leagues, 't-other')!.isLeagueDirector).toBe(false);
  });

  it('names an unnamed slot "Event N", 1-based', () => {
    expect(findBinding(leagues, 't-other')!.eventName).toBe('Event 1');
  });

  it('is null for a tournament no league of this user points at', () => {
    expect(findBinding(leagues, 't-standalone')).toBeNull();
    expect(findBinding([], 't-week4')).toBeNull();
  });

  it('ignores a non-numeric slot key rather than throwing', () => {
    const junk: LeagueBindingSource[] = [{
      id: 'l3', name: 'Bad', points_model: null, role: 'commissioner',
      schedule: { bindings: { notaslot: 't-x' } },
    }];
    expect(findBinding(junk, 't-x')).toBeNull();
  });
});

describe('rsvpSummary', () => {
  it('reads as a sentence fragment, not a pair of raw counts', () => {
    expect(rsvpSummary({ in: 4, out: 1 })).toBe('4 in · 1 out');
    expect(rsvpSummary({ in: 1, out: 0 })).toBe('1 in');
    expect(rsvpSummary({ in: 0, out: 2 })).toBe('2 out');
  });

  it('is null when nobody has answered, so no empty row renders', () => {
    expect(rsvpSummary({ in: 0, out: 0 })).toBeNull();
    expect(rsvpSummary(undefined)).toBeNull();
  });
});
