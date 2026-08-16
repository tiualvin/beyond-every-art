import type { Where } from 'payload'

import { cachedRead, CONTENT_TAGS } from '@/lib/cache/content'
import { toMediaImage, type MediaImage } from '@/lib/content/media'
import { ARCHIVE_PAGE_SIZE } from '@/lib/content/pagination'
import { toArticleBody, type ArticleBody } from '@/lib/content/body'
import { readingTimeMinutes } from '@/lib/format'
import { getPayloadClient } from '@/lib/payload'
import type { PreviewUser } from '@/lib/preview/session'

export type NavLink = { label: string; url: string }

export type SiteSettings = {
  title: string
  description: string
}

export type AuthorSummary = {
  name: string
  slug?: string
  /** Only populated where a page shows the author, not merely credits them. */
  bio?: string
  image?: MediaImage | null
}

/** What `Posts.visibility` holds, mirroring the levels Ghost had. */
export type PostVisibility = 'public' | 'members' | 'paid'

export type TagRef = { name: string; slug: string }

export type PostCard = {
  id: string
  slug: string
  title: string
  excerpt: string
  publishedAt: string | null
  featured: boolean
  authors: AuthorSummary[]
  /** All of them, in editor order: listings show the first, filters use all. */
  tags: TagRef[]
  image: MediaImage | null
  readingTime: number
  visibility: PostVisibility
}

const DEFAULT_SETTINGS: SiteSettings = {
  title: 'Beyond Every Art',
  description: 'Art, color, materials, exhibitions, and creative practice.',
}

/**
 * Every published post, whatever its visibility.
 *
 * Members-only and subscriber-only posts are listed, searched, syndicated and
 * routed exactly like public ones; what changes is how much of the body a
 * reader is given. Filtering them out here instead is what made them vanish
 * from the site after the Ghost import, taking their URLs and rankings with
 * them. Withholding happens in one place, `toPostDetail`.
 */
const published: Where = { _status: { equals: 'published' } }

function toVisibility(value: unknown): PostVisibility {
  return value === 'members' || value === 'paid' ? value : 'public'
}

type RawAuthor = {
  name?: string
  slug?: string
  bio?: string
  profileImage?: unknown
}
type RawTag = { name?: string; slug?: string }
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
  legacyHTML?: string
  content?: unknown
  visibility?: string
}

function toAuthorSummaries(authors: RawPost['authors']): AuthorSummary[] {
  if (!authors) return []
  return authors
    .filter((a): a is RawAuthor => typeof a === 'object' && a !== null)
    .map((a) => ({
      name: a.name ?? '',
      slug: a.slug,
      bio: a.bio,
      image: toMediaImage(a.profileImage),
    }))
    .filter((a) => a.name)
}

function toTagRefs(tags: RawPost['tags']): TagRef[] {
  if (!tags) return []
  return tags
    .filter((t): t is RawTag => typeof t === 'object' && t !== null)
    .map((t) => ({ name: t.name ?? '', slug: t.slug ?? '' }))
    .filter((t) => t.name && t.slug)
}

function estimateWordCount(doc: RawPost): number {
  const html = doc.legacyHTML ?? ''
  if (html) {
    const text = html.replace(/<[^>]*>/g, ' ')
    return text.split(/\s+/).filter(Boolean).length
  }
  const excerpt = doc.excerpt ?? ''
  return excerpt.split(/\s+/).filter(Boolean).length * 8
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
    tags: toTagRefs(doc.tags),
    image: toMediaImage(doc.featuredImage),
    readingTime: readingTimeMinutes(estimateWordCount(doc)),
    visibility: toVisibility(doc.visibility),
  }
}

