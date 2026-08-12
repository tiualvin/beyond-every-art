import { expect, test } from '@playwright/test'

import { fixtures } from './fixtures'

const DISCOVERY_PATHS = [
  '/',
  '/journal',
  '/search/?q=E2E',
  '/sitemap.xml',
  '/rss',
]

// The homepage shows a fixed number of recent pieces, so it can legitimately
// not reach a given post; every other surface lists the whole archive.
const LISTING_PATHS = DISCOVERY_PATHS.filter((path) => path !== '/')

test('draft posts are not publicly reachable', async ({ request }) => {
  const response = await request.get(`/${fixtures.draftPost.slug}/`)
  expect(response.status()).toBe(404)
})

test('draft posts do not leak into public discovery endpoints', async ({
  request,
}) => {
  for (const path of DISCOVERY_PATHS) {
    const response = await request.get(path)
    expect(response.ok(), path).toBeTruthy()
    const body = await response.text()
    expect(body, path).not.toContain(fixtures.draftPost.title)
    expect(body, path).not.toContain(fixtures.draftPost.slug)
  }
})

test('a members-only post serves a teaser instead of disappearing', async ({
  page,
}) => {
  const response = await page.goto(`/${fixtures.privatePost.slug}/`)

  expect(response?.status()).toBe(200)
  await expect(
    page.getByRole('heading', { level: 1, name: fixtures.privatePost.title }),
  ).toBeVisible()
  await expect(page.locator('.prose--teaser')).toContainText(
    fixtures.privatePost.teaserMarker,
  )
  await expect(page.locator('.gate')).toBeVisible()

  // The withheld part must be absent from the document, not merely hidden:
  // anything in the markup is one "view source" away from being read.
  expect(await page.content()).not.toContain(fixtures.privatePost.gatedMarker)
})

test('the membership gate opens the subscribe modal', async ({ page }) => {
  await page.goto(`/${fixtures.privatePost.slug}/`)
  // The modal is the masthead's; `data-ready` is how the other specs wait for
  // that component to hydrate before clicking anything wired to its state.
  await expect(page.locator('.site-header__actions[data-ready]')).toBeAttached()

  await page.locator('.gate').getByRole('button').click()

  await expect(page.getByRole('dialog')).toBeVisible()
})

test('a members-only post stays listed, searchable and syndicated', async ({
  request,
}) => {
  for (const path of LISTING_PATHS) {
    const response = await request.get(path)
    expect(response.ok(), path).toBeTruthy()
    const body = await response.text()
    expect(body, path).toContain(fixtures.privatePost.slug)
    expect(body, path).not.toContain(fixtures.privatePost.gatedMarker)
  }
})

test('an imported body does not print the title a second time', async ({
  page,
}) => {
  const { slug, title } = fixtures.duplicateTitlePost
  await page.goto(`/${slug}/`)

  await expect(page.getByRole('heading', { name: title })).toHaveCount(1)
})

test('legacy URLs return the seeded permanent redirect', async ({
  request,
}) => {
  // Avoid Next.js' trailing-slash normalization redirect so this assertion
  // exercises the seeded redirect handled by middleware directly.
  const source = fixtures.redirect.source.replace(/\/$/, '')
  const response = await request.get(source, {
    maxRedirects: 0,
  })

  expect(response.status()).toBe(301)
  expect(response.headers().location).toMatch(
    new RegExp(`${fixtures.redirect.destination}$`),
  )
})
