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
