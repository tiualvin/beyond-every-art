import config from '@payload-config'
import { getPayload, type Payload } from 'payload'
import sharp from 'sharp'

/**
 * Development seed. Populates Payload with a small, realistic set of authors,
 * tags, media, posts, a page, and the site globals so the frontend can be built
 * and previewed without a real Ghost export. Safe to re-run: every record is
 * upserted on its slug (or file name, or global slug), so running it twice does
 * not duplicate.
 *
 * Usage: pnpm seed:dev
 */

type IdLike = string | number
type SeedCollection = 'authors' | 'tags' | 'posts' | 'pages' | 'apps'

// Payload's create/update are strongly typed per collection (and per draft
// state) once payload-types.ts is generated. This generic upsert intentionally
// works across several collections, so the option objects are cast to the API's
// own parameter types — valid whether or not the generated types are present.
type CreateOptions = Parameters<Payload['create']>[0]
type UpdateOptions = Parameters<Payload['update']>[0]

async function upsertBySlug(
  payload: Payload,
  collection: SeedCollection,
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
    await payload.update({
      collection,
      id,
      data,
      overrideAccess: true,
    } as unknown as UpdateOptions)
    return id
  }

  const created = await payload.create({
    collection,
    data,
    overrideAccess: true,
  } as unknown as CreateOptions)
  return created.id as IdLike
}

type SeedImage = {
  filename: string
  alt: string
  caption?: string
  credit?: string
  width: number
  height: number
  from: string
  to: string
  accent: string
}

/**
 * Draws a placeholder "material study" as an SVG and encodes it as a JPEG.
 *
 * The seed has to produce real image bytes, because a featured image only
 * exercises the frontend if Payload actually stores an upload: the URL, the
 * intrinsic width and height, and the generated `card` size all come from the
 * upload pipeline. Generating them here keeps the repository free of binary
 * assets and of any question about who owns the artwork — these are obviously
 * synthetic, and no real photograph is licensed for a development seed.
 */
