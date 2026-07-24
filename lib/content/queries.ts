import type { Where } from 'payload'

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

async function getGlobalLinks(
  slug: 'header' | 'footer',
): Promise<{ links: NavLink[]; copyright?: string }> {
  try {
    const payload = await getPayloadClient()
    const data = (await payload.findGlobal({
      slug,
      overrideAccess: true,
      depth: 0,
    })) as { links?: NavLink[]; copyright?: string }
    return {
      links: (data.links ?? []).filter((l) => l.label && l.url),
      copyright: data.copyright,
    }
  } catch {
    return { links: [] }
  }
}

export function getHeader(): Promise<{ links: NavLink[] }> {
  return getGlobalLinks('header')
}

export function getFooter(): Promise<{ links: NavLink[]; copyright?: string }> {
  return getGlobalLinks('footer')
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
