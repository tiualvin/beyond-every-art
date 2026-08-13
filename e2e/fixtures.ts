export const fixtures = {
  publicPost: {
    slug: 'titanium-white-vs-lead-white',
    title: 'Why Titanium White Behaves Differently Than Lead White',
  },
  page: { slug: 'about', title: 'About' },
  tag: { slug: 'materials', title: 'Materials' },
  author: { slug: 'livia-calderon', title: 'Livia M. Calderon' },
  draftPost: {
    slug: 'e2e-unpublished-studio-notes',
    title: 'E2E Unpublished Studio Notes',
  },
  // A members-only post is published: it is listed, searchable, and its URL
  // resolves to a teaser. Only the body past the teaser is withheld.
  privatePost: {
    slug: 'e2e-members-conservation-notes',
    title: 'E2E Members Conservation Notes',
    teaserMarker: 'E2E teaser paragraph any reader may see',
    gatedMarker: 'E2E gated paragraph no anonymous reader may see',
  },
  // Imported Ghost bodies open with their own title heading; the template
  // prints the title too, which showed it twice on every migrated post.
  duplicateTitlePost: {
    slug: 'e2e-duplicate-title-heading',
    title: 'E2E Duplicate Title Heading',
  },
  // Seeded published by `pnpm seed:dev`; the roadmap page reads from it.
  publishedApp: { slug: 'dapple', title: 'Dapple' },
  // An unpublished app must stay invisible to the page, the route, and the
  // sitemap — the same rule drafts follow everywhere else.
  draftApp: {
    slug: 'e2e-unpublished-app',
    title: 'E2E Unpublished App',
  },
  redirect: {
    source: '/e2e-legacy-white-pigments/',
    destination: '/titanium-white-vs-lead-white/',
  },
} as const
