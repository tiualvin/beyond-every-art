import {
  expect,
  test,
  type APIRequestContext,
  type APIResponse,
} from '@playwright/test'
import type { z } from 'zod/v4'

import {
  API_PREFIX,
  AuthorListResponseSchema,
  AuthorResponseSchema,
  MAX_PAGE_SIZE,
  PostListResponseSchema,
  PostResponseSchema,
  SearchResponseSchema,
  TagListResponseSchema,
  TagResponseSchema,
  apiPaths,
  type PostSummary,
} from '../lib/app-api/contract'
import { fixtures } from './fixtures'

// The companion app's content API, over the wire.
//
// The handlers are unit-tested against mocked readers (tests/app-api/); what
// only a running server can show is that the real readers, against a real
// database, give the answers the contract promises: slashed URLs, a gated post
// cut to its teaser, a draft that does not exist, and nothing in any answer
// that the contract does not name.
//
// The API answers here because `playwright.config.ts` sets APP_API_ENABLED=1
// for the test server. In CI a second server from the same build runs with it
// off, and the last test reads that one.

/** The CI-only server with the API switched off (`appApiOffServer`). */
const OFF_ORIGIN = 'http://127.0.0.1:3001'

const remote = Boolean(process.env.PLAYWRIGHT_BASE_URL)

const path = (relative: string) => `${API_PREFIX}${relative}`

/**
 * The parsed body, after showing that parsing it through its schema changes
 * nothing: an answer with a key the contract does not name, or a value it
 * does not allow, fails here.
 */
async function contractBody<T>(
  response: APIResponse,
  schema: z.ZodType<T>,
): Promise<T> {
  expect(response.status(), await response.text()).toBe(200)
  const json = await response.json()
  expect(schema.parse(json) as unknown).toEqual(json)
  return json as T
}

function expectApiHeaders(response: APIResponse) {
  const headers = response.headers()
  expect(headers['x-robots-tag']).toBe('noindex')
  expect(headers['content-type']).toContain('application/json')
  expect(headers['cache-control']).toBe(
    response.status() === 200
      ? 'public, max-age=300, stale-while-revalidate=300'
      : 'no-store',
  )
}

/** An article link: absolute, on the website, at the post's slashed path. */
function expectArticleLinks(posts: PostSummary[]) {
  for (const post of posts) {
    expect(new URL(post.href).pathname).toBe(`/${post.slug}/`)
  }
}

const get = (request: APIRequestContext, relative: string) =>
  request.get(path(relative), { maxRedirects: 0 })

