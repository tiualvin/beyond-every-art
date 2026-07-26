import { expect, test } from '@playwright/test'

import { fixtures } from './fixtures'

// Unit tests prove the policy string is built correctly; only a real response
// proves it is actually attached. Next.js `headers()` entries are easy to
// misconfigure in a way that typechecks and passes unit tests while reaching no
// route at all.

test('the report-only policy reaches public pages', async ({ request }) => {
  const response = await request.get(`/${fixtures.publicPost.slug}/`)
  expect(response.ok()).toBeTruthy()

  const headers = response.headers()
  const policy = headers['content-security-policy-report-only']

  // Report-only by default: an enforcing header must never appear by accident.
  expect(policy, 'report-only policy header').toBeTruthy()
  expect(headers['content-security-policy']).toBeUndefined()

  expect(policy).toContain("object-src 'none'")
  expect(policy).toContain("base-uri 'self'")
  expect(policy).toContain("form-action 'self'")
  // Live Preview frames the site from the admin on this same origin.
  expect(policy).toContain("frame-ancestors 'self'")
  expect(policy).toContain('report-uri /csp-report')

  expect(headers['reporting-endpoints']).toContain('csp-endpoint')
})

test('the policy also covers the Payload admin', async ({ request }) => {
  // The admin is the surface `middleware.ts` deliberately skips, which is why
  // the policy is attached in next.config.ts instead. If that ever moves to
  // middleware, this is the assertion that catches the gap.
  const response = await request.get('/admin')
  expect(response.headers()['content-security-policy-report-only']).toBeTruthy()
})

test('the report endpoint accepts a violation and reveals nothing', async ({
  request,
}) => {
  const response = await request.post('/csp-report', {
    headers: { 'content-type': 'application/csp-report' },
    data: JSON.stringify({
      'csp-report': {
        'effective-directive': 'script-src',
        'blocked-uri': 'https://evil.example/x.js',
        'document-uri': '/e2e-probe/',
      },
    }),
  })

  // Always 204, with no body: a caller learns nothing about what was recorded.
  expect(response.status()).toBe(204)
  expect(await response.text()).toBe('')

  // Junk is swallowed just as quietly — the endpoint is unauthenticated.
  const junk = await request.post('/csp-report', { data: 'not json at all' })
  expect(junk.status()).toBe(204)

  const get = await request.get('/csp-report')
  expect(get.status()).toBe(405)
})
