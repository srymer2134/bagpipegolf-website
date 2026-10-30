import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

// The league plan's public terms (LEAGUE_SUBSCRIPTION_AND_PLAN_GATING_PLAN.md,
// flutter repo). Every host-facing page states the same price, and none of
// them still says hosting is "free for a limited time".
const pricing = readFileSync('src/pages/pricing.astro', 'utf8');
const getStarted = readFileSync('src/pages/leagues/get-started.astro', 'utf8');

describe('pricing copy — the league plan', () => {
  it('states the three plans Sam set on 2026-10-30, and players free', () => {
    // Single event: free up to 36 players, $240 at 37+ (Sam 2026-10-25; briefly $170 on 2026-10-30, reverted).
    expect(pricing).toMatch(/<span class="chip">Single event<\/span>\s*<h3>\$240 <span class="card__per">\/ per event/);
    expect(pricing).toMatch(/Free up to 36 players\.<\/strong> \$240 per tournament for a field of 37 or more/);
    expect(pricing).not.toMatch(/under 36|36 or more/);
    // League: $2,140 ($2,000 until 2026-10-30).
    expect(pricing).toMatch(/\$2,140 <span class="card__per">\/ year per league/);
    expect(pricing).toMatch(/One league, one login, unlimited events/);
    // P7 (Sam 2026-10-30): stroke + match pair counts as one League plan.
    expect(pricing).toMatch(/a season-long match-play series as a free companion league/);
    // Club: $2,970, unlimited leagues, up to 4 admin accounts (Sam
    // 2026-10-30). No checkout yet, so its call to action is an email.
    expect(pricing).toMatch(/<span class="chip">Club<\/span>\s*<h3>\$2,970/);
    expect(pricing).toMatch(/Unlimited leagues, up to 4 admins/);
    // F10 (Sam 2026-10-30): no 'share the work' promise until shared management ships.
    expect(pricing).not.toMatch(/share the work/i);
    expect(pricing.replace(/<!--[\s\S]*?-->/g, '')).not.toMatch(/up to 4 leagues/i);
    expect(pricing).toContain('mailto:hello@bagpipegolf.com?subject=Club%20plan');
    expect(pricing).toMatch(/Players are always free/);
    // League trial (api 20261115): 30 days, no card, one per director.
    expect(pricing).toMatch(/30-day free trial · no card needed/);
    expect(pricing).toMatch(/Try it free for 30 days\.<\/strong> No card needed/);
    expect(pricing).toMatch(/One free trial per organizer/);
    // No old figure left anywhere on the page outside the source comments.
    const visible = pricing.replace(/<!--[\s\S]*?-->/g, '');
    expect(visible).not.toMatch(/\$2,000 \/ year per league|\$170/);
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

  it('carries no stale tournament price and drops "limited time"', () => {
    // The plan's earlier figure was $250; Sam set $240 on 2026-10-25 (briefly $170 on 2026-10-30, reverted).
    expect(pricing).not.toMatch(/\$250/);
    expect(pricing).not.toMatch(/limited time/i);
    expect(getStarted).not.toMatch(/limited time/i);
    expect(getStarted).toContain('/pricing#league-plan');
  });
});