/** Site-wide title/description, falling back to sensible defaults. */
async function readSiteSettings(): Promise<SiteSettings> {
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

export const getSiteSettings = cachedRead('site-settings', readSiteSettings, [
  CONTENT_TAGS.globals,
])

function toNavLink(value: Partial<NavLink> | undefined | null): NavLink | null {
  const label = value?.label?.trim()
  const url = value?.url?.trim()
  return label && url ? { label, url } : null
}

async function readGlobalLinks(slug: 'header' | 'footer'): Promise<{
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

const getGlobalLinks = cachedRead('global-links', readGlobalLinks, [
  CONTENT_TAGS.globals,
])

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

/** One page of published posts, newest first, for the journal archive. */
async function readPublishedPosts({
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
      where: published,
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

export const getPublishedPosts = cachedRead(
  'published-posts',
  readPublishedPosts,
  [CONTENT_TAGS.posts, CONTENT_TAGS.tags, CONTENT_TAGS.media],
)

/** Most recent published posts, newest first. */
async function readRecentPosts(limit = 6): Promise<PostCard[]> {
  try {
    const payload = await getPayloadClient()
    const result = await payload.find({
      collection: 'posts',
      overrideAccess: true,
      depth: 1,
      limit,
      sort: '-publishedAt',
      where: published,
    })
    return (result.docs as RawPost[])
      .map(toPostCard)
      .filter((p): p is PostCard => p !== null)
  } catch {
    return []
  }
}

export const getRecentPosts = cachedRead('recent-posts', readRecentPosts, [
  CONTENT_TAGS.posts,
  CONTENT_TAGS.tags,
  CONTENT_TAGS.media,
])

/**
 * The longest search term that will ever reach the database.
 *
 * `contains` compiles to `ILIKE '%term%'`, which no index can serve — every
 * search is a scan of the posts table. A term long enough to be meaningful is
 * well under this; the cap exists so the scan cannot be made arbitrarily
 * expensive by padding the query string.
 */
export const MAX_SEARCH_TERM_LENGTH = 64

/**
 * Reduces a raw query string to the text actually searched for.
 *
 * Whitespace is collapsed and the result truncated, which bounds the work per
 * search and — because the normalised term is the cache key below — collapses
 * the many spellings of one search ("ultramarine", " ultramarine  ") onto a
 * single cached entry.
 */
export function normaliseSearchTerm(query: string): string {
  return query.trim().replace(/\s+/g, ' ').slice(0, MAX_SEARCH_TERM_LENGTH)
}

async function readSearchPosts(
  term: string,
  limit: number,
): Promise<PostCard[]> {
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
          published,
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

/**
 * Cached because search was the one read on the site that was not.
 *
 * The suggestion drawer issues a request per keystroke, so the same few terms
 * arrive over and over while someone types, and each one was reaching Postgres
 * for a full scan. Caching them removes that entirely for the traffic that
 * actually repeats.
 *
 * The cache is keyed on attacker-controlled text, which would be a way to fill
 * it with junk if anything else did not bound it — the rate limiters on
 * `/search` and `/search/suggest` are what make the number of distinct keys
 * finite, so the two changes only work as a pair.
 */
const cachedSearchPosts = cachedRead('search-posts', readSearchPosts, [
  CONTENT_TAGS.posts,
  CONTENT_TAGS.tags,
  CONTENT_TAGS.media,
])

/** Published posts whose title or excerpt matches the query text. */
export async function searchPosts(
  query: string,
  limit = 20,
): Promise<PostCard[]> {
  const term = normaliseSearchTerm(query)
  if (!term) return []
  return cachedSearchPosts(term, limit)
}

// --- Detail + archive types --------------------------------------------

export type PostDetail = {
  slug: string
  title: string
  excerpt: string
  body: ArticleBody
  publishedAt: string | null
  updatedAt: string | null
  authors: AuthorSummary[]
  tags: TagRef[]
  image: MediaImage | null
  metaTitle: string | null
  metaDescription: string | null
  canonicalURL: string | null
  visibility: PostVisibility
  /**
   * Whether `body` is a teaser rather than the piece. True for a members-only
   * or subscriber-only post read by anyone but a previewing editor; the
   * withheld part of the body is never put in the response.
   */
  restricted: boolean
}

export type PageDetail = {
  slug: string
  title: string
  body: ArticleBody
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
  visibility?: string
}

/**
 * Turns a post document into what the article page renders.
 *
 * A members-only or subscriber-only post keeps its title, dek, cover, byline
 * and tags — everything Ghost showed a signed-out reader — but its body is
 * replaced by the opening paragraphs. The full text is dropped here rather
 * than hidden in the markup, so it is not in the page source, the streamed
 * RSC payload, or a "view source". An editor previewing a draft reads it all:
 * that path is authenticated.
 */
function toPostDetail(doc: RawContentDoc, preview: boolean): PostDetail {
  const visibility = toVisibility(doc.visibility)
  const restricted = visibility !== 'public' && !preview

  return {
    slug: doc.slug ?? '',
    title: doc.title ?? doc.slug ?? '',
    excerpt: doc.excerpt ?? '',
    body: toArticleBody(doc, { restricted, preview }),
    publishedAt: doc.publishedAt ?? null,
    updatedAt: doc.updatedAt ?? null,
    authors: toAuthorSummaries(doc.authors),
    tags: toTagRefs(doc.tags),
    image: toMediaImage(doc.featuredImage),
    metaTitle: doc.metaTitle ?? null,
    metaDescription: doc.metaDescription ?? null,
    canonicalURL: doc.canonicalURL ?? null,
    visibility,
    restricted,
  }
}

async function readPostBySlug(
  slug: string,
  options: { draft?: boolean; user?: PreviewUser | null } = {},
): Promise<PostDetail | null> {
  try {
    const payload = await getPayloadClient()
    const result = await payload.find({
      collection: 'posts',
      // Draft reads must retain the authenticated editor's collection access.
      // In particular, an author may preview only posts they own.
      overrideAccess: !options.draft,
      user: options.draft ? (options.user ?? undefined) : undefined,
      // Depth 2 so the author card gets its portrait: depth 1 populates the
      // author document, and the upload it points at is one level further.
      depth: 2,
      limit: 1,
      draft: options.draft,
      where: options.draft
        ? { slug: { equals: slug } }
        : { and: [{ slug: { equals: slug } }, published] },
    })
    const doc = result.docs[0] as RawContentDoc | undefined
    if (!doc?.slug) return null
    return toPostDetail(doc, Boolean(options.draft))
  } catch {
    return null
  }
}

const getPublishedPostBySlug = cachedRead(
  'post-by-slug',
  (slug: string) => readPostBySlug(slug),
  [
    CONTENT_TAGS.posts,
    CONTENT_TAGS.tags,
    CONTENT_TAGS.authors,
    CONTENT_TAGS.media,
  ],
)

/**
 * A post by slug. By default only a published post is returned, with a
 * restricted one reduced to a teaser; pass `draft: true` (gated behind the
 * /api/preview route) to fetch the latest draft in full regardless of status.
 *
 * Only the public read is cached. A draft read is scoped to the editor making
 * it — an author may preview only their own posts — so caching it would let
 * one editor's session decide what another one sees.
 */
export function getPostBySlug(
  slug: string,
  options: { draft?: boolean; user?: PreviewUser | null } = {},
): Promise<PostDetail | null> {
  return options.draft
    ? readPostBySlug(slug, options)
    : getPublishedPostBySlug(slug)
}

/**
 * What to read after a piece: other posts under the same tags, newest first,
 * topped up with recent posts when a tag is too thin to fill the row.
 *
 * Both halves exclude the piece being read, and the top-up excludes whatever
 * the tag match already found, so the three are always distinct.
 */
async function readRelatedPosts(
  slug: string,
  tagSlugs: string[],
  limit = 3,
): Promise<PostCard[]> {
  try {
    const payload = await getPayloadClient()
    const notThisPost: Where = { slug: { not_equals: slug } }

    const byTag =
      tagSlugs.length > 0
        ? await payload.find({
            collection: 'posts',
            overrideAccess: true,
            depth: 1,
            limit,
            sort: '-publishedAt',
            where: {
              and: [published, notThisPost, { 'tags.slug': { in: tagSlugs } }],
            },
          })
        : { docs: [] }

    const related = (byTag.docs as RawPost[])
      .map(toPostCard)
      .filter((p): p is PostCard => p !== null)

    if (related.length >= limit) return related

    const topUp = await payload.find({
      collection: 'posts',
      overrideAccess: true,
      depth: 1,
      limit: limit - related.length,
      sort: '-publishedAt',
      where: {
        and: [
          published,
          notThisPost,
          { slug: { not_in: related.map((p) => p.slug) } },
        ],
      },
    })

    return related.concat(
      (topUp.docs as RawPost[])
        .map(toPostCard)
        .filter((p): p is PostCard => p !== null),
    )
  } catch {
    return []
  }
}

export const getRelatedPosts = cachedRead('related-posts', readRelatedPosts, [
  CONTENT_TAGS.posts,
  CONTENT_TAGS.tags,
  CONTENT_TAGS.media,
])

async function readPageBySlug(
  slug: string,
  options: { draft?: boolean; user?: PreviewUser | null } = {},
): Promise<PageDetail | null> {
  try {
    const payload = await getPayloadClient()
    const result = await payload.find({
      collection: 'pages',
      // Authors cannot manage pages; Payload's access policy therefore keeps
      // their preview sessions from using a page URL to read page drafts.
      overrideAccess: !options.draft,
      user: options.draft ? (options.user ?? undefined) : undefined,
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
      // Pages are never gated, so the members-only marker does nothing here —
      // but an editor who dropped one on a page should still see it sitting
      // there doing nothing, rather than have it silently vanish in preview.
      body: toArticleBody(doc, { preview: Boolean(options.draft) }),
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

const getPublishedPageBySlug = cachedRead(
  'page-by-slug',
  (slug: string) => readPageBySlug(slug),
  [CONTENT_TAGS.pages, CONTENT_TAGS.media],
)

/**
 * A page by slug. By default only a published page is returned; pass
 * `draft: true` (gated behind the /api/preview route) to fetch the latest
 * draft version regardless of status. As with posts, only the public read is
 * cached, because a draft read carries the editor's own access.
 */
export function getPageBySlug(
  slug: string,
  options: { draft?: boolean; user?: PreviewUser | null } = {},
): Promise<PageDetail | null> {
  return options.draft
    ? readPageBySlug(slug, options)
    : getPublishedPageBySlug(slug)
}

async function readArchive(
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
      where: { and: [{ [relationField]: { in: [doc.id] } }, published] },
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

const getArchive = cachedRead('archive', readArchive, [
  CONTENT_TAGS.posts,
  CONTENT_TAGS.tags,
  CONTENT_TAGS.authors,
  CONTENT_TAGS.media,
])

/** Posts filed under a tag, plus the tag's own metadata. */
export function getPostsByTag(slug: string): Promise<Archive | null> {
  return getArchive('tags', slug, 'tags')
}

/** Posts written by an author, plus the author's own metadata. */
export function getPostsByAuthor(slug: string): Promise<Archive | null> {
  return getArchive('authors', slug, 'authors')
}

async function readSlugRefs(
  collection: 'tags' | 'authors',
): Promise<SlugRef[]> {
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

const getSlugRefs = cachedRead('slug-refs', readSlugRefs, [
  CONTENT_TAGS.tags,
  CONTENT_TAGS.authors,
])

/** All tag slugs (for the sitemap). */
export function getTagSlugs(): Promise<SlugRef[]> {
  return getSlugRefs('tags')
}

/** All author slugs (for the sitemap). */
export function getAuthorSlugs(): Promise<SlugRef[]> {
  return getSlugRefs('authors')
}

// --- Homepage topic cards -------------------------------------------------

export type TopicCard = {
  name: string
  slug: string
  postCount: number
  image: MediaImage | null
}

async function readTagsWithCounts(limit = 6): Promise<TopicCard[]> {
  try {
    const payload = await getPayloadClient()
    const tags = await payload.find({
      collection: 'tags',
      overrideAccess: true,
      depth: 1,
      pagination: false,
      limit: 0,
    })

    const results: TopicCard[] = []
    for (const tag of tags.docs as Array<{
      id?: string | number
      name?: string
      slug?: string
      featuredImage?: unknown
    }>) {
      if (!tag.slug || !tag.name) continue
      const count = await payload.count({
        collection: 'posts',
        overrideAccess: true,
        where: {
          and: [{ tags: { in: [tag.id] } }, published],
        },
      })
      results.push({
        name: tag.name,
        slug: tag.slug,
        postCount: count.totalDocs,
        image: toMediaImage(tag.featuredImage),
      })
    }

    return results
      .filter((t) => t.postCount > 0)
      .sort((a, b) => b.postCount - a.postCount)
      .slice(0, limit)
  } catch {
    return []
  }
}

export const getTagsWithCounts = cachedRead(
  'tags-with-counts',
  readTagsWithCounts,
  [CONTENT_TAGS.posts, CONTENT_TAGS.tags, CONTENT_TAGS.media],
)

// --- Apps -----------------------------------------------------------------

/** Mirrors `Apps.status`. Anything below `available` has nothing to link to. */
export type AppStatus =
  'concept' | 'in_development' | 'coming_soon' | 'available'

/** Mirrors `Apps.platforms`. */
export type AppPlatform = 'ios' | 'android' | 'web'

/** Which stand-in drawing the page renders while `heroImage` is empty. */
export type AppPlate = 'reader' | 'colouring' | 'year' | 'echo'

export type AppCard = {
  id: string
  slug: string
  name: string
  tagline: string
  summary: string
  detail: string
  status: AppStatus
  sequence: string
  platforms: AppPlatform[]
  image: MediaImage | null
  plate: AppPlate
}

export type AppDetail = AppCard & {
  body: ArticleBody
  updatedAt: string | null
  screenshots: Array<{ image: MediaImage; caption: string }>
  appStoreURL: string | null
  playStoreURL: string | null
  metaTitle: string | null
  metaDescription: string | null
}

type RawApp = {
  id?: string | number
  slug?: string
  name?: string
  tagline?: string
  summary?: string
  detail?: string
  /** The collection calls this `stage`; see the note in collections/Apps.ts. */
  stage?: string
  sequence?: string
  platforms?: unknown
  heroImage?: unknown
  plate?: string
  screenshots?: Array<{ image?: unknown; caption?: string }>
  appStoreURL?: string
  playStoreURL?: string
  content?: unknown
  description?: unknown
  legacyHTML?: string
  updatedAt?: string
  metaTitle?: string
  metaDescription?: string
}

const APP_STATUSES = new Set<AppStatus>([
  'concept',
  'in_development',
  'coming_soon',
  'available',
])
const APP_PLATFORMS = new Set<AppPlatform>(['ios', 'android', 'web'])
const APP_PLATES = new Set<AppPlate>(['reader', 'colouring', 'year', 'echo'])

/**
 * An unrecognised status falls back to `concept` rather than being dropped.
 *
 * The page is a roadmap: an app whose status went missing is still an app the
 * studio intends to build, and "concept" is the claim that promises least.
 */
function toAppStatus(value: unknown): AppStatus {
  return APP_STATUSES.has(value as AppStatus) ? (value as AppStatus) : 'concept'
}

function toPlatforms(value: unknown): AppPlatform[] {
  if (!Array.isArray(value)) return []
  return value.filter((v): v is AppPlatform =>
    APP_PLATFORMS.has(v as AppPlatform),
  )
}

function toPlate(value: unknown): AppPlate {
  return APP_PLATES.has(value as AppPlate) ? (value as AppPlate) : 'reader'
}

function toAppCard(doc: RawApp): AppCard | null {
  if (!doc?.slug || !doc.name) return null
  return {
    id: String(doc.id ?? doc.slug),
    slug: doc.slug,
    name: doc.name,
    tagline: doc.tagline ?? '',
    summary: doc.summary ?? '',
    detail: doc.detail ?? '',
    status: toAppStatus(doc.stage),
    sequence: doc.sequence ?? '',
    platforms: toPlatforms(doc.platforms),
    image: toMediaImage(doc.heroImage),
    plate: toPlate(doc.plate),
  }
}

async function readApps(): Promise<AppCard[]> {
  try {
    const payload = await getPayloadClient()
    const result = await payload.find({
      collection: 'apps',
      overrideAccess: true,
      depth: 1,
      pagination: false,
      limit: 0,
      sort: ['order', 'name'],
      where: published,
    })
    return (result.docs as RawApp[])
      .map(toAppCard)
      .filter((app): app is AppCard => app !== null)
  } catch {
    return []
  }
}

/** Published apps, in editor order. Drafts never reach the public page. */
export const getApps = cachedRead('apps', readApps, [
  CONTENT_TAGS.apps,
  CONTENT_TAGS.media,
])

async function readAppBySlug(
  slug: string,
  options: { draft?: boolean; user?: PreviewUser | null } = {},
): Promise<AppDetail | null> {
  try {
    const payload = await getPayloadClient()
    const result = await payload.find({
      collection: 'apps',
      // A draft read carries the editor's own access, the way pages do.
      overrideAccess: !options.draft,
      user: options.draft ? (options.user ?? undefined) : undefined,
      depth: 1,
      limit: 1,
      draft: options.draft,
      where: options.draft
        ? { slug: { equals: slug } }
        : { and: [{ slug: { equals: slug } }, published] },
    })

    const doc = result.docs[0] as RawApp | undefined
    const card = doc ? toAppCard(doc) : null
    if (!doc || !card) return null

    const screenshots = (doc.screenshots ?? [])
      .map((shot) => ({
        image: toMediaImage(shot?.image),
        caption: shot?.caption ?? '',
      }))
      .filter(
        (shot): shot is { image: MediaImage; caption: string } =>
          shot.image !== null,
      )

    return {
      ...card,
      // `toArticleBody` reads `content`; the field here is `description`.
      body: toArticleBody({ content: doc.description }),
      updatedAt: doc.updatedAt ?? null,
      screenshots,
      appStoreURL: doc.appStoreURL || null,
      playStoreURL: doc.playStoreURL || null,
      metaTitle: doc.metaTitle ?? null,
      metaDescription: doc.metaDescription ?? null,
    }
  } catch {
    return null
  }
}

const getPublishedAppBySlug = cachedRead(
  'app-by-slug',
  (slug: string) => readAppBySlug(slug),
  [CONTENT_TAGS.apps, CONTENT_TAGS.media],
)

/**
 * One app by slug. Published only, unless a preview session asks for the
 * draft — in which case the read runs as that editor rather than cached.
 */
export function getAppBySlug(
  slug: string,
  options: { draft?: boolean; user?: PreviewUser | null } = {},
): Promise<AppDetail | null> {
  return options.draft
    ? readAppBySlug(slug, options)
    : getPublishedAppBySlug(slug)
}

/** All published app slugs (for the sitemap). */
export const getAppSlugs = cachedRead(
  'app-slugs',
  async (): Promise<SlugRef[]> => {
    try {
      const payload = await getPayloadClient()
      const result = await payload.find({
        collection: 'apps',
        overrideAccess: true,
        depth: 0,
        pagination: false,
        limit: 0,
        where: published,
        select: { slug: true, updatedAt: true },
      })
      return (result.docs as Array<{ slug?: string; updatedAt?: string }>)
        .filter((d): d is { slug: string; updatedAt?: string } =>
          Boolean(d.slug),
        )
        .map((d) => ({ slug: d.slug, updatedAt: d.updatedAt ?? null }))
    } catch {
      return []
    }
  },
  [CONTENT_TAGS.apps],
)
