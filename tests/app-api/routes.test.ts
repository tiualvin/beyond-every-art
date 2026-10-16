// The content API's handlers, against mocked readers.
//
// What is pinned here is everything in front of and behind the read: the
// switch that makes every path a 404 until the owner turns it on, the limits,
// the slug controls a page route already has, the page-size cap, the search
// normalisation, and the contract parse that keeps any field nobody listed
// out of the response. The projection of an article body has its own tests in
// project.test.ts; the real readers, against a real database, are exercised by
// e2e/app-api.spec.ts.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  AuthorListResponseSchema,
  AuthorResponseSchema,
  MAX_PAGE_SIZE,
  MAX_SEARCH_LENGTH,
  PostListResponseSchema,
  PostResponseSchema,
  SearchResponseSchema,
  TagListResponseSchema,
  TagResponseSchema,
} from '../../lib/app-api/contract'
import type {
  Archive,
  AuthorCard,
  PostCard,
  PostDetail,
  TopicCard,
} from '../../lib/content/queries'
import type { MediaImage } from '../../lib/content/media'

const readers = vi.hoisted(() => ({
  getPublishedPosts: vi.fn(),
  getPostBySlug: vi.fn(),
  getTagsWithCounts: vi.fn(),
  getPostsByTag: vi.fn(),
  getAuthorsWithCounts: vi.fn(),
  getPostsByAuthor: vi.fn(),
  searchPosts: vi.fn(),
}))

// Nothing here may reach a database; a reader that is not mocked would.
vi.mock('@/lib/payload', () => ({
  getPayloadClient: async () => {
    throw new Error('no database in a unit test')
  },
}))

// The real module, so `normaliseSearchTerm` is the website's own, with the
// seven readers the routes call replaced.
vi.mock('@/lib/content/queries', async (original) => ({
  ...(await original<typeof import('../../lib/content/queries')>()),
  ...readers,
}))

const SITE = 'https://www.example.com'

const image: MediaImage = {
  url: '/api/media/file/plate.jpg',
  alt: 'A plate of pigments',
  width: 1200,
  height: 800,
  caption: 'SECRET_CAPTION_NOT_IN_CONTRACT',
  credit: 'A. Photographer',
  creditURL: 'https://unsplash.com/@someone',
  cardUrl: '/api/media/file/plate-768x512.jpg',
  ogUrl: null,
}

const card = (slug: string): PostCard => ({
  id: 'SECRET_ID_NOT_IN_CONTRACT',
  slug,
  title: `Title of ${slug}`,
  excerpt: 'An excerpt.',
  publishedAt: '2026-09-01T09:00:00.000Z',
  featured: false,
  authors: [{ name: 'Ada', slug: 'ada', bio: 'SECRET_BIO_ON_A_CARD' }],
  tags: [{ name: 'Pigments', slug: 'pigments' }],
  image,
  readingTime: 4,
  visibility: 'public',
})

const detail = (
  slug: string,
  overrides: Partial<PostDetail> = {},
): PostDetail => ({
  slug,
  title: `Title of ${slug}`,
  excerpt: 'An excerpt.',
  body: {
    kind: 'lexical',
    content: {
      root: {
        type: 'root',
        children: [
          {
            type: 'paragraph',
            children: [{ type: 'text', text: 'The first paragraph.' }],
          },
        ],
      },
    },
  },
  featured: true,
  readingTime: 7,
  publishedAt: '2026-09-01T09:00:00.000Z',
  updatedAt: '2026-09-02T09:00:00.000Z',
  authors: [{ name: 'Ada', slug: 'ada', bio: '  ', image }],
  tags: [{ name: 'Pigments', slug: 'pigments' }],
  image,
  metaTitle: 'SECRET_META_TITLE',
  metaDescription: 'SECRET_META_DESCRIPTION',
  canonicalURL: 'https://elsewhere.example/SECRET_CANONICAL/',
  noindex: true,
  visibility: 'public',
  restricted: false,
  ...overrides,
})

