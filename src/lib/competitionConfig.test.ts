// ============================================================
// Competition config — the two-representation trap, pinned
// ============================================================
// W4b config side. The thing under test is not "does a checkbox
// round-trip" but "does a write leave the tournament internally
// consistent".
//
// A tournament stores which field-wide competitions exist TWICE: the
// v1 flags and the v2 `pools` array. `Tournament.fromJson` prefers
// `pools` when present (`wirePools ?? derive(...)`) and `toApiJson`
// always emits it — but `resolveCtpHolesFor` reads the v1 FLAG.
//
// So a write that updates one and not the other produces a tournament
// where CTP pickers exist but no CTP pool does, or vice versa, with no
// error anywhere. Every assertion about `buildCompetitionPatch` below
// is really an assertion that both halves moved together.

import { describe, expect, it } from 'vitest';

import {
  EMPTY_CONFIG,
  buildCompetitionPatch,
  buildPools,
  fieldGenderOf,
  ldPoolGenders,
  parseCompetitionConfig,
  readCompetitionConfig,
  type CompetitionConfig,
} from './competitionConfig';
import type { TournamentRow } from './tournamentQueries';

const t = (o: Record<string, unknown>) => o as unknown as TournamentRow;
const cfg = (over: Partial<CompetitionConfig> = {}): CompetitionConfig =>
  ({ ...EMPTY_CONFIG, ...over });

describe('fieldGenderOf', () => {
  it('defaults to male, because the wire omits the key when male', () => {
    // toApiJson: `if (fieldGender != 'male') 'field_gender': ...`
    expect(fieldGenderOf(t({}))).toBe('male');
    expect(fieldGenderOf(t({ field_gender: 'mixed' }))).toBe('mixed');
    expect(fieldGenderOf(t({ field_gender: ' FEMALE ' }))).toBe('female');
    expect(fieldGenderOf(t({ fieldGender: 'mixed' }))).toBe('mixed');
  });
});

describe('buildCompetitionPatch writes BOTH representations', () => {
  it('emits the v1 flags AND a matching pools array', () => {
    const patch = buildCompetitionPatch(
      cfg({ skins: ['gross_skins'], closestToPin: true }),
      'male',
    );
    expect(patch.skins_competitions).toEqual(['gross_skins']);
    expect(patch.track_ctp_on_par3s).toBe(true);
    expect(patch.pools).toEqual([
      { id: 'legacy_gross_skins', kind: 'gross_skins' },
      { id: 'legacy_closest_to_pin', kind: 'closest_to_pin' },
    ]);
  });

  it('sends FALSE explicitly when a competition is turned off', () => {
    // The app only ever emits these keys when true, but in a PATCH an
    // absent key means "leave unchanged" — so turning CTP off requires
    // the explicit false, or the change silently does nothing.
    const patch = buildCompetitionPatch(EMPTY_CONFIG, 'male');
    expect(patch.track_ctp_on_par3s).toBe(false);
    expect(patch.track_longest_drive).toBe(false);
    expect(patch.skins_competitions).toEqual([]);
    expect(patch.pools).toEqual([]);
  });

  it('never leaves pools disagreeing with the flags', () => {
    // The invariant, stated directly: for any config, pools must be
    // empty exactly when every flag is off.
    const configs: CompetitionConfig[] = [
      EMPTY_CONFIG,
      cfg({ skins: ['net_skins'] }),
      cfg({ closestToPin: true }),
      cfg({ longestDrive: true }),
      cfg({ skins: ['gross_skins', 'super_skins'], closestToPin: true, longestDrive: true }),
    ];
    for (const c of configs) {
      for (const field of ['male', 'female', 'mixed']) {
        const p = buildCompetitionPatch(c, field);
        const anyFlag = (p.skins_competitions as string[]).length > 0
          || p.track_ctp_on_par3s === true
          || p.track_longest_drive === true;
        const anyPool = (p.pools as unknown[]).length > 0;
        expect(anyPool).toBe(anyFlag);
      }
    }
  });

  it('keeps skins in a stable order so re-saving is not a diff', () => {
    const a = buildCompetitionPatch(
      cfg({ skins: ['super_skins', 'gross_skins'] }), 'male');
    const b = buildCompetitionPatch(
      cfg({ skins: ['gross_skins', 'super_skins'] }), 'male');
    expect(a).toEqual(b);
    expect(a.skins_competitions).toEqual(['gross_skins', 'super_skins']);
  });
});

