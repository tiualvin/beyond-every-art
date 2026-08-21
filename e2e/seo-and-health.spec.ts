import { expect, test } from '@playwright/test'

import { fixtures } from './fixtures'

test('article metadata, canonical URL, and structured data agree', async ({
  page,
}) => {
  await page.goto(`/${fixtures.publicPost.slug}/`)

  await expect(page).toHaveTitle(new RegExp(fixtures.publicPost.title))
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    new RegExp(`/${fixtures.publicPost.slug}/$`),
  )
  await expect(page.locator('meta[property="og:type"]')).toHaveAttribute(
    'content',
    'article',
  )

  const jsonLd = JSON.parse(
    (await page.locator('script[type="application/ld+json"]').textContent()) ||
      '{}',
  ) as { '@type'?: string; headline?: string; url?: string }
  expect(jsonLd['@type']).toBe('Article')
  expect(jsonLd.headline).toBe(fixtures.publicPost.title)
  expect(jsonLd.url).toMatch(new RegExp(`/${fixtures.publicPost.slug}/$`))
})

test('the URL a page advertises is the URL it serves', async ({ request }) => {
  // The migration's central promise: a Ghost permalink keeps working as-is.
  // Ghost served every URL with a trailing slash, so that shape must answer
  // directly, and the unslashed one must point at it rather than the reverse.
  //
  // Before `trailingSlash: true` this ran backwards — the canonical tag, the
  // sitemap, and the feed all advertised `/slug/` while `/slug/` redirected to
  // `/slug`, so every URL the site published about itself was one that bounced,
  // and the page a crawler landed on named a redirect as its real address.
  const slashed = await request.get(`/${fixtures.publicPost.slug}/`, {
    maxRedirects: 0,
  })
  expect(slashed.status()).toBe(200)

  const unslashed = await request.get(`/${fixtures.publicPost.slug}`, {
    maxRedirects: 0,
  })
  expect(unslashed.status()).toBe(308)
  expect(
    new URL(unslashed.headers().location, 'http://localhost').pathname,
  ).toBe(`/${fixtures.publicPost.slug}/`)
})

test('the routes that are not pages answer on the address their callers use', async ({
  request,
}) => {
  // `trailingSlash: true` applies to route handlers too, and two of these are
  // called by something that treats a redirect as a failure rather than
  // following it: Stripe's webhook delivery, and a browser posting a CSP
  // violation report. Each address here is one a caller is configured with, so
  // a redirect would be a silent outage rather than an extra hop.
  for (const path of ['/health/', '/rss/', '/redirects-map/']) {
    const response = await request.get(path, { maxRedirects: 0 })
    expect(
      response.status(),
      `${path} should be served directly, not redirected`,
    ).toBe(200)
  }
})

test('robots, sitemap, and RSS expose the public launch surface', async ({
  request,
}) => {
  const robots = await request.get('/robots.txt')
  expect(robots.ok()).toBeTruthy()
  expect(await robots.text()).toMatch(/Sitemap: .*\/sitemap\.xml/)

  const sitemap = await request.get('/sitemap.xml')
  expect(sitemap.ok()).toBeTruthy()
  expect(sitemap.headers()['content-type']).toContain('application/xml')
  const sitemapXml = await sitemap.text()
  expect(sitemapXml).toContain(`/${fixtures.publicPost.slug}/`)
  expect(sitemapXml).toContain(`/tag/${fixtures.tag.slug}/`)
  expect(sitemapXml).toContain(`/author/${fixtures.author.slug}/`)

  const rss = await request.get('/rss')
  expect(rss.ok()).toBeTruthy()
  expect(rss.headers()['content-type']).toContain('application/rss+xml')
  expect(await rss.text()).toContain(fixtures.publicPost.title)
})

test('health reports application and database readiness', async ({
  request,
}) => {
  const response = await request.get('/health')
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toMatch(/application\/json/)
  expect(await response.json()).toMatchObject({ status: 'ok', db: 'up' })
})