const archive = (slug: string, overrides: Partial<Archive> = {}): Archive => ({
  name: `Name of ${slug}`,
  slug,
  description: '  ',
  metaTitle: 'SECRET_ARCHIVE_META',
  metaDescription: null,
  image: null,
  posts: [card('first'), card('second')],
  ...overrides,
})

const topic: TopicCard = { name: 'Pigments', slug: 'pigments', postCount: 3 }

const author: AuthorCard = {
  name: 'Ada',
  slug: 'ada',
  bio: 'Writes about binders.',
  image,
  postCount: 2,
}

/** A fresh address per call, so no test spends another's allowance. */
let addresses = 0
const nextAddress = () => `203.0.113.${(addresses += 1) % 250}`

type Handler = (
  request: Request,
  context: { params: Promise<Record<string, string>> },
) => Promise<Response>

/**
 * Every handler, freshly imported: the limiters are module state and read
 * their ceilings from the environment when the module loads.
 */
async function loadRoutes() {
  vi.resetModules()
  const routes = {
    posts: (await import('../../app/app-api/v1/posts/route')).GET,
    post: (await import('../../app/app-api/v1/posts/[slug]/route')).GET,
    tags: (await import('../../app/app-api/v1/tags/route')).GET,
    tag: (await import('../../app/app-api/v1/tags/[slug]/route')).GET,
    authors: (await import('../../app/app-api/v1/authors/route')).GET,
    author: (await import('../../app/app-api/v1/authors/[slug]/route')).GET,
    search: (await import('../../app/app-api/v1/search/route')).GET,
  }
  return routes as Record<keyof typeof routes, Handler>
}

function call(
  handler: Handler,
  path: string,
  {
    params = {},
    ip = nextAddress(),
  }: { params?: Record<string, string>; ip?: string } = {},
): Promise<Response> {
  return handler(
    new Request(`${SITE}/app-api/v1/${path}`, {
      headers: { 'x-forwarded-for': ip },
    }),
    { params: Promise.resolve(params) },
  )
}

