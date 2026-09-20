import type { Where } from 'payload'

import { cachedRead, CONTENT_TAGS } from '@/lib/cache/content'
import { toMediaImage, type MediaImage } from '@/lib/content/media'
import { live, publishedStatus } from '@/lib/content/schedule'
import { isSubjectTag } from '@/lib/content/topics'
import { ARCHIVE_PAGE_SIZE } from '@/lib/content/pagination'
import { toArticleBody, type ArticleBody } from '@/lib/content/body'
import { readingTimeMinutes } from '@/lib/format'
import { getPayloadClient } from '@/lib/payload'
import type { PreviewUser } from '@/lib/preview/session'
import { appPath, postPath } from '@/lib/seo/site'

export type NavLink = { label: string; url: string }

export type SiteSettings = {
  /** The publication's name: the header brand, and the suffix archive titles carry. */
  title: string
  /**
   * The visible standfirst under the homepage cover, and the RSS channel
   * description. Editorial copy on the page, not a search snippet — which is
   * why `metaDescription` is a separate field rather than this one reused.
   */
  description: string
  /**
   * The homepage's `<title>`. Ghost served
   * `Beyond Every Art | Inspiration, Creativity & Artistry` here, which is the
   * brand plus a tagline rather than the brand alone.
   */
  homeTitle: string
  /** The homepage's meta description: the search snippet, not the standfirst. */
  metaDescription: string
  /**
   * What fills the rail's ad box when no ad is served.
   *
   * Null covers three states that are all the same to a renderer: the editor
   * chose nothing, the thing they chose was deleted (both relationships are
   * `ON DELETE SET NULL`), or it is a draft. The rail then leaves the space
   * empty, which is what it did before this existed.
   */
  railFallback: RailFallback

  /**
   * The picture above the signup in the post rail, when an editor has set one.
   *
   * The only image on the site chosen outside a post, and the only reason this
   * global is read at `depth: 1`. Null is the ordinary state rather than an
   * error — every database that predates the field has it unset, and
   * `ArticleRail` renders a card without a picture rather than a gap.
   */
  newsletterImage: MediaImage | null
}

/**
 * The rail's house slot, resolved to what a component can render.
 *
 * A discriminated union rather than "a post or an app": the two read
 * differently — one is a headline with a tag and a reading time, the other is
 * a product with a tagline — and a renderer that took a bag of optional fields
 * would have to guess which it was holding.
 */
export type RailPromoPost = {
  title: string
  href: string
  /** Tag and reading time, already joined; empty when the post has neither. */
  meta: string
  /**
   * Shown only when a single post was chosen.
   *
   * One headline in a 250px box reads as a mistake rather than as a choice, so
   * a lone pick gets its standfirst and becomes a featured piece. Two or three
   * are a list and do not need it.
   */
  excerpt: string
  /**
   * The post's featured image, used only by the single-pick layout.
   *
   * It is what actually fills the box: a headline and a standfirst come to
   * about 140px of the 272px available, and the rest was paper. With the
   * picture it is 260.
   *
   * It costs nothing to a reader who gets an ad. The fallback sits inside a
   * `display: none` subtree until the slot is known to be empty, and an
   * element with no box is never fetched — the same property the newsletter
   * card's picture relies on to stay off phones.
   */
  image: MediaImage | null
}

export type RailFallback =
  | { kind: 'post'; posts: RailPromoPost[] }
  | {
      kind: 'app'
      name: string
      tagline: string
      href: string
    }
  | null

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

/**
 * What the site serves when the Site Settings global is empty — which it is on
 * both staging and production, so these are the values that actually ship.
 *
 * `homeTitle` and `metaDescription` are carried over from Ghost verbatim. The
 * homepage is the most valuable indexed URL the migration has to keep, and its
 * `<title>` and meta description are the whole of its search snippet; letting
 * the flip rewrite them is a change nobody chose. They are code defaults rather
 * than fields on the global on purpose: a schema change means a migration to
 * run during cutover, and these two values have not changed in the site's
 * lifetime. Add fields when an editor actually needs to edit them — the reads
 * below already prefer the global if one ever appears.
 */
export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  title: 'Beyond Every Art',
  description: 'Art, color, materials, exhibitions, and creative practice.',
  homeTitle: 'Beyond Every Art | Inspiration, Creativity & Artistry',
  metaDescription:
    'Reflect on what lies beyond art. Exploring the discipline, color theory, ' +
    'art history, and strategic frameworks that artists need to develop deeper ' +
    'practices and build cultural literacy.',
  newsletterImage: null,
  railFallback: null,
}