describe('longest drive brackets follow the wizard, not the checkbox', () => {
  it('a single-gender field gets ONE pool tagged with that gender', () => {
    expect(ldPoolGenders(cfg({ longestDrive: true }), 'male')).toEqual(['male']);
    expect(ldPoolGenders(cfg({ longestDrive: true }), 'female')).toEqual(['female']);
    expect(buildPools(cfg({ longestDrive: true }), 'female')).toEqual([
      { id: 'legacy_longest_drive_female', kind: 'longest_drive',
        config: { gender: 'female' } },
    ]);
  });

  it('a single-gender field leaves longest_drive_genders NULL', () => {
    // Mirrors the wizard: that column only carries an explicit MIXED
    // pick; a single-gender field lets the pool's tag carry it.
    const patch = buildCompetitionPatch(cfg({ longestDrive: true }), 'female');
    expect(patch.longest_drive_genders).toBeNull();
    expect((patch.pools as Record<string, unknown>[])[0].config)
      .toEqual({ gender: 'female' });
  });

  it('a single-gender field IGNORES a stale gender pick', () => {
    expect(ldPoolGenders(
      cfg({ longestDrive: true, longestDriveGenders: ['male'] }), 'female',
    )).toEqual(['female']);
  });

  it('mixed + picks yields one pool per pick', () => {
    expect(buildPools(
      cfg({ longestDrive: true, longestDriveGenders: ['male', 'female'] }), 'mixed',
    )).toEqual([
      { id: 'legacy_longest_drive_male', kind: 'longest_drive', config: { gender: 'male' } },
      { id: 'legacy_longest_drive_female', kind: 'longest_drive', config: { gender: 'female' } },
    ]);
  });

  it('mixed + NO picks yields one untagged pool — the legacy shape', () => {
    // `_derivePoolsFromLegacyFields`: empty genders -> a single pool
    // with no gender filter, which renders both rows.
    expect(buildPools(cfg({ longestDrive: true }), 'mixed')).toEqual([
      { id: 'legacy_longest_drive', kind: 'longest_drive' },
    ]);
    expect(buildCompetitionPatch(cfg({ longestDrive: true }), 'mixed')
      .longest_drive_genders).toBeNull();
  });

  it('emits no LD pool at all when longest drive is off', () => {
    expect(buildPools(cfg({ longestDriveGenders: ['male'] }), 'mixed')).toEqual([]);
  });
});

describe('buy-ins', () => {
  it('are omitted when zero, matching TournamentPool.toJson', () => {
    const pools = buildPools(cfg({ skins: ['gross_skins'] }), 'male');
    expect(pools[0]).toEqual({ id: 'legacy_gross_skins', kind: 'gross_skins' });
    expect('buy_in_amount' in pools[0]).toBe(false);
  });

  it('are attached per kind when set', () => {
    const pools = buildPools(
      cfg({ skins: ['gross_skins'], closestToPin: true,
            buyIns: { gross_skins: 20, closest_to_pin: 5 } }),
      'male',
    );
    expect(pools[0].buy_in_amount).toBe(20);
    expect(pools[1].buy_in_amount).toBe(5);
  });

  it('apply to EVERY gendered LD pool', () => {
    const pools = buildPools(
      cfg({ longestDrive: true, longestDriveGenders: ['male', 'female'],
            buyIns: { longest_drive: 10 } }),
      'mixed',
    );
    expect(pools.map((p) => p.buy_in_amount)).toEqual([10, 10]);
  });
});

