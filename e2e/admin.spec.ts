import { expect, test } from '@playwright/test'

import { fixtures } from './fixtures'

// The Payload admin, rendered in a browser.
//
// Everything else that touches `/admin` in this suite checks a status code or a
// header: `csp.spec.ts` fetches it with `request.get` to read the policy off
// the response, and `oauth.spec.ts` only asserts that a `Location` points at
// `/admin/login`. Both pass against a page that paints nothing.
//
// That is not hypothetical. The admin shipped blank — `/admin/login/` answered
// 200, served every chunk, carried a complete and correct RSC payload with the
// login view inside it, and rendered an empty document. No console error, no
// failed request, no non-2xx anywhere. A component was missing from
// `app/(payload)/admin/importMap.ts`, and Payload's response to that is to
// abandon the render rather than report it, so the only thing that can catch it
// is asking a browser what it actually drew.
//
// These two assertions are deliberately shallow. They are not admin feature
// coverage; they are the smoke alarm for "the CMS is down", which is the one
// failure mode that every cheaper check in this repository is blind to.

test('the login page renders its form', async ({ page }) => {
  await page.goto('/admin/login/')

  // The fields, not the shell. A blank admin still has the right `<title>` and
  // the right stylesheets — the title is rendered from metadata, which resolves
  // even when the view does not.
  await expect(page.locator('input[name="email"]')).toBeVisible()
  await expect(page.locator('input[name="password"]')).toBeVisible()
  await expect(page.getByRole('button', { name: /log ?in/i })).toBeVisible()
})

test('signing in reaches a dashboard that has rendered', async ({ page }) => {
  await page.goto('/admin/login/')

  await page.fill('input[name="email"]', fixtures.mcp.adminEmail)
  await page.fill('input[name="password"]', fixtures.mcp.password)
  await page.getByRole('button', { name: /log ?in/i }).click()

  await page.waitForURL(/\/admin\/?$/)

  // Collection links come from the config through the same import map the
  // login view needed, so an admin that authenticates and then paints nothing
  // fails here rather than passing as a successful login.
  await expect(
    page.locator('nav').getByRole('link', { name: 'Posts' }),
  ).toBeVisible()
})
