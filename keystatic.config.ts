// Keystatic — the content editor at /keystatic (pilot, Chris 2026-11-06).
//
// Each singleton below is one editable block of page text, stored as a
// JSON file under src/data/. The page imports that file at build
// time, so nothing is read from disk on the Worker.
//
// Pilot scope: the home page hero only. Storage is `local` (edits save
// to files in this working copy); switching to `github` mode — edits
// saved as commits — needs a GitHub App on the repo, which Sam approves.
import { config, fields, singleton } from '@keystatic/core';

export default config({
  storage: { kind: 'local' },
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
