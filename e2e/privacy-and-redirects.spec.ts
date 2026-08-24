import { expect, test } from '@playwright/test'

import { fixtures } from './fixtures'

// Each written the way the site serves it, so these requests exercise the
// surfaces themselves rather than the trailing-slash redirect in front of them.
const DISCOVERY_PATHS = [
  '/',
  '/journal/',
  '/search/?q=E2E',
  '/sitemap.xml',
  '/rss/',
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
  // Requested exactly as stored, trailing slash and all. That is the shape a
  // Ghost permalink has, so it is the shape a reader or a crawler arrives with,
  // and with `trailingSlash: true` it is served without a normalisation hop
  // in front of it: one request, one permanent redirect. The previous version
  // of this test stripped the slash to dodge a normalisation redirect that
  // pointed the other way, and in doing so stopped testing the real journey.
  const response = await request.get(fixtures.redirect.source, {
    maxRedirects: 0,
  })

  expect(response.status()).toBe(301)
  expect(new URL(response.headers().location).pathname).toBe(
    fixtures.redirect.destination,
  )
})

test('a legacy URL redirects to the host the reader used, not the bind address', async ({
  request,
}) => {
  // The assertion the other test cannot make, and the reason this one exists.
  //
  // Redirects were built by resolving the destination against
  // `request.nextUrl.origin`, which Next composes from `HOSTNAME` and the
  // forwarded scheme rather than from the request — so in the container, where
  // HOSTNAME is `0.0.0.0` and Caddy sends `X-Forwarded-Proto: https`, every
  // migrated Ghost URL sent readers and crawlers to `https://0.0.0.0:3000/...`,
  // and the middleware's own fetch of the redirect map failed the TLS handshake
  // before that. Nothing caught it: under Playwright the bind address is the
  // address the test dialled, so a redirect built the wrong way still points
  // somewhere that works.
  //
  // Forwarding a host that is deliberately not the one the server is bound to
  // is what separates the two. The old code ignored these headers completely.
  const response = await request.get(fixtures.redirect.source, {
    maxRedirects: 0,
    headers: {
      'x-forwarded-host': 'readers.example',
      'x-forwarded-proto': 'https',
    },
  })

  expect(response.status()).toBe(301)
  expect(response.headers().location).toBe(
    `https://readers.example${fixtures.redirect.destination}`,
  )
})
