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
  redirect: {
    source: '/e2e-legacy-white-pigments/',
    destination: '/titanium-white-vs-lead-white/',
  },
} as const