async function renderPlaceholderImage(image: SeedImage): Promise<Buffer> {
  const { width: w, height: h, from, to, accent } = image
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="ground" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${from}"/>
      <stop offset="1" stop-color="${to}"/>
    </linearGradient>
    <radialGradient id="glaze" cx="0.32" cy="0.24" r="0.78">
      <stop offset="0" stop-color="${accent}" stop-opacity="0.5"/>
      <stop offset="1" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#ground)"/>
  <rect width="${w}" height="${h}" fill="url(#glaze)"/>
  <circle cx="${w * 0.68}" cy="${h * 0.62}" r="${Math.min(w, h) * 0.3}" fill="${accent}" opacity="0.16"/>
  <rect x="${w * 0.08}" y="${h * 0.58}" width="${w * 0.46}" height="${h * 0.3}" fill="${accent}" opacity="0.1"/>
  <rect x="0" y="${h * 0.5}" width="${w}" height="${Math.max(2, h * 0.004)}" fill="${accent}" opacity="0.35"/>
</svg>`

  return sharp(Buffer.from(svg)).jpeg({ quality: 82 }).toBuffer()
}

/** Uploads a placeholder image once; a re-run reuses the stored file. */
async function upsertMedia(
  payload: Payload,
  image: SeedImage,
): Promise<IdLike> {
  const existing = await payload.find({
    collection: 'media',
    where: { filename: { equals: image.filename } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  if (existing.docs.length > 0) return existing.docs[0].id as IdLike

  const data = await renderPlaceholderImage(image)
  const created = await payload.create({
    collection: 'media',
    overrideAccess: true,
    data: {
      alt: image.alt,
      caption: image.caption,
      credit: image.credit,
    },
    file: {
      data,
      mimetype: 'image/jpeg',
      name: image.filename,
      size: data.byteLength,
    },
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

  // Every destination below is a route this seed actually produces. Menus that
  // point at pages nobody has written yet ship 404s in the site chrome, which
  // is exactly the state the seed is supposed to let you check.
  await payload.updateGlobal({
    slug: 'header',
    overrideAccess: true,
    data: {
      links: [
        { label: 'About', url: '/about' },
        { label: 'Materials', url: '/tag/materials' },
        { label: 'Journal', url: '/journal' },
        { label: 'Apps', url: '/apps' },
        { label: 'Search', url: '/search' },
      ],
      cta: { label: 'Newsletter', url: '/newsletter' },
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
        { label: 'Newsletter', url: '/newsletter' },
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

  // --- Media -----------------------------------------------------------
  // Deliberately varied aspect ratios: cards crop every thumbnail to the same
  // frame, while an article renders the image at its own ratio, and only a
  // portrait next to a panorama shows whether both are behaving.
  const imageWhites = await upsertMedia(payload, {
    filename: 'seed-lead-and-titanium-white.jpg',
    alt: 'Two ground white pigments side by side under raking light',
    caption:
      'Lead white, left, beside titanium white ground to the same fineness.',
    credit: 'Placeholder image generated by pnpm seed:dev',
    width: 1600,
    height: 1067,
    from: '#8a7f72',
    to: '#221c18',
    accent: '#f6f2eb',
  })
  const imagePigments = await upsertMedia(payload, {
    filename: 'seed-pigment-cabinet.jpg',
    alt: 'A tall cabinet of pigment jars arranged from ochre to deep blue',
    caption: 'A working pigment cabinet, ordered by hue rather than by date.',
    width: 1400,
    height: 1750,
    from: '#6d1f2c',
    to: '#141110',
    accent: '#e0a24a',
  })
  const imageLight = await upsertMedia(payload, {
    filename: 'seed-raking-light-study.jpg',
    // Deliberately unhelpful: `Media.alt` is required, so a Ghost image with no
    // alt attribute arrives carrying its own file name. This one reproduces
    // that migrated shape, and the frontend should render it as decorative
    // rather than reading a file name out loud.
    alt: 'seed-raking-light-study.jpg',
    width: 1920,
    height: 1080,
    from: '#2b2f3a',
    to: '#0d0c0b',
    accent: '#cbb994',
  })

  // --- Posts -----------------------------------------------------------
  const posts: Array<{
    slug: string
    title: string
    excerpt: string
    tag: IdLike
    featuredImage: IdLike | null
    featured: boolean
    publishedAt: string
  }> = [
    {
      slug: 'titanium-white-vs-lead-white',
      title: 'Why Titanium White Behaves Differently Than Lead White',
      excerpt:
        'Two whites, similar in appearance but worlds apart in composition, performance, and history.',
      tag: tagMaterials,
      featuredImage: imageWhites,
      featured: true,
      publishedAt: '2025-05-20T09:00:00.000Z',
    },
    {
      slug: 'chemistry-of-color-pigments-through-time',
      title: 'The Chemistry of Color: Pigments Through Time',
      excerpt:
        'How the pigments on an artist’s palette encode centuries of chemistry, trade, and discovery.',
      tag: tagMaterials,
      featuredImage: imagePigments,
      featured: true,
      publishedAt: '2025-04-11T09:00:00.000Z',
    },
    {
      slug: 'light-and-shadow-in-renaissance-masterpieces',
      title: 'Light and Shadow in Renaissance Masterpieces',
      excerpt:
        'Reading the deliberate choreography of light that gives Renaissance painting its depth.',
      tag: tagHistory,
      featuredImage: imageLight,
      featured: true,
      publishedAt: '2025-03-02T09:00:00.000Z',
    },
    {
      // Left without a featured image on purpose, so the card placeholder and
      // the image-less article layout stay visible in the seeded site.
      slug: 'building-texture-from-surface-to-soul',
      title: 'Building Texture: From Surface to Soul',
      excerpt:
        'Impasto, glazing, and the tactile decisions that turn a flat surface into a felt experience.',
      tag: tagPractice,
      featuredImage: null,
      featured: false,
      publishedAt: '2025-01-18T09:00:00.000Z',
    },
  ]

  const bodyFor = (excerpt: string): string =>
    [
      `<p>${excerpt}</p>`,
      '<p>For centuries, artists have chosen their materials as deliberately as their subjects. The choice shapes not only how a work looks the day it is made, but how it ages across generations.</p>',
      '<h2>Why the difference matters</h2>',
      '<p>Composition drives behavior. Two materials that appear identical on the palette can diverge sharply in opacity, handling, drying, and permanence — and those differences quietly define the finished work.</p>',
      '<blockquote>The material is never neutral. It carries its own history into every mark.</blockquote>',
      '<p>Understanding these properties helps artists, conservators, and collectors make more confident, lasting choices.</p>',
    ].join('')

  for (const post of posts) {
    await upsertBySlug(payload, 'posts', post.slug, {
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt,
      legacyHTML: bodyFor(post.excerpt),
      authors: [livia],
      tags: [post.tag],
      featuredImage: post.featuredImage,
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

  // --- Apps --------------------------------------------------------------
  // The four in the app strategy, all at `concept`, which is where they are.
  // Copy is written for a reader rather than for the roadmap: what it would be
  // like to use, not what it borrows from what.
  const apps = [
    {
      slug: 'beyond-every-art',
      name: 'Beyond Every Art',
      tagline: 'Art, colour, materials, exhibitions, and creative practice.',
      summary:
        'The magazine in your pocket, made for reading rather than scrolling. ' +
        'Save a piece for the train and it is there without a signal. Underline ' +
        'a paragraph, keep a note next to it, and find both again a year later.' +
        '\n\nIt opens on one thing instead of a feed: a piece worth your morning, ' +
        'a pigment to look at, a small exercise you could finish before the ' +
        'coffee goes cold. And when you want to wander, you can go by artist or ' +
        'by material rather than by date.',
      detail:
        'The one we are making first. If you only ever use one of these, it ' +
        'should probably be this one.',
      sequence: 'Making this one first',
      plate: 'reader',
      order: 1,
    },
    {
      slug: 'dapple',
      name: 'Dapple',
      tagline: 'A quiet place to colour.',
      summary:
        'Colouring for grown-ups, on drawings made by artists rather than ' +
        'generated by a machine. The paint behaves like paint: watercolour ' +
        'blooms out into damp paper, pencil catches on the grain, marker pools ' +
        'where you rest your hand.' +
        '\n\nNothing hurries you. There is no streak to keep and no timer ' +
        'running. Stay inside the lines if you like — the app will help you — ' +
        'or do not, and let the colour run over the edge. A new page each day ' +
        'is free, and anything you finish comes out big enough to frame.',
      detail:
        'Watercolour, pencil, pastel, marker, ink. Palettes you mix yourself, ' +
        'palettes chosen by the artist who drew the page, and paper that ' +
        'behaves like paper under the brush.',
      sequence: 'After the first one',
      plate: 'colouring',
      order: 2,
    },
    {
      slug: 'morrow',
      name: 'Morrow',
      tagline: 'Make a little space for yourself.',
      summary:
        'Part planner, part sketchbook, part diary — somewhere to lay out a ' +
        'week, write by hand, stick things in, and think. A notebook rather ' +
        'than a productivity system: nothing scores you, and nothing turns red ' +
        'when you skip a day.' +
        '\n\nIts one real idea is the mark. Instead of picking a face for how the ' +
        'day went, you leave a colour, a brushstroke, a shape, a small drawing, ' +
        'a photograph. Thirty of them make a month you can read at a glance, ' +
        'and a year of them makes something closer to a painting.',
      detail:
        'Yours, and nobody else’s. What you write and draw stays on your own ' +
        'device unless you ask it to sync, it travels encrypted when it does, ' +
        'and you can take all of it out, or delete it, at any point.',
      sequence: 'After Dapple',
      plate: 'year',
      order: 3,
    },
    {
      slug: 'echo-garden',
      name: 'Echo Garden',
      tagline: 'Paint a world that sings back.',
      summary:
        'A game, more or less. You arrive somewhere quiet and half-finished — ' +
        'an overgrown garden, an observatory adrift, a temple under water — and ' +
        'find the thing that has lost its colour and its voice. Then you draw, ' +
        'and it answers back. Dots ring like small bells, long strokes pull at ' +
        'strings, a spiral turns into a voice, a wash of colour opens out into ' +
        'something like weather.',
      detail:
        'You do not need to be able to draw. The game tunes whatever you make, ' +
        'so it comes out sounding right either way. It is also the furthest off ' +
        'of the four, and the one most likely to change shape before you see it.',
      sequence: 'Furthest off, and least certain',
      plate: 'echo',
      order: 4,
    },
  ]

  for (const app of apps) {
    await upsertBySlug(payload, 'apps', app.slug, {
      ...app,
      stage: 'concept',
      platforms: ['ios', 'android'],
      _status: 'published',
    })
  }

  payload.logger.info(
    `Seed complete: ${posts.length} posts, 3 images, 3 tags, 1 author, 1 page, ` +
      `${apps.length} apps, 3 globals.`,
  )
}

seed()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Seed failed:', error)
    process.exit(1)
  })