/**
 * Published apps.
 *
 * Apps carry no publication date — they are a roadmap, ordered by hand — so
 * status is the whole of the question for them. Posts and pages go through
 * `live()` instead, which also refuses one whose date has not arrived; see
 * `lib/content/schedule.ts` for why those two collections need more than this.
 *
 * Either way visibility is not part of it. Members-only and subscriber-only
 * posts are listed, searched, syndicated and routed exactly like public ones;
 * what changes is how much of the body a reader is given. Filtering them out
 * here instead is what made them vanish from the site after the Ghost import,
 * taking their URLs and rankings with them. Withholding happens in one place,
 * `toPostDetail`.
 */
const publishedApps: Where = publishedStatus

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

/**
 * How many promoted posts the rail's box can hold.
 *
 * The same three the related list used to show, and for the same reason: the
 * box is 250px and an item is about 60px. A fourth would either overflow or
 * force every item smaller than it reads at.
 */
export const RAIL_PROMO_MAX = 3

/** A relationship resolved at `depth: 1`, or an id, or nothing. */
type RawRelation = Record<string, unknown> | number | string | null | undefined

function isResolved(value: RawRelation): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * The rail's house slot, or null when there is nothing to show.
 *
 * Null for every way this can be unset, and they are not all the editor's
 * doing: `kind` may be `none`, the relationship may be empty, the promoted
 * document may have been deleted out from under it, or it may be a draft.
 * A draft is the one worth calling out — the admin will happily let you point
 * at one, and a reader following that link would get a 404. Filtering at
 * render rather than at selection keeps it correct when the post is
 * unpublished *after* being chosen, which is the case no form validation
 * could catch.
 *
 * Exported for `tests/content/rail-fallback.test.ts`. It is the one normaliser
 * in this file that has to be right about a document it did not fetch itself,
 * and every branch of it is a way for the rail to show a reader a dead link.
 */
function toRailPromoPost(value: RawRelation): RailPromoPost | null {
  if (!isResolved(value)) return null
  if (value._status !== 'published') return null

  const slug = typeof value.slug === 'string' ? value.slug : ''
  const title = typeof value.title === 'string' ? value.title : ''
  if (!slug || !title) return null

  const tag = toTagRefs(value.tags as RawPost['tags'])[0]?.name
  const minutes = readingTimeMinutes(estimateWordCount(value as RawPost))

  return {
    title,
    href: postPath(slug),
    meta: [tag, minutes ? `${minutes} min` : null].filter(Boolean).join(' · '),
    excerpt: typeof value.excerpt === 'string' ? value.excerpt : '',
    image: toMediaImage(value.featuredImage),
  }
}

export function toRailFallback(value: unknown): RailFallback {
  const group = (value ?? {}) as {
    kind?: string
    posts?: RawRelation[] | RawRelation
    app?: RawRelation
  }

  if (group.kind === 'post') {
    const chosen = Array.isArray(group.posts) ? group.posts : []
    const posts = chosen
      .map(toRailPromoPost)
      .filter((post): post is RailPromoPost => post !== null)
      .slice(0, RAIL_PROMO_MAX)

    return posts.length > 0 ? { kind: 'post', posts } : null
  }

  if (group.kind === 'app' && isResolved(group.app)) {
    const doc = group.app
    if (doc._status !== 'published') return null
    const slug = typeof doc.slug === 'string' ? doc.slug : ''
    const name = typeof doc.name === 'string' ? doc.name : ''
    if (!slug || !name) return null

    return {
      kind: 'app',
      name,
      tagline: typeof doc.tagline === 'string' ? doc.tagline : '',
      href: appPath(slug),
    }
  }

  return null
}

/**
 * Site-wide title/description, falling back to sensible defaults.
 *
 * `depth: 1` rather than 0, which it was until this global gained an upload
 * field: at depth 0 Payload returns the media row's id and `toMediaImage` has
 * nothing to read, so the card would silently lose its picture. One join, on a
 * global that is cached and purged on publish.
 */
