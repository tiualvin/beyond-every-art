import {
  ApiError,
  clampPageSize,
  createApiClient,
  normaliseQuery,
  type Transport,
} from '../client'
import { MAX_PAGE_SIZE } from '../contract'
import { FIXTURE_ORIGIN, createFixtureTransport } from '../fixture-transport'
import { GATED_MARKERS } from '../../fixtures/posts'

const SITE = 'https://www.beyondeveryart.com'

/** The fixture transport, with every URL it was asked for recorded. */
function recordingClient() {
  const fixtures = createFixtureTransport(SITE)
  const requested: string[] = []
  const transport: Transport = (url) => {
    requested.push(url)
    return fixtures(url)
  }
  return {
    client: createApiClient({ baseUrl: FIXTURE_ORIGIN, transport }),
    requested,
  }
}

const respondWith =
  (status: number, body: unknown): Transport =>
  async () => ({ status, json: async () => body })

describe('the API client', () => {
  it('ends every request path in a slash', async () => {
    const { client, requested } = recordingClient()
    await client.listPosts({ page: 1 })
    await client.getPost('fixture-every-module')
    await client.listTags()
    await client.getTag('materials')
    await client.listAuthors()
    await client.getAuthor('fixture-editor')
    await client.search('module')

    expect(requested).toHaveLength(7)
    for (const url of requested) {
      expect(new URL(url).pathname).toMatch(/^\/app-api\/v1\/.*\/$/)
    }
  })

  it('reads a page of posts, newest first', async () => {
    const { client } = recordingClient()
    const page = await client.listPosts({ page: 1, limit: 2 })
    expect(page.posts.map((post) => post.slug)).toEqual([
      'fixture-every-module',
      'fixture-migrated-article',
    ])
    expect(page.totalPages).toBe(Math.ceil(page.totalPosts / 2))
  })

  it('never asks for more than the maximum page size', async () => {
    const { client, requested } = recordingClient()
    const page = await client.listPosts({ limit: 1000 })
    expect(new URL(requested[0]!).searchParams.get('limit')).toBe(
      String(MAX_PAGE_SIZE),
    )
    expect(page.pageSize).toBe(MAX_PAGE_SIZE)
  })

  it('answers null for a slug nothing has', async () => {
    const { client } = recordingClient()
    expect(await client.getPost('no-such-post')).toBeNull()
    expect(await client.getTag('no-such-tag')).toBeNull()
  })

  it('encodes a slug rather than letting it change the path', async () => {
    const { client, requested } = recordingClient()
    await client.getPost('../tags')
    expect(new URL(requested[0]!).pathname).toBe('/app-api/v1/posts/..%2Ftags/')
  })

  it('marks an unknown node instead of rejecting the article', async () => {
    const { client } = recordingClient()
    const post = await client.getPost('fixture-every-module')
    expect(post?.body.kind).toBe('lexical')
    const kinds =
      post?.body.kind === 'lexical'
        ? post.body.nodes.filter((node) => node.type === 'unsupported')
        : []
    expect(kinds).toEqual([
      { type: 'unsupported', nodeType: 'block', blockType: 'carousel' },
      { type: 'unsupported', nodeType: 'table', blockType: null },
    ])
  })

  it('serves a gated post’s teaser and never the rest', async () => {
    const { client } = recordingClient()
    const post = await client.getPost('e2e-members-conservation-notes')
    expect(post?.restricted).toBe(true)
    const serialised = JSON.stringify(post)
    expect(serialised).toContain(GATED_MARKERS.teaser)
    expect(serialised).not.toContain(GATED_MARKERS.gated)
  })

  it('searches for the normalised term, and not at all for nothing', async () => {
    const { client, requested } = recordingClient()
    expect(await client.search('   ')).toEqual({ query: '', posts: [] })
    expect(requested).toHaveLength(0)

    const result = await client.search('  every   module ')
    expect(result.query).toBe('every module')
    expect(result.posts.map((post) => post.slug)).toEqual([
      'fixture-every-module',
    ])
  })

  it('reports a response that breaks the contract', async () => {
    const client = createApiClient({
      baseUrl: FIXTURE_ORIGIN,
      transport: respondWith(200, { posts: 'not a list' }),
    })
    await expect(client.listPosts()).rejects.toMatchObject({ kind: 'invalid' })
  })

  it('reports an error status', async () => {
    const client = createApiClient({
      baseUrl: FIXTURE_ORIGIN,
      transport: respondWith(503, { error: 'down' }),
    })
    await expect(client.listTags()).rejects.toMatchObject({
      kind: 'status',
      status: 503,
    })
  })

  it('reports a request that never arrived', async () => {
    const client = createApiClient({
      baseUrl: FIXTURE_ORIGIN,
      transport: async () => {
        throw new TypeError('Network request failed')
      },
    })
    const error = await client.listAuthors().catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ kind: 'network' })
  })

  it('reads the API from the root of a configured origin', async () => {
    const urls: string[] = []
    const client = createApiClient({
      baseUrl: 'http://192.168.1.20:3000',
      transport: async (url) => {
        urls.push(url)
        return { status: 200, json: async () => ({ tags: [] }) }
      },
    })
    await client.listTags()
    expect(urls).toEqual(['http://192.168.1.20:3000/app-api/v1/tags/'])
  })
})

describe('request helpers', () => {
  it('normalises a query the way the server does', () => {
    expect(normaliseQuery('  ultramarine   blue ')).toBe('ultramarine blue')
    expect(normaliseQuery('x'.repeat(100))).toHaveLength(64)
  })

  it('clamps a page size into range', () => {
    expect(clampPageSize(0)).toBe(1)
    expect(clampPageSize(7.9)).toBe(7)
    expect(clampPageSize(Number.NaN)).toBe(12)
    expect(clampPageSize(10_000)).toBe(MAX_PAGE_SIZE)
  })
})
