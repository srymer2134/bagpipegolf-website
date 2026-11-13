// Keystatic — the content editor at /keystatic (pilot, Chris 2026-11-06).
//
// Each singleton below is one editable block of page text, stored as a
// JSON file under src/data/. The page imports that file at build
// time, so nothing is read from disk on the Worker.
//
// Pilot scope: the home page hero only. Storage is `github`: edits are
// saved as commits on `keystatic/…` draft branches (never straight to
// main), each with its own preview URL. The first visit to /keystatic
// walks through creating the GitHub App; its four secrets go in
// .env.local, never in git.
import { config, fields, singleton } from '@keystatic/core';

export default config({
  storage: {
    kind: 'github',
    repo: { owner: 'srymer2134', name: 'bagpipegolf-website' },
    branchPrefix: 'keystatic/',
  },
  ui: {
    brand: { name: 'Bagpipe Golf' },
  },
  singletons: {
    homeHero: singleton({
      label: 'Home page — top section',
      path: 'src/data/home/hero',
      format: { data: 'json' },
      schema: {
        headlineLine1: fields.text({
          label: 'Headline, line 1',
          validation: { isRequired: true },
        }),
        headlineLine2: fields.text({
          label: 'Headline, line 2',
          validation: { isRequired: true },
        }),
        intro: fields.text({
          label: 'Intro paragraph',
          description:
            'Write {games} where the number of side games should appear — it stays current automatically.',
          multiline: true,
          validation: { isRequired: true },
        }),
        logo: fields.image({
          label: 'Logo image',
          directory: 'public/images/home',
          publicPath: '/images/home/',
          validation: { isRequired: true },
        }),
        logoAlt: fields.text({
          label: 'Logo description (for screen readers)',
          validation: { isRequired: true },
        }),
      },
    }),
  },
});