test.describe('the content API', () => {
  test.skip(
    remote,
    'off on every deployment until the owner decides (docs/COMPANION_APP.md)',
  )

  test('redirects an unslashed path to its slashed form, query intact', async ({
    request,
  }) => {
    const response = await request.get(`${API_PREFIX}posts?limit=2`, {
      maxRedirects: 0,
    })
    expect(response.status()).toBe(308)
    expect(response.headers().location).toBe(`${API_PREFIX}posts/?limit=2`)
  })

  test('lists live posts newest first, with every article link slashed', async ({
    request,
  }) => {
    // Every page, so the assertions do not depend on how many posts the seeds
    // happen to write.
    const posts: PostSummary[] = []
    for (let page = 1, totalPages = 1; page <= totalPages; page += 1) {
      // Past the cap on purpose: the answer says how many it actually sent.
      const response = await get(request, apiPaths.posts(page, 500))
      expectApiHeaders(response)
      const list = await contractBody(response, PostListResponseSchema)
      expect(list.pageSize).toBe(MAX_PAGE_SIZE)
      expect(list.page).toBe(page)
      totalPages = list.totalPages
      posts.push(...list.posts)
    }

    const slugs = posts.map((post) => post.slug)
    expect(slugs).toContain(fixtures.publicPost.slug)
    expect(slugs).toContain(fixtures.privatePost.slug)
    expect(slugs).not.toContain(fixtures.draftPost.slug)

    const dates = posts.map((post) => Date.parse(post.publishedAt ?? ''))
    expect(dates).toEqual([...dates].sort((a, b) => b - a))
    expectArticleLinks(posts)
  })

  test('answers a public post in full', async ({ request }) => {
    const response = await get(request, apiPaths.post(fixtures.publicPost.slug))
    expectApiHeaders(response)
    const { post } = await contractBody(response, PostResponseSchema)

    expect(post).toMatchObject({
      slug: fixtures.publicPost.slug,
      title: fixtures.publicPost.title,
      restricted: false,
    })
    expect(post.body.kind).not.toBe('empty')
    expectArticleLinks([post])
  })

  test('cuts a gated post to the teaser the website shows', async ({
    request,
  }) => {
    const response = await get(
      request,
      apiPaths.post(fixtures.privatePost.slug),
    )
    const { post } = await contractBody(response, PostResponseSchema)

    expect(post).toMatchObject({ visibility: 'members', restricted: true })
    const raw = JSON.stringify(post)
    expect(raw).toContain(fixtures.privatePost.teaserMarker)
    expect(raw).not.toContain(fixtures.privatePost.gatedMarker)
  })

  test('answers a draft exactly like a slug that was never used', async ({
    request,
  }) => {
    for (const slug of [fixtures.draftPost.slug, 'e2e-no-such-post-anywhere']) {
      const response = await get(request, apiPaths.post(slug))
      expect(response.status()).toBe(404)
      expectApiHeaders(response)
      expect(await response.json()).toEqual({ error: 'Not found' })
    }
  })

  test('answers tags, a tag, authors and an author in the contract’s shape', async ({
    request,
  }) => {
    const tags = await contractBody(
      await get(request, apiPaths.tags()),
      TagListResponseSchema,
    )
    expect(tags.tags.map((tag) => tag.slug)).toContain(fixtures.tag.slug)

    const tag = await contractBody(
      await get(request, apiPaths.tag(fixtures.tag.slug)),
      TagResponseSchema,
    )
    expect(tag.tag.slug).toBe(fixtures.tag.slug)
    expect(tag.posts.length).toBeGreaterThan(0)

    const authors = await contractBody(
      await get(request, apiPaths.authors()),
      AuthorListResponseSchema,
    )
    expect(authors.authors.map((author) => author.slug)).toContain(
      fixtures.author.slug,
    )

    const author = await contractBody(
      await get(request, apiPaths.author(fixtures.author.slug)),
      AuthorResponseSchema,
    )
    expect(author.author.name).toBe(fixtures.author.title)
    expect(author.posts.map((post) => post.slug)).toContain(
      fixtures.publicPost.slug,
    )

    expectArticleLinks([...tag.posts, ...author.posts])
  })

  test('searches the way the website does, without the gated text', async ({
    request,
  }) => {
    const found = await contractBody(
      await get(request, apiPaths.search('  Titanium  ')),
      SearchResponseSchema,
    )
    expect(found.query).toBe('Titanium')
    expect(found.posts.map((post) => post.slug)).toContain(
      fixtures.publicPost.slug,
    )
    expectArticleLinks(found.posts)

    // A members-only post is still found, as it is on the website; what
    // comes back is its summary, never its body.
    const gated = await contractBody(
      await get(request, apiPaths.search(fixtures.privatePost.title)),
      SearchResponseSchema,
    )
    expect(gated.posts).toContainEqual(
      expect.objectContaining({
        slug: fixtures.privatePost.slug,
        visibility: 'members',
      }),
    )
    expect(JSON.stringify(gated)).not.toContain(
      fixtures.privatePost.gatedMarker,
    )
  })

  test('refuses page zero rather than guessing', async ({ request }) => {
    const response = await get(request, apiPaths.posts(0))
    expect(response.status()).toBe(400)
    expectApiHeaders(response)
  })

  test('owns nothing above its version', async ({ request }) => {
    for (const relative of ['', 'nope/']) {
      const response = await request.get(
        relative ? path(relative) : API_PREFIX,
        { maxRedirects: 0 },
      )
      expect(response.status()).toBe(404)
    }
  })
})

test.describe('the content API switched off', () => {
  test.skip(
    remote || !process.env.CI,
    'the switched-off server runs only in CI, from the standalone build',
  )

  test('answers every path 404, uncached and unindexed', async ({
    playwright,
  }) => {
    const off = await playwright.request.newContext({ baseURL: OFF_ORIGIN })
    try {
      for (const relative of [
        apiPaths.posts(),
        apiPaths.post(fixtures.publicPost.slug),
        apiPaths.tags(),
        apiPaths.tag(fixtures.tag.slug),
        apiPaths.authors(),
        apiPaths.author(fixtures.author.slug),
        apiPaths.search('Titanium'),
      ]) {
        const response = await get(off, relative)
        expect(response.status(), relative).toBe(404)
        expectApiHeaders(response)
        expect(await response.json()).toEqual({ error: 'Not found' })
      }

      // Every method, not only the one the routes export: Next would answer
      // OPTIONS and an unexported method itself, without asking the handler.
      for (const method of ['OPTIONS', 'POST', 'DELETE']) {
        const response = await off.fetch(path(apiPaths.posts()), {
          method,
          maxRedirects: 0,
        })
        expect(response.status(), method).toBe(404)
        expectApiHeaders(response)
      }

      // The same build, so the difference is the switch and nothing else.
      expect((await off.get('/health/')).status()).toBe(200)
    } finally {
      await off.dispose()
    }
  })
})