beforeEach(() => {
  vi.stubEnv('APP_API_ENABLED', '1')
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', SITE)
  for (const reader of Object.values(readers)) reader.mockReset()
  readers.getPublishedPosts.mockResolvedValue({
    posts: [card('first'), card('second')],
    page: 1,
    totalPages: 3,
    totalPosts: 30,
  })
  readers.getPostBySlug.mockImplementation(async (slug: string) =>
    slug === 'missing' ? null : detail(slug),
  )
  readers.getTagsWithCounts.mockResolvedValue([topic])
  readers.getPostsByTag.mockImplementation(async (slug: string) =>
    slug === 'missing' ? null : archive(slug),
  )
  readers.getAuthorsWithCounts.mockResolvedValue([author])
  readers.getPostsByAuthor.mockImplementation(async (slug: string) =>
    slug === 'missing' ? null : archive(slug, { description: 'A bio.' }),
  )
  readers.searchPosts.mockResolvedValue([card('found')])
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

/** The headers every answer carries, and the cache policy for its status. */
function expectHeaders(response: Response) {
  expect(response.headers.get('x-robots-tag')).toBe('noindex')
  expect(response.headers.get('content-type')).toContain('application/json')
  expect(response.headers.get('cache-control')).toBe(
    response.status === 200
      ? 'public, max-age=300, stale-while-revalidate=300'
      : 'no-store',
  )
}

describe('the switch', () => {
  it('answers every path 404 when APP_API_ENABLED is unset, reading nothing', async () => {
    vi.stubEnv('APP_API_ENABLED', '')
    const routes = await loadRoutes()

    const responses = [
      await call(routes.posts, 'posts/'),
      await call(routes.post, 'posts/first/', { params: { slug: 'first' } }),
      await call(routes.tags, 'tags/'),
      await call(routes.tag, 'tags/pigments/', {
        params: { slug: 'pigments' },
      }),
      await call(routes.authors, 'authors/'),
      await call(routes.author, 'authors/ada/', { params: { slug: 'ada' } }),
      await call(routes.search, 'search/?q=blue'),
    ]

    for (const response of responses) {
      expect(response.status).toBe(404)
      expectHeaders(response)
      expect(await response.json()).toEqual({ error: 'Not found' })
    }
    for (const reader of Object.values(readers)) {
      expect(reader).not.toHaveBeenCalled()
    }
  })

  it('takes nothing but exactly 1 to mean on', async () => {
    vi.stubEnv('APP_API_ENABLED', 'true')
    const routes = await loadRoutes()
    expect((await call(routes.posts, 'posts/')).status).toBe(404)
  })

  it('spends no allowance while off', async () => {
    vi.stubEnv('RATE_LIMIT_APP_API_PER_MINUTE', '1')
    vi.stubEnv('APP_API_ENABLED', '')
    const routes = await loadRoutes()
    const ip = nextAddress()

    for (let i = 0; i < 5; i += 1) await call(routes.posts, 'posts/', { ip })

    vi.stubEnv('APP_API_ENABLED', '1')
    expect((await call(routes.posts, 'posts/', { ip })).status).toBe(200)
  })
})

describe('the post list', () => {
  it('answers a page of summaries in the contract’s shape and no other', async () => {
    const { posts } = await loadRoutes()
    const response = await call(posts, 'posts/')

    expect(response.status).toBe(200)
    expectHeaders(response)
    expect(readers.getPublishedPosts).toHaveBeenCalledWith({
      page: 1,
      limit: 12,
    })

    const json = await response.json()
    expect(PostListResponseSchema.parse(json)).toEqual(json)
    expect(json).toMatchObject({
      page: 1,
      pageSize: 12,
      totalPages: 3,
      totalPosts: 30,
    })
    expect(json.posts[0]).toMatchObject({
      href: `${SITE}/first/`,
      authors: [{ name: 'Ada', slug: 'ada' }],
      image: {
        url: `${SITE}/api/media/file/plate.jpg`,
        cardUrl: `${SITE}/api/media/file/plate-768x512.jpg`,
        creditHref: expect.stringMatching(
          /^https:\/\/unsplash\.com\/@someone\?utm_source=/,
        ),
      },
    })
    expect(JSON.stringify(json)).not.toContain('SECRET')
  })

  it('caps the page size rather than refusing a large one', async () => {
    const { posts } = await loadRoutes()
    const json = await (await call(posts, 'posts/?page=2&limit=500')).json()

    expect(readers.getPublishedPosts).toHaveBeenCalledWith({
      page: 2,
      limit: MAX_PAGE_SIZE,
    })
    expect(json.pageSize).toBe(MAX_PAGE_SIZE)
  })

  it.each([
    'page=0',
    'page=-1',
    'page=abc',
    'page=1.5',
    'page=1001',
    'page=01',
    'limit=0',
    'limit=1e3',
    'limit=9999999',
  ])('refuses %s without reading', async (query) => {
    const { posts } = await loadRoutes()
    const response = await call(posts, `posts/?${query}`)

    expect(response.status).toBe(400)
    expectHeaders(response)
    expect(readers.getPublishedPosts).not.toHaveBeenCalled()
  })
})

describe('one post', () => {
  it('answers the detail with the body projected and editorial fields left out', async () => {
    const { post } = await loadRoutes()
    const response = await call(post, 'posts/first/', {
      params: { slug: 'first' },
    })

    expect(response.status).toBe(200)
    expectHeaders(response)
    const json = await response.json()
    expect(PostResponseSchema.parse(json)).toEqual(json)
    expect(json.post).toMatchObject({
      slug: 'first',
      href: `${SITE}/first/`,
      featured: true,
      readingTime: 7,
      restricted: false,
      authors: [{ name: 'Ada', slug: 'ada', bio: null }],
      body: {
        kind: 'lexical',
        nodes: [
          {
            type: 'paragraph',
            children: [
              { type: 'text', text: 'The first paragraph.', format: 0 },
            ],
          },
        ],
      },
    })
    expect(JSON.stringify(json)).not.toContain('SECRET')
    expect(json.post).not.toHaveProperty('noindex')
  })

  it('carries the restriction and whatever teaser the reader cut', async () => {
    readers.getPostBySlug.mockResolvedValue(
      detail('gated', { visibility: 'paid', restricted: true }),
    )
    const { post } = await loadRoutes()
    const json = await (
      await call(post, 'posts/gated/', { params: { slug: 'gated' } })
    ).json()

    expect(json.post).toMatchObject({ visibility: 'paid', restricted: true })
  })

  it('answers a slug that could never be stored without reading or spending', async () => {
    vi.stubEnv('RATE_LIMIT_SLUG_MISSES_PER_MINUTE', '1')
    const { post } = await loadRoutes()
    const ip = nextAddress()

    for (const slug of [
      'Has-Capitals',
      'has.dot',
      '../escape',
      'x'.repeat(201),
    ]) {
      const response = await call(post, `posts/${slug}/`, {
        params: { slug },
        ip,
      })
      expect(response.status).toBe(404)
      expectHeaders(response)
    }
    expect(readers.getPostBySlug).not.toHaveBeenCalled()

    // None of that was a miss, so the one allowed miss is still there.
    expect(
      (await call(post, 'posts/first/', { params: { slug: 'first' }, ip }))
        .status,
    ).toBe(200)
  })

  it('stops reading for a source that has spent its misses', async () => {
    vi.stubEnv('RATE_LIMIT_SLUG_MISSES_PER_MINUTE', '2')
    const { post, tag } = await loadRoutes()
    const ip = nextAddress()
    const ask = (slug: string) =>
      call(post, `posts/${slug}/`, { params: { slug }, ip })

    expect((await ask('missing')).status).toBe(404)
    expect((await ask('first')).status).toBe(200)
    expect((await ask('missing')).status).toBe(404)
    expect(readers.getPostBySlug).toHaveBeenCalledTimes(3)

    // Spent: a real slug is now a 404 without a read, here and on every other
    // slug route, because they share one allowance with the website's pages.
    expect((await ask('first')).status).toBe(404)
    expect(readers.getPostBySlug).toHaveBeenCalledTimes(3)
    expect(
      (await call(tag, 'tags/pigments/', { params: { slug: 'pigments' }, ip }))
        .status,
    ).toBe(404)
    expect(readers.getPostsByTag).not.toHaveBeenCalled()
  })

  it('answers 500 when a value breaks the contract, without saying why', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    readers.getPostBySlug.mockResolvedValue(
      detail('broken', { publishedAt: 'not a date' }),
    )
    const { post } = await loadRoutes()
    const response = await call(post, 'posts/broken/', {
      params: { slug: 'broken' },
    })

    expect(response.status).toBe(500)
    expectHeaders(response)
    expect(await response.json()).toEqual({ error: 'Server error' })
    expect(log).toHaveBeenCalledOnce()
    expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toMatchObject({
      event: 'app_api_failed',
      path: '/app-api/v1/posts/broken/',
    })
  })
})

describe('tags and authors', () => {
  it('lists topics', async () => {
    const { tags } = await loadRoutes()
    const json = await (await call(tags, 'tags/')).json()
    expect(TagListResponseSchema.parse(json)).toEqual(json)
    expect(json).toEqual({ tags: [topic] })
  })

  it('answers a tag archive, a blank description as null', async () => {
    readers.getPostsByTag.mockResolvedValue(archive('pigments', { image }))
    const { tag } = await loadRoutes()
    const response = await call(tag, 'tags/pigments/', {
      params: { slug: 'pigments' },
    })

    expect(response.status).toBe(200)
    expectHeaders(response)
    const json = await response.json()
    expect(TagResponseSchema.parse(json)).toEqual(json)
    expect(json.tag).toMatchObject({
      slug: 'pigments',
      description: null,
      image: { url: `${SITE}/api/media/file/plate.jpg` },
    })
    expect(json.posts).toHaveLength(2)
    expect(JSON.stringify(json)).not.toContain('SECRET')
  })

  it('lists authors with their counts', async () => {
    const { authors } = await loadRoutes()
    const json = await (await call(authors, 'authors/')).json()
    expect(AuthorListResponseSchema.parse(json)).toEqual(json)
    expect(json.authors).toEqual([
      expect.objectContaining({ slug: 'ada', postCount: 2 }),
    ])
  })

  it('answers an author archive with the bio', async () => {
    const { author: route } = await loadRoutes()
    const json = await (
      await call(route, 'authors/ada/', { params: { slug: 'ada' } })
    ).json()
    expect(AuthorResponseSchema.parse(json)).toEqual(json)
    expect(json.author).toEqual({
      name: 'Name of ada',
      slug: 'ada',
      bio: 'A bio.',
      image: null,
    })
  })

  it('answers a missing tag or author 404', async () => {
    const { tag, author: route } = await loadRoutes()
    for (const response of [
      await call(tag, 'tags/missing/', { params: { slug: 'missing' } }),
      await call(route, 'authors/missing/', { params: { slug: 'missing' } }),
    ]) {
      expect(response.status).toBe(404)
      expectHeaders(response)
    }
  })
})

describe('search', () => {
  it('searches for the term as the website normalises it', async () => {
    const { search } = await loadRoutes()
    const term = `  blue   ${'pigment '.repeat(20)}`
    const response = await call(search, `search/?q=${encodeURIComponent(term)}`)

    expect(response.status).toBe(200)
    expectHeaders(response)
    const json = await response.json()
    expect(SearchResponseSchema.parse(json)).toEqual(json)

    const searched = readers.searchPosts.mock.calls[0]?.[0] as string
    expect(searched.startsWith('blue pigment pigment')).toBe(true)
    expect(searched.length).toBeLessThanOrEqual(MAX_SEARCH_LENGTH)
    expect(json.query).toBe(searched)
    expect(readers.searchPosts).toHaveBeenCalledWith(searched, 20)
  })

  it('answers an empty term with nothing, without searching', async () => {
    const { search } = await loadRoutes()
    for (const path of ['search/', 'search/?q=', 'search/?q=%20%20']) {
      expect(await (await call(search, path)).json()).toEqual({
        query: '',
        posts: [],
      })
    }
    expect(readers.searchPosts).not.toHaveBeenCalled()
  })
})

describe('the limits', () => {
  it('throttles reads per source, before reading', async () => {
    vi.stubEnv('RATE_LIMIT_APP_API_PER_MINUTE', '2')
    const { posts } = await loadRoutes()
    const ip = nextAddress()

    expect((await call(posts, 'posts/', { ip })).status).toBe(200)
    expect((await call(posts, 'posts/', { ip })).status).toBe(200)

    const throttled = await call(posts, 'posts/', { ip })
    expect(throttled.status).toBe(429)
    expectHeaders(throttled)
    expect(Number(throttled.headers.get('retry-after'))).toBeGreaterThan(0)
    expect(readers.getPublishedPosts).toHaveBeenCalledTimes(2)

    // Another source is unaffected.
    expect((await call(posts, 'posts/')).status).toBe(200)
  })

  it('limits searches separately and more tightly than reads', async () => {
    vi.stubEnv('RATE_LIMIT_APP_API_SEARCH_PER_MINUTE', '1')
    const { search, posts } = await loadRoutes()
    const ip = nextAddress()

    expect((await call(search, 'search/?q=blue', { ip })).status).toBe(200)
    expect((await call(search, 'search/?q=red', { ip })).status).toBe(429)
    expect(readers.searchPosts).toHaveBeenCalledTimes(1)
    expect((await call(posts, 'posts/', { ip })).status).toBe(200)
  })
})