async function readSiteSettings(): Promise<SiteSettings> {
  try {
    const payload = await getPayloadClient()
    const settings = (await payload.findGlobal({
      slug: 'site-settings',
      overrideAccess: true,
      depth: 1,
    })) as Partial<SiteSettings> & {
      newsletterImage?: unknown
      railFallback?: unknown
    }
    return {
      title: settings.title || DEFAULT_SITE_SETTINGS.title,
      description: settings.description || DEFAULT_SITE_SETTINGS.description,
      homeTitle: settings.homeTitle || DEFAULT_SITE_SETTINGS.homeTitle,
      metaDescription:
        settings.metaDescription || DEFAULT_SITE_SETTINGS.metaDescription,
      newsletterImage: toMediaImage(settings.newsletterImage),
      railFallback: toRailFallback(settings.railFallback),
    }
  } catch {
    return DEFAULT_SITE_SETTINGS
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
      where: live(),
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
      where: live(),
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
 * Published posts an editor has flagged `featured`, newest first.
 *
 * The flag came across from Ghost and until now nothing read it — see
 * `lib/content/homepage.ts` for what the homepage does with it, and why the
 * tier it feeds is capped rather than allowed to fill the section.
 */
async function readFeaturedPosts(limit: number): Promise<PostCard[]> {
  try {
    const payload = await getPayloadClient()
    const result = await payload.find({
      collection: 'posts',
      overrideAccess: true,
      depth: 1,
      limit,
      sort: '-publishedAt',
      where: { and: [{ featured: { equals: true } }, live()] },
    })
    return (result.docs as RawPost[])
      .map(toPostCard)
      .filter((p): p is PostCard => p !== null)
  } catch {
    return []
  }
}

export const getFeaturedPosts = cachedRead(
  'featured-posts',
  readFeaturedPosts,
  [CONTENT_TAGS.posts, CONTENT_TAGS.tags, CONTENT_TAGS.media],
)

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
          live(),
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
  /** Editor asked for this to stay out of search results and the sitemap. */
  noindex: boolean
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
  /**
   * The featured image, which pages carry exactly as posts do
   * (`collections/Pages.ts`). Absent from this type until 19 Sep, which is why
   * `/about/` served its whole life without the image Ghost had: the field
   * migrated, validated and sat in the database with nothing able to read it.
   */
  image: MediaImage | null
  metaTitle: string | null
  metaDescription: string | null
  canonicalURL: string | null
  /** Editor asked for this to stay out of search results and the sitemap. */
  noindex: boolean
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
  noindex?: boolean
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
    noindex: Boolean(doc.noindex),
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
        : { and: [{ slug: { equals: slug } }, live()] },
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
              and: [live(), notThisPost, { 'tags.slug': { in: tagSlugs } }],
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
          live(),
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
            and: [{ slug: { equals: slug } }, live()],
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
      image: toMediaImage(doc.featuredImage),
      metaTitle: doc.metaTitle ?? null,
      metaDescription: doc.metaDescription ?? null,
      canonicalURL: doc.canonicalURL ?? null,
      noindex: Boolean(doc.noindex),
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
      where: { and: [{ [relationField]: { in: [doc.id] } }, live()] },
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
}

/**
 * Every subject with at least one published post behind it, largest first.
 *
 * Unlimited, and the callers slice: the homepage is the site's only topics
 * index — the masthead's "Topics" points at `/#topics`, there is no `/topics`
 * route — so a limit there hid whole archives behind no link at all. One cached
 * entry now serves both the homepage chart and the tag page's sibling list,
 * where two limits meant two entries and two runs of the count-per-tag loop.
 *
 * `isSubjectTag` drops Ghost's workflow tags; see `lib/content/topics.ts` for
 * why that is a denylist and why the archives themselves are unaffected.
 */
async function readTagsWithCounts(): Promise<TopicCard[]> {
  try {
    const payload = await getPayloadClient()
    const tags = await payload.find({
      collection: 'tags',
      overrideAccess: true,
      // Nothing here renders a tag's `featuredImage`, and it is unset on every
      // tag in the library — so `depth: 1` was joining media to discard it.
      depth: 0,
      pagination: false,
      limit: 0,
      select: { name: true, slug: true },
    })

    const results: TopicCard[] = []
    for (const tag of tags.docs as Array<{
      id?: string | number
      name?: string
      slug?: string
    }>) {
      if (!tag.slug || !tag.name || !isSubjectTag(tag.slug)) continue
      const count = await payload.count({
        collection: 'posts',
        overrideAccess: true,
        where: {
          and: [{ tags: { in: [tag.id] } }, live()],
        },
      })
      results.push({
        name: tag.name,
        slug: tag.slug,
        postCount: count.totalDocs,
      })
    }

    return results
      .filter((t) => t.postCount > 0)
      .sort((a, b) => b.postCount - a.postCount)
  } catch {
    return []
  }
}

export const getTagsWithCounts = cachedRead(
  'tags-with-counts',
  readTagsWithCounts,
  [CONTENT_TAGS.posts, CONTENT_TAGS.tags],
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
      where: publishedApps,
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
        : { and: [{ slug: { equals: slug } }, publishedApps] },
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
        where: publishedApps,
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
