// The content API, answered from the bundled fixtures, in process.
//
// What the app uses when no API base URL is configured — which is the default,
// so the app makes no request for content at all until somebody points it at a
// website (docs/COMPANION_APP.md). It answers the same paths with the same
// shapes and the same refusals the website's endpoints will: an unslashed path
// is a 308, an unknown one is a 404, a page size is capped. The client cannot
// tell the difference, which is the point: the code under test is the code
// that ships.

import type { Transport, TransportResponse } from './client'
import {
  API_PREFIX,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  MAX_SEARCH_LENGTH,
  type PostDetail,
  type PostSummary,
} from './contract'
import { fixturePosts } from '../fixtures/posts'
import { showcasePosts } from '../fixtures/showcase'

/**
 * Which posts the fixtures serve: `modules`, the test cases every block and
 * edge case is checked against, or `showcase`, sample articles that look like
 * the journal's for preview builds (fixtures/showcase.ts).
 */
export type FixtureSet = 'modules' | 'showcase'

/** The origin the fixture transport answers on. It does not resolve. */
export const FIXTURE_ORIGIN = 'https://fixtures.invalid'

const respond = (status: number, body: unknown): TransportResponse => {
  // Serialised and parsed, so a caller holding the result cannot reach back
  // into the fixtures — the same isolation a network gives for free.
  const json = JSON.stringify(body)
  return { status, json: async () => JSON.parse(json) as unknown }
}

const notFound = () => respond(404, { error: 'Not found' })

export function toSummary(post: PostDetail): PostSummary {
  return {
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    href: post.href,
    publishedAt: post.publishedAt,
    featured: post.featured,
    readingTime: post.readingTime,
    visibility: post.visibility,
    authors: post.authors.map(({ name, slug }) => ({ name, slug })),
    tags: post.tags,
    image: post.image,
  }
}

const positiveInteger = (value: string | null, fallback: number) => {
  if (value === null) return fallback
  return /^\d+$/.test(value) && Number(value) > 0 ? Number(value) : null
}

export function createFixtureTransport(
  siteUrl: string,
  set: FixtureSet = 'modules',
): Transport {
  const source = set === 'showcase' ? showcasePosts : fixturePosts
  const posts = source(siteUrl).sort((a, b) =>
    (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''),
  )
  const summaries = posts.map(toSummary)

  /** Everyone with a byline in the set, once each. */
  const authors = [
    ...new Map(
      posts
        .flatMap((post) => post.authors)
        .filter((author) => author.slug)
        .map((author) => [author.slug!, author]),
    ).values(),
  ]

  const tagsWithCounts = () => {
    const counts = new Map<
      string,
      { name: string; slug: string; postCount: number }
    >()
    for (const post of posts) {
      for (const tag of post.tags) {
        const entry = counts.get(tag.slug) ?? { ...tag, postCount: 0 }
        entry.postCount += 1
        counts.set(tag.slug, entry)
      }
    }
    return [...counts.values()].sort(
      (a, b) => b.postCount - a.postCount || a.name.localeCompare(b.name),
    )
  }

  return async (raw) => {
    const url = new URL(raw)
    if (url.origin !== FIXTURE_ORIGIN || !url.pathname.startsWith(API_PREFIX)) {
      return notFound()
    }
    if (!url.pathname.endsWith('/')) {
      return respond(308, { error: 'Permanent redirect to the slashed path' })
    }

    const segments = url.pathname
      .slice(API_PREFIX.length)
      .split('/')
      .filter(Boolean)
      .map(decodeURIComponent)
    const [resource, slug, extra] = segments
    if (extra !== undefined) return notFound()

    if (resource === 'posts' && slug === undefined) {
      const page = positiveInteger(url.searchParams.get('page'), 1)
      const limit = positiveInteger(
        url.searchParams.get('limit'),
        DEFAULT_PAGE_SIZE,
      )
      if (page === null || limit === null) {
        return respond(400, { error: 'page and limit are positive integers' })
      }
      const pageSize = Math.min(limit, MAX_PAGE_SIZE)
      const totalPages = Math.max(1, Math.ceil(summaries.length / pageSize))
      return respond(200, {
        posts: summaries.slice((page - 1) * pageSize, page * pageSize),
        page,
        pageSize,
        totalPages,
        totalPosts: summaries.length,
      })
    }

    if (resource === 'posts') {
      const post = posts.find((candidate) => candidate.slug === slug)
      return post ? respond(200, { post }) : notFound()
    }

    if (resource === 'tags' && slug === undefined) {
      return respond(200, { tags: tagsWithCounts() })
    }

    if (resource === 'tags') {
      const tag = tagsWithCounts().find((candidate) => candidate.slug === slug)
      if (!tag) return notFound()
      return respond(200, {
        tag: { name: tag.name, slug: tag.slug, description: null, image: null },
        posts: summaries.filter((post) =>
          post.tags.some((candidate) => candidate.slug === slug),
        ),
      })
    }

    const byAuthor = (authorSlug: string) =>
      summaries.filter((post) =>
        post.authors.some((author) => author.slug === authorSlug),
      )

    if (resource === 'authors' && slug === undefined) {
      return respond(200, {
        authors: authors.map((author) => ({
          ...author,
          postCount: byAuthor(author.slug!).length,
        })),
      })
    }

    if (resource === 'authors') {
      const author = authors.find((candidate) => candidate.slug === slug)
      if (!author) return notFound()
      return respond(200, { author, posts: byAuthor(author.slug!) })
    }

    if (resource === 'search' && slug === undefined) {
      const query = (url.searchParams.get('q') ?? '')
        .trim()
        .replace(/\s+/g, ' ')
        .slice(0, MAX_SEARCH_LENGTH)
      const needle = query.toLowerCase()
      return respond(200, {
        query,
        posts: needle
          ? summaries.filter((post) =>
              `${post.title} ${post.excerpt}`.toLowerCase().includes(needle),
            )
          : [],
      })
    }

    return notFound()
  }
}
