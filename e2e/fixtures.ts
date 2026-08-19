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
  // MCP keys for the endpoint smoke suite. Both are literals rather than
  // generated values because the spec has to present them, and the seed runs in
  // a different process — they are only ever valid against a disposable test
  // database that `assertSafeDatabase` refuses to leave localhost for.
  //
  // Two roles, because the interesting behaviour is the difference between
  // them: the editor key may draft and may not publish, and the whole publish
  // guard is that one distinction.
  mcp: {
    editorKey: 'e2e-mcp-editor-key-2f9c4a17d05b48e1',
    editorEmail: 'e2e-mcp-editor@example.test',
    adminKey: 'e2e-mcp-admin-key-7b1ec3d94a6f2085',
    adminEmail: 'e2e-mcp-admin@example.test',
    password: 'e2e-mcp-Password-1!',
    /** Collections that must have no tool at all, whatever a key allows. */
    forbiddenCollections: [
      'members',
      'billingEvents',
      'newsletterSignups',
      'users',
    ],
  },
  redirect: {
    source: '/e2e-legacy-white-pigments/',
    destination: '/titanium-white-vs-lead-white/',
  },
} as const
