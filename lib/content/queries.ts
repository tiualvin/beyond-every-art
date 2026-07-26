import type { Where } from 'payload'

import { toMediaImage, type MediaImage } from '@/lib/content/media'
import { ARCHIVE_PAGE_SIZE } from '@/lib/content/pagination'
import { toBodyHtml } from '@/lib/content/richtext'
import { getPayloadClient } from '@/lib/payload'

export type NavLink = { label: string; url: string }

export type SiteSettings = {
  title: string
  description: string
}

export type AuthorSummary = { name: string; slug?: string }

export type PostCard = {
  id: string
  slug: string
  title: string
  excerpt: string
  publishedAt: string | null
  featured: boolean
  authors: AuthorSummary[]
  tag: string | null
  image: MediaImage | null
}

const DEFAULT_SETTINGS: SiteSettings = {
  title: 'Beyond Every Art',
  description: 'Art, color, materials, exhibitions, and creative practice.',
}

const publishedPublic: Where = {
  and: [
    { _status: { equals: 'published' } },
    { visibility: { equals: 'public' } },
  ],
}

type RawAuthor = { name?: string; slug?: string }
type RawTag = { name?: string }
type RawPost = {
  id?: string | number
  slug?: string
  title?: string
  excerpt?: string
  publishedAt?: string
  featured?: boolean
  authors?: Array<RawAuthor | string | number>
  tags?: Array<RawTag | string | number>
  featuredImage?: unknown
}

function toAuthorSummaries(authors: RawPost['authors']): AuthorSummary[] {
  if (!authors) return []
  return authors
    .filter((a): a is RawAuthor => typeof a === 'object' && a !== null)
    .map((a) => ({ name: a.name ?? '', slug: a.slug }))
    .filter((a) => a.name)
}

function firstTagName(tags: RawPost['tags']): string | null {
  const tag = tags?.find(
    (t): t is RawTag => typeof t === 'object' && t !== null,
  )
  return tag?.name ?? null
}

function toPostCard(doc: RawPost): PostCard | null {
  if (!doc.slug) return null
  return {
    id: String(doc.id ?? doc.slug),
    slug: doc.slug,
    title: doc.title ?? doc.slug,
    excerpt: doc.excerpt ?? '',
    publishedAt: doc.publishedAt ?? null,
    featured: Boolean(doc.featured),
    authors: toAuthorSummaries(doc.authors),
    tag: firstTagName(doc.tags),
    image: toMediaImage(doc.featuredImage),
  }
}

