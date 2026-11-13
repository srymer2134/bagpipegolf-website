import { sideGames } from './sideGames';

/**
 * The FAQ, edited in Keystatic at /keystatic and stored as one JSON
 * file per question under content/faq/.
 *
 * Read at BUILD time through `import.meta.glob`, so the questions are
 * baked into the Worker bundle and cost nothing at request time. A
 * save in the CMS is a commit, a commit rebuilds the site, and the new
 * answer is live — there is no runtime read of the repo and no token
 * to keep anywhere.
 */
export type FaqEntry = {
  /** File slug — stable id, also the anchor-friendly name. */
  slug: string;
  question: string;
  /** Already interpolated; render as text. */
  answer: string;
};

/**
 * Tokens an editor may type into an answer, so a fact the site already
 * knows is never re-typed by hand.
 *
 * `{sideGameCount}` exists because this very FAQ once answered "30+"
 * while the library held 34 (see gameCount.test.ts). In the page that
 * number was `${sideGames.length}`; moving the copy into a CMS would
 * have handed the stale number straight back to whoever edits it, so
 * the derivation moved with the copy.
 */
const TOKENS: Record<string, () => string> = {
  '{sideGameCount}': () => String(sideGames.length),
};

export function interpolate(answer: string): string {
  return Object.entries(TOKENS).reduce(
    (text, [token, value]) => text.split(token).join(value()),
    answer,
  );
}

type RawEntry = { question?: string; answer?: string; order?: number };

const modules = import.meta.glob<RawEntry>('/content/faq/*.json', {
  eager: true,
  import: 'default',
});

/**
 * Entries in display order. An entry missing its question or answer is
 * dropped rather than rendered half-empty — Keystatic can write a file
 * the moment someone clicks "new", before they type anything.
 */
export const faqEntries: FaqEntry[] = Object.entries(modules)
  .map(([path, raw]) => ({
    slug: path.replace(/^.*\/(.+)\.json$/, '$1'),
    question: raw?.question?.trim() ?? '',
    answer: interpolate(raw?.answer?.trim() ?? ''),
    order: typeof raw?.order === 'number' ? raw.order : Number.MAX_SAFE_INTEGER,
  }))
  .filter((e) => e.question !== '' && e.answer !== '')
  .sort((a, b) => a.order - b.order || a.question.localeCompare(b.question))
  .map(({ slug, question, answer }) => ({ slug, question, answer }));
