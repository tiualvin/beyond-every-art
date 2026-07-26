import { describe, expect, it } from 'vitest'

import {
  crawlSite,
  targetDiscoveryPageBudget,
  type FetchImplementation,
} from '../../lib/migration-verification/crawl'

interface FixtureResponse {
  body?: string
  headers?: Record<string, string>
  status?: number
}

function fixtureFetch(
  origin: string,
  routes: Record<string, FixtureResponse>,
): FetchImplementation {
  return (async (input: string | URL | Request) => {
    const url = new URL(
      input instanceof Request
        ? input.url
        : input instanceof URL
          ? input.href
          : input,
    )
    if (url.origin !== origin)
      throw new Error(`Unexpected origin: ${url.origin}`)
    const fixture = routes[url.pathname]
    if (!fixture) return new Response('missing', { status: 404 })
    return new Response(fixture.body ?? '', {
      status: fixture.status ?? 200,
      headers: fixture.headers,
    })
  }) as FetchImplementation
}

describe('crawlSite', () => {
  it('crawls exact-origin links and records permanent redirects', async () => {
    const origin = 'https://site.example'
    const fetcher = fixtureFetch(origin, {
      '/': {
        body: '<title>Home</title><a href="/post/?ref=home">post</a><a href="https://outside.example/no">outside</a>',
        headers: { 'content-type': 'text/html' },
      },
      '/post/': {
        status: 301,
        headers: { location: '/article/' },
      },
      '/article/': {
        body: '<title>Article</title><link rel="canonical" href="/article/"><img src="/art.jpg" alt="Art">',
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'x-robots-tag': 'max-image-preview:large',
        },
      },
    })

    const result = await crawlSite(
      origin,
      ['/'],
      { concurrency: 2, maxPages: 10 },
      fetcher,
    )
    expect(result.pages.map((page) => page.path)).toEqual(['/', '/post/'])
    expect(result.pages[1]).toMatchObject({
      path: '/post/',
      initialStatus: 301,
      status: 200,
      finalUrl: `${origin}/article/`,
      canonical: `${origin}/article/`,
      robots: ['max-image-preview:large'],
      error: null,
    })
    expect(result.pages[1].redirects).toHaveLength(1)
    expect(result.pages[1].images).toEqual([
      { src: `${origin}/art.jpg`, internal: true, alt: 'Art' },
    ])
  })

  it('does not follow a redirect outside the supplied origin', async () => {
    const origin = 'https://site.example'
    const result = await crawlSite(
      origin,
      ['/'],
      {},
      fixtureFetch(origin, {
        '/': {
          status: 301,
          headers: { location: 'https://outside.example/private' },
        },
      }),
    )
    expect(result.pages[0]).toMatchObject({
      initialStatus: 301,
      status: 301,
      error: 'redirect_out_of_scope',
    })
  })

  it('reports response and page caps instead of crawling without bounds', async () => {
    const origin = 'https://site.example'
    const result = await crawlSite(
      origin,
      ['/'],
      { maxPages: 2, maxResponseBytes: 50 },
      fixtureFetch(origin, {
        '/': {
          body: '<a href="/a">a</a><a href="/b">b</a>',
          headers: { 'content-type': 'text/html' },
        },
        '/a': {
          body: 'x'.repeat(100),
          headers: { 'content-type': 'text/html' },
        },
      }),
    )
    expect(result.limitReached).toBe(true)
    expect(result.pages.map((page) => page.path)).toEqual(['/', '/a'])
    expect(result.pages[1].error).toBe('response_body_limit_exceeded')
  })

  it('rejects credentials and out-of-origin seeds', async () => {
    await expect(crawlSite('https://user:secret@example.com')).rejects.toThrow(
      'must not contain credentials',
    )
    await expect(
      crawlSite('https://example.com', ['https://other.example/']),
    ).rejects.toThrow('outside crawl origin')
  })

  it('rejects origin values that would silently widen crawl scope', async () => {
    await expect(crawlSite('https://example.com/subtree')).rejects.toThrow(
      'must not contain a path, query, or fragment',
    )
    await expect(crawlSite('https://example.com/?preview=1')).rejects.toThrow(
      'must not contain a path, query, or fragment',
    )
    await expect(crawlSite('https://example.com/#section')).rejects.toThrow(
      'must not contain a path, query, or fragment',
    )
  })

  it('reserves a separate bounded budget for target-only discovery', () => {
    expect(targetDiscoveryPageBudget(500)).toBe(1_000)
    expect(targetDiscoveryPageBudget(7_000)).toBe(10_000)
    expect(targetDiscoveryPageBudget(500, 750)).toBe(750)
  })

  it('sends in-memory authorization without persisting it in evidence', async () => {
    const origin = 'https://site.example'
    let receivedAuthorization: string | null = null
    const fetcher = (async (
      _input: string | URL | Request,
      init?: RequestInit,
    ) => {
      receivedAuthorization = new Headers(init?.headers).get('authorization')
      return new Response('<title>Protected</title>', {
        headers: { 'content-type': 'text/html' },
      })
    }) as FetchImplementation

    const result = await crawlSite(origin, ['/'], {}, fetcher, {
      authorization: 'Basic dXNlcjpwYXNzd29yZA==',
    })

    expect(receivedAuthorization).toBe('Basic dXNlcjpwYXNzd29yZA==')
    expect(JSON.stringify(result)).not.toContain('dXNlcjpwYXNzd29yZA')
    expect(JSON.stringify(result)).not.toContain('authorization')
  })

  it('discovers same-origin sitemap URLs from XML and robots.txt', async () => {
    const origin = 'https://site.example'
    const fetcher = fixtureFetch(origin, {
      '/robots.txt': {
        body: `User-agent: *\nDisallow:\nSitemap: ${origin}/sitemap.xml`,
        headers: { 'content-type': 'text/plain' },
      },
      '/sitemap.xml': {
        body: `<urlset><url><loc>${origin}/from-sitemap/</loc></url><url><loc>https://outside.example/no/</loc></url></urlset>`,
        headers: { 'content-type': 'application/xml' },
      },
      '/from-sitemap/': {
        body: '<title>Indexed page</title>',
        headers: { 'content-type': 'text/html' },
      },
    })

    const result = await crawlSite(
      origin,
      ['/robots.txt'],
      { maxPages: 10 },
      fetcher,
    )

    expect(result.pages.map((page) => page.path)).toEqual([
      '/from-sitemap/',
      '/robots.txt',
      '/sitemap.xml',
    ])
    expect(
      result.pages.find((page) => page.path === '/robots.txt')?.robots,
    ).toEqual(['disallow:', `sitemap:${origin}/sitemap.xml`, 'user-agent:*'])
  })
})
