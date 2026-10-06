import { describe, expect, it } from 'vitest';
import { displayEventName, namesToList, namesToMap } from './leagueEventNames';

describe('namesToMap', () => {
  it('keeps named slots and omits blanks', () => {
    expect(namesToMap(['Opening Scramble', '', '  ', 'Finale']))
      .toEqual({ '0': 'Opening Scramble', '3': 'Finale' });
  });

  it('trims, and "unnamed" is absence rather than an empty string', () => {
    expect(namesToMap(['  Member-Guest  '])).toEqual({ '0': 'Member-Guest' });
    expect(namesToMap(['', null, undefined])).toEqual({});
  });

  it('caps a name so one cannot bloat the jsonb', () => {
    expect(namesToMap(['x'.repeat(200)])['0']).toHaveLength(60);
  });
});

describe('namesToList', () => {
  it('fills gaps so the form can render one input per slot', () => {
    expect(namesToList({ '0': 'Opener', '2': 'Closer' }, 4))
      .toEqual(['Opener', '', 'Closer', '']);
  });

  it('handles no map at all', () => {
    expect(namesToList(null, 2)).toEqual(['', '']);
    expect(namesToList(undefined, 0)).toEqual([]);
  });

  it('never exceeds the 52-slot ceiling', () => {
    expect(namesToList({}, 500)).toHaveLength(52);
  });
});

describe('displayEventName', () => {
  it('falls back to the ordinal', () => {
    expect(displayEventName({ '0': 'Opener' }, 0)).toBe('Opener');
    expect(displayEventName({ '0': 'Opener' }, 1)).toBe('Event 2');
    expect(displayEventName({ '1': '   ' }, 1)).toBe('Event 2');
    expect(displayEventName(null, 4)).toBe('Event 5');
  });
});