describe('readCompetitionConfig', () => {
  it('prefers pools, because fromJson does', () => {
    // A tournament whose flags and pools disagree: pools must win,
    // since that is what the app is acting on.
    const c = readCompetitionConfig(t({
      track_ctp_on_par3s: true,
      skins_competitions: ['net_skins'],
      pools: [{ id: 'legacy_gross_skins', kind: 'gross_skins' }],
    }));
    expect(c.skins).toEqual(['gross_skins']);
    expect(c.closestToPin).toBe(false);
  });

  it('falls back to the v1 flags when there are no pools', () => {
    const c = readCompetitionConfig(t({
      skins_competitions: ['net_skins', 'super_skins'],
      track_ctp_on_par3s: true,
      track_longest_drive: true,
      longest_drive_genders: ['female'],
      field_gender: 'mixed',
    }));
    expect(c.skins).toEqual(['net_skins', 'super_skins']);
    expect(c.closestToPin).toBe(true);
    expect(c.longestDrive).toBe(true);
    expect(c.longestDriveGenders).toEqual(['female']);
  });

  it('reads buy-ins back off the pools', () => {
    const c = readCompetitionConfig(t({
      pools: [{ id: 'legacy_net_skins', kind: 'net_skins', buy_in_amount: 25 }],
    }));
    expect(c.buyIns.net_skins).toBe(25);
  });

  it('does not report a single-gender pool tag as a director pick', () => {
    // Otherwise a re-save would write longest_drive_genders on a
    // single-gender event, which the wizard never does.
    const c = readCompetitionConfig(t({
      field_gender: 'female',
      pools: [{ id: 'legacy_longest_drive_female', kind: 'longest_drive',
                config: { gender: 'female' } }],
    }));
    expect(c.longestDrive).toBe(true);
    expect(c.longestDriveGenders).toEqual([]);
  });

  it('ignores a pool kind it does not know', () => {
    // Forward compatibility: a future kind must not be read as skins.
    const c = readCompetitionConfig(t({
      pools: [{ id: 'x', kind: 'deuces_pool' }],
    }));
    expect(c.skins).toEqual([]);
    expect(c.closestToPin).toBe(false);
    expect(c.longestDrive).toBe(false);
  });

  it('survives junk', () => {
    expect(readCompetitionConfig(t({ pools: 'nope' }))).toEqual(EMPTY_CONFIG);
    expect(readCompetitionConfig(t({ pools: [null, 7] }))).toEqual(EMPTY_CONFIG);
    expect(readCompetitionConfig(t({}))).toEqual(EMPTY_CONFIG);
  });
});

describe('round-trip: read -> patch -> read is stable', () => {
  // The practical guard against spurious diffs and slow drift: saving
  // an unchanged configuration must not change the stored shape.
  const cases: Array<[string, Record<string, unknown>]> = [
    ['men + skins + ctp', {
      skins_competitions: ['gross_skins', 'net_skins'],
      track_ctp_on_par3s: true,
    }],
    ['women + LD', { field_gender: 'female', track_longest_drive: true }],
    ['mixed + LD both picked', {
      field_gender: 'mixed', track_longest_drive: true,
      longest_drive_genders: ['male', 'female'],
    }],
    ['mixed + LD legacy untagged', {
      field_gender: 'mixed', track_longest_drive: true,
    }],
    ['everything off', {}],
  ];

  for (const [label, row] of cases) {
    it(label, () => {
      const tr = t(row);
      const field = fieldGenderOf(tr);
      const first = readCompetitionConfig(tr);
      const patch = buildCompetitionPatch(first, field);
      // Feed the patch back in as a stored row and re-read.
      const second = readCompetitionConfig(t({ ...row, ...patch }));
      expect(second).toEqual(first);
      // And a second patch must be byte-identical to the first.
      expect(buildCompetitionPatch(second, field)).toEqual(patch);
    });
  }
});

describe('parseCompetitionConfig rejects hostile input', () => {
  it('keeps only known skins kinds', () => {
    expect(parseCompetitionConfig({ skins: ['gross_skins', 'evil'] }).skins)
      .toEqual(['gross_skins']);
  });

  it('requires booleans, not truthy values', () => {
    expect(parseCompetitionConfig({ closestToPin: 'yes' }).closestToPin).toBe(false);
    expect(parseCompetitionConfig({ closestToPin: 1 }).closestToPin).toBe(false);
    expect(parseCompetitionConfig({ closestToPin: true }).closestToPin).toBe(true);
  });

  it('drops a negative or absurd buy-in rather than clamping it', () => {
    // Clamping a typo to a boundary turns it into a real pot.
    const c = parseCompetitionConfig({
      buyIns: { gross_skins: -5, net_skins: 0, super_skins: 1e9, closest_to_pin: 20 },
    });
    expect(c.buyIns).toEqual({ closest_to_pin: 20 });
  });

  it('normalises and dedupes genders', () => {
    expect(parseCompetitionConfig({
      longestDriveGenders: ['MALE', ' male ', 'female', 'other'],
    }).longestDriveGenders).toEqual(['male', 'female']);
  });

  it('returns the empty config for nothing at all', () => {
    expect(parseCompetitionConfig(undefined)).toEqual(EMPTY_CONFIG);
    expect(parseCompetitionConfig(null)).toEqual(EMPTY_CONFIG);
  });
});
