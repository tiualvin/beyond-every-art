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
  privatePost: {
    slug: 'e2e-members-conservation-notes',
    title: 'E2E Members Conservation Notes',
  },
  redirect: {
    source: '/e2e-legacy-white-pigments/',
    destination: '/titanium-white-vs-lead-white/',
  },
} as const
