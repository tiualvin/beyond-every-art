import { expect, test } from '@playwright/test'

import { fixtures } from './fixtures'

test('draft and private posts are not publicly reachable', async ({
  request,
}) => {
  for (const post of [fixtures.draftPost, fixtures.privatePost]) {
    const response = await request.get(`/${post.slug}/`)
    expect(response.status(), post.slug).toBe(404)
  }
})

test('draft and private posts do not leak into public discovery endpoints', async ({
  request,
}) => {
  const responses = await Promise.all([
    request.get('/'),
    request.get('/journal'),
    request.get(`/search/?q=E2E`),
    request.get('/sitemap.xml'),
    request.get('/rss'),
  ])

  for (const response of responses) {
    expect(response.ok(), response.url()).toBeTruthy()
    const body = await response.text()
    expect(body).not.toContain(fixtures.draftPost.title)
    expect(body).not.toContain(fixtures.privatePost.title)
    expect(body).not.toContain(fixtures.draftPost.slug)
    expect(body).not.toContain(fixtures.privatePost.slug)
  }
})

test('legacy URLs return the seeded permanent redirect', async ({
  request,
}) => {
  const response = await request.get(fixtures.redirect.source, {
    maxRedirects: 0,
  })

  expect(response.status()).toBe(301)
  expect(response.headers().location).toMatch(
    new RegExp(`${fixtures.redirect.destination}$`),
  )
})