/** Site-wide title/description, falling back to sensible defaults. */
export async function getSiteSettings(): Promise<SiteSettings> {
  try {
    const payload = await getPayloadClient()
    const settings = (await payload.findGlobal({
      slug: 'site-settings',
      overrideAccess: true,
      depth: 0,
    })) as Partial<SiteSettings>
    return {
      title: settings.title || DEFAULT_SETTINGS.title,
      description: settings.description || DEFAULT_SETTINGS.description,
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

function toNavLink(value: Partial<NavLink> | undefined | null): NavLink | null {
  const label = value?.label?.trim()
  const url = value?.url?.trim()
  return label && url ? { label, url } : null
}

async function getGlobalLinks(slug: 'header' | 'footer'): Promise<{
  links: NavLink[]
  cta: NavLink | null
  copyright?: string
}> {
  try {
    const payload = await getPayloadClient()
    const data = (await payload.findGlobal({
      slug,
      overrideAccess: true,
      depth: 0,
    })) as { links?: NavLink[]; cta?: Partial<NavLink>; copyright?: string }
    return {
      links: (data.links ?? [])
        .map(toNavLink)
        .filter((l): l is NavLink => l !== null),
      cta: toNavLink(data.cta),
      copyright: data.copyright,
    }
  } catch {
    return { links: [], cta: null }
  }
}

export function getHeader(): Promise<{
  links: NavLink[]
  cta: NavLink | null
}> {
  return getGlobalLinks('header')
}

export function getFooter(): Promise<{ links: NavLink[]; copyright?: string }> {
  return getGlobalLinks('footer')
}

export type PostPage = {
  posts: PostCard[]
  page: number
  totalPages: number
  totalPosts: number
}

const EMPTY_POST_PAGE: PostPage = {
  posts: [],
  page: 1,
  totalPages: 1,
  totalPosts: 0,
}

/** One page of published public posts, newest first, for the journal archive. */
export async function getPublishedPosts({
  page = 1,
  limit = ARCHIVE_PAGE_SIZE,
}: { page?: number; limit?: number } = {}): Promise<PostPage> {
  try {
    const payload = await getPayloadClient()
    const result = await payload.find({
      collection: 'posts',
      overrideAccess: true,
      depth: 1,
      page,
      limit,
      sort: '-publishedAt',
      where: publishedPublic,
    })
    return {
      posts: (result.docs as RawPost[])
        .map(toPostCard)
        .filter((p): p is PostCard => p !== null),
      page: result.page ?? page,
      totalPages: Math.max(1, result.totalPages ?? 1),
      totalPosts: result.totalDocs ?? 0,
    }
  } catch {
    return EMPTY_POST_PAGE
  }
}

/** Most recent published public posts, newest first. */
export async function getRecentPosts(limit = 6): Promise<PostCard[]> {
  try {
    const payload = await getPayloadClient()
    const result = await payload.find({
      collection: 'posts',
      overrideAccess: true,
      depth: 1,
      limit,
      sort: '-publishedAt',
      where: publishedPublic,
    })
    return (result.docs as RawPost[])
      .map(toPostCard)
      .filter((p): p is PostCard => p !== null)
  } catch {
    return []
  }
}

/** Published, public posts whose title or excerpt matches the query text. */
export async function searchPosts(
  query: string,
  limit = 20,
): Promise<PostCard[]> {
  const term = query.trim()
  if (!term) return []
  try {
    const payload = await getPayloadClient()
    const result = await payload.find({
      collection: 'posts',
      overrideAccess: true,
      depth: 1,
      limit,
      sort: '-publishedAt',
      where: {
        and: [
          publishedPublic,
          {
            or: [
              { title: { contains: term } },
              { excerpt: { contains: term } },
            ],
          },
        ],
      },
    })
    return (result.docs as RawPost[])
      .map(toPostCard)
      .filter((p): p is PostCard => p !== null)
  } catch {
    return []
  }
}

// --- Detail + archive types --------------------------------------------

export type TagRef = { name: string; slug: string }

export type PostDetail = {
  slug: string
  title: string
  excerpt: string
  bodyHtml: string
  publishedAt: string | null
  updatedAt: string | null
  authors: AuthorSummary[]
  tags: TagRef[]
  image: MediaImage | null
  metaTitle: string | null
  metaDescription: string | null
  canonicalURL: string | null
}

export type PageDetail = {
  slug: string
  title: string
  bodyHtml: string
  publishedAt: string | null
  updatedAt: string | null
  metaTitle: string | null
  metaDescription: string | null
  canonicalURL: string | null
}

export type Archive = {
  name: string
  slug: string
  description: string
  posts: PostCard[]
}

export type SlugRef = { slug: string; updatedAt: string | null }

type RawContentDoc = {
  slug?: string
  title?: string
  excerpt?: string
  content?: unknown
  legacyHTML?: string
  publishedAt?: string
  updatedAt?: string
  authors?: Array<RawAuthor | string | number>
  tags?: Array<(RawTag & { slug?: string }) | string | number>
  featuredImage?: unknown
  metaTitle?: string
  metaDescription?: string
  canonicalURL?: string
}

function toTagRefs(tags: RawContentDoc['tags']): TagRef[] {
  if (!tags) return []
  return tags
    .filter(
      (t): t is RawTag & { slug?: string } =>
        typeof t === 'object' && t !== null,
    )
    .map((t) => ({ name: t.name ?? '', slug: t.slug ?? '' }))
    .filter((t) => t.name && t.slug)
}

/**
 * A post by slug. By default only a published, public post is returned; pass
 * `draft: true` (gated behind the /api/preview route) to fetch the latest
 * draft or private version regardless of status or visibility.
 */
export async function getPostBySlug(
  slug: string,
  options: { draft?: boolean } = {},
): Promise<PostDetail | null> {
  try {
    const payload = await getPayloadClient()
    const result = await payload.find({
      collection: 'posts',
      overrideAccess: true,
      depth: 1,
      limit: 1,
      draft: options.draft,
      where: options.draft
        ? { slug: { equals: slug } }
        : { and: [{ slug: { equals: slug } }, publishedPublic] },
    })
    const doc = result.docs[0] as RawContentDoc | undefined
    if (!doc?.slug) return null
    return {
      slug: doc.slug,
      title: doc.title ?? doc.slug,
      excerpt: doc.excerpt ?? '',
      bodyHtml: toBodyHtml(doc),
      publishedAt: doc.publishedAt ?? null,
      updatedAt: doc.updatedAt ?? null,
      authors: toAuthorSummaries(doc.authors),
      tags: toTagRefs(doc.tags),
      image: toMediaImage(doc.featuredImage),
      metaTitle: doc.metaTitle ?? null,
      metaDescription: doc.metaDescription ?? null,
      canonicalURL: doc.canonicalURL ?? null,
    }
  } catch {
    return null
  }
}

/**
 * A page by slug. By default only a published page is returned; pass
 * `draft: true` (gated behind the /api/preview route) to fetch the latest
 * draft version regardless of status.
 */
export async function getPageBySlug(
  slug: string,
  options: { draft?: boolean } = {},
): Promise<PageDetail | null> {
  try {
    const payload = await getPayloadClient()
    const result = await payload.find({
      collection: 'pages',
      overrideAccess: true,
      // Depth 1 so images embedded in the rich-text body arrive as media
      // documents rather than bare IDs; the converter drops unpopulated ones.
      depth: 1,
      limit: 1,
      draft: options.draft,
      where: options.draft
        ? { slug: { equals: slug } }
        : {
            and: [
              { slug: { equals: slug } },
              { _status: { equals: 'published' } },
            ],
          },
    })
    const doc = result.docs[0] as RawContentDoc | undefined
    if (!doc?.slug) return null
    return {
      slug: doc.slug,
      title: doc.title ?? doc.slug,
      bodyHtml: toBodyHtml(doc),
      publishedAt: doc.publishedAt ?? null,
      updatedAt: doc.updatedAt ?? null,
      metaTitle: doc.metaTitle ?? null,
      metaDescription: doc.metaDescription ?? null,
      canonicalURL: doc.canonicalURL ?? null,
    }
  } catch {
    return null
  }
}

async function getArchive(
  collection: 'tags' | 'authors',
  slug: string,
  relationField: 'tags' | 'authors',
): Promise<Archive | null> {
  try {
    const payload = await getPayloadClient()
    const owner = await payload.find({
      collection,
      overrideAccess: true,
      depth: 0,
      limit: 1,
      where: { slug: { equals: slug } },
    })
    const doc = owner.docs[0] as
      | {
          id?: string | number
          name?: string
          description?: string
          bio?: string
        }
      | undefined
    if (!doc?.id) return null

    const posts = await payload.find({
      collection: 'posts',
      overrideAccess: true,
      depth: 1,
      limit: 100,
      sort: '-publishedAt',
      where: { and: [{ [relationField]: { in: [doc.id] } }, publishedPublic] },
    })

    return {
      name: doc.name ?? slug,
      slug,
      description: doc.description ?? doc.bio ?? '',
      posts: (posts.docs as RawPost[])
        .map(toPostCard)
        .filter((p): p is PostCard => p !== null),
    }
  } catch {
    return null
  }
}

/** Posts filed under a tag, plus the tag's own metadata. */
export function getPostsByTag(slug: string): Promise<Archive | null> {
  return getArchive('tags', slug, 'tags')
}

/** Posts written by an author, plus the author's own metadata. */
export function getPostsByAuthor(slug: string): Promise<Archive | null> {
  return getArchive('authors', slug, 'authors')
}

async function getSlugRefs(collection: 'tags' | 'authors'): Promise<SlugRef[]> {
  try {
    const payload = await getPayloadClient()
    const result = await payload.find({
      collection,
      overrideAccess: true,
      depth: 0,
      pagination: false,
      limit: 0,
      select: { slug: true, updatedAt: true },
    })
    return (result.docs as Array<{ slug?: string; updatedAt?: string }>)
      .filter((d): d is { slug: string; updatedAt?: string } => Boolean(d.slug))
      .map((d) => ({ slug: d.slug, updatedAt: d.updatedAt ?? null }))
  } catch {
    return []
  }
}

/** All tag slugs (for the sitemap). */
export function getTagSlugs(): Promise<SlugRef[]> {
  return getSlugRefs('tags')
}

/** All author slugs (for the sitemap). */
export function getAuthorSlugs(): Promise<SlugRef[]> {
  return getSlugRefs('authors')
}
