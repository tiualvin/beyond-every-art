import { getPayload, type Payload } from 'payload'

import config from '../payload.config'

/**
 * Development seed. Populates Payload with a small, realistic set of authors,
 * tags, posts, a page, and the site globals so the frontend can be built and
 * previewed without a real Ghost export. Safe to re-run: every record is
 * upserted on its slug (or global slug), so running it twice does not duplicate.
 *
 * Usage: pnpm seed:dev
 */

type IdLike = string | number

async function upsertBySlug(
  payload: Payload,
  collection: 'authors' | 'tags' | 'posts' | 'pages',
  slug: string,
  data: Record<string, unknown>,
): Promise<IdLike> {
  const existing = await payload.find({
    collection,
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })

  if (existing.docs.length > 0) {
    const id = existing.docs[0].id as IdLike
    await payload.update({ collection, id, data, overrideAccess: true })
    return id
  }

  const created = await payload.create({
    collection,
    data,
    overrideAccess: true,
  })
  return created.id as IdLike
}

async function seed(): Promise<void> {
  const payload = await getPayload({ config })

  // --- Globals ---------------------------------------------------------
  await payload.updateGlobal({
    slug: 'site-settings',
    overrideAccess: true,
    data: {
      title: 'Beyond Every Art',
      description:
        'Exploring the science of art materials, the stories behind masterpieces, and the creative practice that connects ingredient, intention, and emotion.',
    },
  })

  await payload.updateGlobal({
    slug: 'header',
    overrideAccess: true,
    data: {
      links: [
        { label: 'About', url: '/about' },
        { label: 'Art & Stories', url: '/tag/materials' },
        { label: 'Journal', url: '/journal' },
        { label: 'Collections', url: '/collections' },
        { label: 'Contact', url: '/contact' },
      ],
    },
  })

  await payload.updateGlobal({
    slug: 'footer',
    overrideAccess: true,
    data: {
      copyright: `© ${new Date().getFullYear()} Beyond Every Art. All rights reserved.`,
      links: [
        { label: 'About', url: '/about' },
        { label: 'Journal', url: '/journal' },
        { label: 'Contact', url: '/contact' },
        { label: 'RSS', url: '/rss' },
      ],
    },
  })

  // --- Authors ---------------------------------------------------------
  const livia = await upsertBySlug(payload, 'authors', 'livia-calderon', {
    name: 'Livia M. Calderon',
    slug: 'livia-calderon',
    bio: 'Materials researcher and writer covering the science and history of artists’ pigments.',
    ghostID: 'seed-author-livia',
  })

  // --- Tags ------------------------------------------------------------
  const tagMaterials = await upsertBySlug(payload, 'tags', 'materials', {
    name: 'Materials',
    slug: 'materials',
    description: 'The science and history behind the materials artists use.',
    ghostID: 'seed-tag-materials',
  })
  const tagHistory = await upsertBySlug(payload, 'tags', 'art-history', {
    name: 'Art History',
    slug: 'art-history',
    description: 'Stories and context that bring artworks and eras to life.',
    ghostID: 'seed-tag-history',
  })
  const tagPractice = await upsertBySlug(payload, 'tags', 'creative-practice', {
    name: 'Creative Practice',
    slug: 'creative-practice',
    description:
      'Insights, techniques, and inspiration for today’s creative minds.',
    ghostID: 'seed-tag-practice',
  })

  // --- Posts -----------------------------------------------------------
  const posts: Array<{
    slug: string
    title: string
    excerpt: string
    tag: IdLike
    featured: boolean
    publishedAt: string
  }> = [
    {
      slug: 'titanium-white-vs-lead-white',
      title: 'Why Titanium White Behaves Differently Than Lead White',
      excerpt:
        'Two whites, similar in appearance but worlds apart in composition, performance, and history.',
      tag: tagMaterials,
      featured: true,
      publishedAt: '2025-05-20T09:00:00.000Z',
    },
    {
      slug: 'chemistry-of-color-pigments-through-time',
      title: 'The Chemistry of Color: Pigments Through Time',
      excerpt:
        'How the pigments on an artist’s palette encode centuries of chemistry, trade, and discovery.',
      tag: tagMaterials,
      featured: true,
      publishedAt: '2025-04-11T09:00:00.000Z',
    },
    {
      slug: 'light-and-shadow-in-renaissance-masterpieces',
      title: 'Light and Shadow in Renaissance Masterpieces',
      excerpt:
        'Reading the deliberate choreography of light that gives Renaissance painting its depth.',
      tag: tagHistory,
      featured: true,
      publishedAt: '2025-03-02T09:00:00.000Z',
    },
    {
      slug: 'building-texture-from-surface-to-soul',
      title: 'Building Texture: From Surface to Soul',
      excerpt:
        'Impasto, glazing, and the tactile decisions that turn a flat surface into a felt experience.',
      tag: tagPractice,
      featured: false,
      publishedAt: '2025-01-18T09:00:00.000Z',
    },
  ]

  for (const post of posts) {
    await upsertBySlug(payload, 'posts', post.slug, {
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt,
      legacyHTML: `<p>${post.excerpt}</p>`,
      authors: [livia],
      tags: [post.tag],
      featured: post.featured,
      visibility: 'public',
      publishedAt: post.publishedAt,
      _status: 'published',
      ghostID: `seed-post-${post.slug}`,
    })
  }

  // --- Page ------------------------------------------------------------
  await upsertBySlug(payload, 'pages', 'about', {
    title: 'About',
    slug: 'about',
    legacyHTML:
      '<p>Beyond Every Art bridges art and understanding — through material science, timeless stories, and meaningful connections.</p>',
    publishedAt: '2024-01-01T09:00:00.000Z',
    _status: 'published',
    ghostID: 'seed-page-about',
  })

  payload.logger.info(
    `Seed complete: ${posts.length} posts, 3 tags, 1 author, 1 page, 3 globals.`,
  )
}

seed()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Seed failed:', error)
    process.exit(1)
  })
