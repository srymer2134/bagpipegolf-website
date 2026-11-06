import { describe, expect, it } from 'vitest';
import { buttonPrice, moneyFromCents, promoViewFrom } from './promoPreview';

const during = new Date('2026-11-10T12:00:00Z');
const after = new Date('2027-01-02T12:00:00Z');

describe('promoViewFrom', () => {
  it('no code is no code', () => {
    expect(promoViewFrom('club', null, null)).toEqual({ kind: 'none' });
  });
  it('shows what Stripe says the code does', () => {
    const v = promoViewFrom('club', 'bpgolffounders1club', {
      valid: true, code: 'BPGolfFounders1Club', list_cents: 297000, first_payment_cents: 100,
    });
    expect(v).toEqual({ kind: 'applied', code: 'BPGolfFounders1Club', firstCents: 100, listCents: 297000 });
  });
  it('tells a code for another plan from one Stripe does not know', () => {
    expect(promoViewFrom('club', 'X1', { valid: false, reason: 'not_for_plan', list_cents: 1 }).kind).toBe('not_for_plan');
    expect(promoViewFrom('club', 'X1', { valid: false, reason: 'unknown', list_cents: 1 }).kind).toBe('unknown');
  });
  it('with no API answer the launch code keeps its known price, and others stay unchecked', () => {
    expect(promoViewFrom('club', 'bagpipe50', null, during)).toEqual({
      kind: 'applied', code: 'Bagpipe50', firstCents: 148500, listCents: 297000,
    });
    expect(promoViewFrom('club', 'Bagpipe50', null, after).kind).toBe('unchecked');
    expect(promoViewFrom('club', 'Other1', null, during).kind).toBe('unchecked');
  });
});

describe('prices', () => {
  it('formats cents', () => {
    expect(moneyFromCents(100)).toBe('$1');
    expect(moneyFromCents(148500)).toBe('$1,485');
    expect(moneyFromCents(1250)).toBe('$12.50');
  });
  it('a button quotes the first payment only while a code applies', () => {
    const applied = { kind: 'applied', code: 'X', firstCents: 100, listCents: 297000 } as const;
    expect(buttonPrice(applied, 'club', '$2,970 / year')).toBe('$1 first year');
    expect(buttonPrice(applied, 'event', '$240')).toBe('$1');
    expect(buttonPrice({ kind: 'unknown', code: 'X' }, 'club', '$2,970 / year')).toBe('$2,970 / year');
    expect(buttonPrice({ kind: 'none' }, 'league', '$2,140 / year')).toBe('$2,140 / year');
  });
});
