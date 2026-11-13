import { describe, expect, it } from 'vitest';

import { faqEntries, interpolate } from './faq';
import { sideGames } from './sideGames';

describe('FAQ content', () => {
  it('loads the questions from content/faq (cannot pass vacuously)', () => {
    expect(faqEntries.length).toBeGreaterThanOrEqual(5);
  });

  it('is in Order, then alphabetical', () => {
    const questions = faqEntries.map((e) => e.question);
    expect(questions[0]).toMatch(/download the app to score/);
    expect(questions.at(-1)).toMatch(/without an account/);
  });

  it('substitutes {sideGameCount} rather than shipping the token', () => {
    const games = faqEntries.find((e) => /How many side games/.test(e.question));
    expect(games, 'the side-games question is missing').toBeDefined();
    expect(games!.answer).toContain(String(sideGames.length));
    expect(faqEntries.every((e) => !e.answer.includes('{sideGameCount}'))).toBe(true);
  });

  it('leaves text without a token alone', () => {
    expect(interpolate('No tokens here.')).toBe('No tokens here.');
    expect(interpolate('{sideGameCount} games')).toBe(`${sideGames.length} games`);
  });

  it('drops a half-written entry instead of rendering it blank', () => {
    // Keystatic writes a file as soon as someone clicks "new".
    expect(faqEntries.every((e) => e.question !== '' && e.answer !== '')).toBe(true);
  });

  it('gives every entry a stable slug', () => {
    const slugs = faqEntries.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs.every((s) => /^[a-z0-9-]+$/.test(s))).toBe(true);
  });
});
