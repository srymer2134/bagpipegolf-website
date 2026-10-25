import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

// The league plan's public terms (LEAGUE_SUBSCRIPTION_AND_PLAN_GATING_PLAN.md,
// flutter repo). Every host-facing page states the same price, and none of
// them still says hosting is "free for a limited time".
const pricing = readFileSync('src/pages/pricing.astro', 'utf8');
const getStarted = readFileSync('src/pages/leagues/get-started.astro', 'utf8');

describe('pricing copy — the league plan', () => {
  it('states $2,000 a year per league, and that players and tournaments are free', () => {
    expect(pricing).toMatch(/\$2,000 <span class="card__per">\/ year per league/);
    expect(pricing).toMatch(/<span class="chip">Players<\/span>\s*<h3>Free<\/h3>/);
    expect(pricing).toMatch(/<span class="chip">Tournaments<\/span>\s*<h3>Free<\/h3>/);
  });

  it('states the terms Sam set: 12 months, renews, card, moves once a year, existing leagues free for 12 months', () => {
    const d = pricing.slice(pricing.indexOf('id="league-plan-details"'));
    expect(d).toMatch(/12 months/);
    expect(d).toMatch(/renews each year/);
    expect(d).toMatch(/Paid by card/);
    expect(d).toMatch(/once a year/);
    expect(d).toMatch(/Already running a league on Bagpipe\?<\/strong> It stays free\s+for 12 months/);
    // Sam, 2026-10-25: discounted rates for smaller leagues, by email.
    expect(d).toMatch(/Smaller league\?<\/strong> Discounted rates are available/);
    expect(d).toContain('mailto:hello@bagpipegolf.com?subject=Smaller%20league%20pricing');
  });

  it('promises nothing about one-off event pricing (Phase 3) and drops "limited time"', () => {
    expect(pricing).not.toMatch(/\$250/);
    expect(pricing).not.toMatch(/limited time/i);
    expect(getStarted).not.toMatch(/limited time/i);
    expect(getStarted).toContain('/pricing#league-plan');
  });
});
