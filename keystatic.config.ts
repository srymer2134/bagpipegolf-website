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
// THE `posts` COLLECTION BELOW IS A PLACEHOLDER. It exists so the
// config is valid and the GitHub App setup wizard can run; nothing on
// bagpipegolf.com reads it yet, which is why it writes to a top-level
// `content/` directory rather than `src/content/` (Astro's content
// collections namespace — putting it there would imply a wiring that
// doesn't exist). The real schema follows once we've settled what
// actually needs editing without a deploy. See docs/KEYSTATIC_SETUP.md.
export default config({
  storage: {
    kind: 'github',
    repo: 'srymer2134/bagpipegolf-website',
  },
  ui: {
    brand: { name: 'Bagpipe Golf' },
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
