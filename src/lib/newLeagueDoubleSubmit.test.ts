import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

// /app/leagues/new relabels its submit button "Open the league" after a
// paywall or a dates error. That button is still the form's submit button,
// so a click on it fires the submit handler again. Wiring the relabelled
// button with `btn.onclick` navigated AND re-submitted, which created a
// second identical league — two "Gate Test" rows six seconds apart on dev,
// 2026-10-25. The handler must short-circuit once the league exists.
describe('new league: no second create after the league exists', () => {
  const src = readFileSync('src/pages/app/leagues/new.astro', 'utf8');
  const handler = src.slice(src.indexOf("form.addEventListener('submit'"));

  it('the submit handler navigates instead of posting once a league was created', () => {
    const guard = handler.indexOf('if (createdHref)');
    const post = handler.indexOf("fetch('/api/leagues/create'");
    expect(guard).toBeGreaterThan(-1);
    expect(post).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(post);
  });

  it('both "Open the league" branches record the league instead of adding a click handler', () => {
    expect(src).not.toMatch(/btn\.onclick/);
    expect(src.match(/createdHref = `\/app\/leagues\//g)?.length).toBe(2);
  });
});
