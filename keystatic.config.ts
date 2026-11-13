import { config, collection, fields } from '@keystatic/core';

// Keystatic — the browser CMS at /keystatic.
//
// GITHUB MODE, on purpose. Keystatic's other mode ('local') writes
// straight to the filesystem and only runs on a laptop with the repo
// checked out, which is exactly the thing we're trying to avoid: the
// point is that someone who is not holding a terminal can change the
// site. In github mode every save is a commit (or a PR) against
// srymer2134/bagpipegolf-website made as the signed-in person, so the
// site's history still reads like the site's history and merging to
// main deploys it the same way a code change does.
//
// Who can use it: GitHub decides, not us. Keystatic asks GitHub
// whether the signed-in user has write access to this repo, so the
// access list is the repo's collaborator list. The repo is public, so
// treat anything typed here as public from the moment it is saved.
//
// What is editable: the FAQ at bagpipegolf.com/faq. One JSON file per
// question under content/faq/, read at build time by src/lib/faq.ts —
// so a save here is a commit, the commit rebuilds the site, and the
// answer is live. Nothing reads this repo at request time.
//
// Answers may contain {sideGameCount}, which renders as the number of
// side games in the library. Type the number by hand and CI fails: the
// FAQ once said "30+" while the app had 34, and gameCount.test.ts
// exists to stop that happening twice. The same test scans content/,
// so the guard still holds now that an editor owns the sentence.
export default config({
  storage: {
    kind: 'github',
    repo: 'srymer2134/bagpipegolf-website',
  },
  ui: {
    brand: { name: 'Bagpipe Golf' },
  },
  collections: {
    faq: collection({
      label: 'FAQ',
      slugField: 'question',
      path: 'content/faq/*',
      format: { data: 'json' },
      entryLayout: 'form',
      columns: ['question'],
      schema: {
        question: fields.slug({
          name: { label: 'Question' },
          slug: {
            label: 'File name',
            description:
              'Changing this renames the file. Harmless — nothing links to it.',
          },
        }),
        answer: fields.text({
          label: 'Answer',
          multiline: true,
          description:
            'Plain text. Write {sideGameCount} rather than typing the number of side games.',
          validation: { length: { min: 1 } },
        }),
        order: fields.integer({
          label: 'Order',
          description: 'Lowest first. Ties fall back to alphabetical.',
          defaultValue: 99,
          validation: { min: 1 },
        }),
      },
    }),
  },
});
