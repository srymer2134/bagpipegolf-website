import { config, collection, fields, singleton } from '@keystatic/core';

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
// THE `posts` COLLECTION BELOW IS A PLACEHOLDER. It exists so the
// config is valid and the GitHub App setup wizard can run; nothing on
// bagpipegolf.com reads it yet, which is why it writes to a top-level
// `content/` directory rather than `src/content/` (Astro's content
// collections namespace — putting it there would imply a wiring that
// doesn't exist). See docs/KEYSTATIC_SETUP.md.
//
// SINGLETONS are real: each is one block of page copy, stored as a JSON
// file under src/data/ that its page imports at build time (Chris,
// 2026-11-13). The first is the home page's top section.
//
// DRAFTS FIRST: `branchPrefix` makes branches created in the admin
// start with `keystatic/`, so an edit can go on its own branch, get a
// preview URL, and reach main through a PR. It does not stop a save on
// main; protecting main in GitHub does that.
export default config({
  storage: {
    kind: 'github',
    repo: 'srymer2134/bagpipegolf-website',
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
  collections: {
    posts: collection({
      label: 'Posts (placeholder)',
      slugField: 'title',
      path: 'content/posts/*',
      format: { contentField: 'content' },
      schema: {
        title: fields.slug({ name: { label: 'Title' } }),
        publishedAt: fields.date({
          label: 'Published',
          description: 'Nothing on the site reads this yet.',
        }),
        content: fields.markdoc({ label: 'Body' }),
      },
    }),
  },
});
