// POST /api/leagues/[id]/events — what one write does to the bindings
// (billing Phase 1c adds MOVE and stops a silent overwrite).

import { describe, expect, it } from 'vitest';
import { planBinding } from './leagueEventBind';

const base = { '0': 't_a', '3': 't_b' };

describe('planBinding', () => {
  it('binds a new tournament to an empty event — and asks for an ownership check', () => {
    const r = planBinding({ bindings: base, eventIds: [], slot: 1, tid: 't_new', move: false });
    expect(r).toEqual({ ok: true, bindings: { ...base, '1': 't_new' }, needsOwnership: true });
  });

  it('unbinds with an empty id', () => {
    const r = planBinding({ bindings: base, eventIds: [], slot: 0, tid: '', move: false });
    expect(r).toEqual({ ok: true, bindings: { '3': 't_b' }, needsOwnership: false });
  });

  it('already bound elsewhere, no move → 409 already_bound naming the slot', () => {
    const r = planBinding({ bindings: base, eventIds: [], slot: 1, tid: 't_b', move: false });
    expect(r).toMatchObject({ ok: false, status: 409, code: 'already_bound', boundSlot: 3 });
    if (!r.ok) expect(r.error).toMatch(/event 4/);
  });

  it('MOVE: the old slot is cleared in the same write, and no ownership check', () => {
    const r = planBinding({ bindings: base, eventIds: [], slot: 1, tid: 't_b', move: true });
    expect(r).toEqual({ ok: true, bindings: { '0': 't_a', '1': 't_b' }, needsOwnership: false });
  });

  it('MOVE never leaves the tournament on two events', () => {
    const r = planBinding({ bindings: base, eventIds: [], slot: 5, tid: 't_a', move: true });
    expect(r.ok && Object.values(r.bindings).filter((v) => v === 't_a')).toEqual(['t_a']);
  });

  it('destination holds a DIFFERENT tournament → 409 destination_occupied, nothing dropped', () => {
    for (const move of [true, false]) {
      const r = planBinding({ bindings: base, eventIds: [], slot: 3, tid: 't_a', move });
      expect(r).toMatchObject({ ok: false, status: 409, code: 'destination_occupied' });
    }
    const plain = planBinding({ bindings: base, eventIds: [], slot: 0, tid: 't_new', move: false });
    expect(plain).toMatchObject({ ok: false, code: 'destination_occupied' });
  });

  it('re-binding the same tournament to its own event is a no-op', () => {
    const r = planBinding({ bindings: base, eventIds: [], slot: 0, tid: 't_a', move: false });
    expect(r).toEqual({ ok: true, bindings: base, needsOwnership: false });
  });

  it('an id in event_tournament_ids but on no slot: a plain bind, no ownership check', () => {
    for (const move of [true, false]) {
      const r = planBinding({ bindings: base, eventIds: ['t_app'], slot: 1, tid: 't_app', move });
      expect(r).toEqual({ ok: true, bindings: { ...base, '1': 't_app' }, needsOwnership: false });
    }
  });

  it('never mutates the input', () => {
    const b = { ...base };
    planBinding({ bindings: b, eventIds: [], slot: 1, tid: 't_b', move: true });
    expect(b).toEqual(base);
  });
});
