import { expect, test } from '@playwright/test'

import { fixtures } from './fixtures'

// The two boxes on `docs/MIGRATION_REHEARSAL.md` §4 that only a browser can
// tick: "Payload admin loads and editing works" and "Draft preview works from
// the admin Preview button".
//
// `admin.spec.ts` deliberately stops short of these — it is the smoke alarm for
// a CMS that renders nothing, and says so. What it cannot catch is an admin that
// paints correctly and then fails to write, or a Preview button that is present
// and points somewhere useless. Both look like a working CMS until an editor
// tries to use one.
//
// Written against seeded fixtures, so what these establish is that the mechanism
// works — the half the rehearsal note says a local run can settle. Whether the
// 117 migrated posts survived is a question for the content audit, and nothing
// here answers it.

/** Payload autosaves on an 800ms interval, and CI is slower than a laptop. */
const SAVE_TIMEOUT = 20_000

/**
 * The edit view for one document.
 *
 * Anchored on a numeric id and the end of the path because the obvious pattern
 * is not: `trailingSlash` leaves the *list* at `/admin/collections/posts/` with
 * its query string, which satisfies anything ending `posts/[^/]+`. A wait
 * written that way passes without navigating anywhere, and the failure lands
 * later on a page the test never meant to be looking at.
 */
const EDIT_VIEW = /\/admin\/collections\/posts\/\d+\/?(\?.*)?$/

// These drive the admin rather than fetching from it: a sign-in, a React
// application booting, and two or three full navigations each. The suite's
// 30s default is sized for a page render and is not enough for that, and a
// timeout here reads as "the CMS is broken" rather than "the budget was short".
//
// Serial because the first test adds and removes a row in the posts list and
// the second reads that list. Run in parallel they are a race: the preview test
// waits for a link while the list re-renders under it, and fails for a reason
// that has nothing to do with previewing.
test.describe.configure({ mode: 'serial', timeout: 90_000 })

async function signIn(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/admin/login/')
  await page.fill('input[name="email"]', fixtures.mcp.adminEmail)
  await page.fill('input[name="password"]', fixtures.mcp.password)
  await page.getByRole('button', { name: /log ?in/i }).click()
  await page.waitForURL(/\/admin\/?$/)
}

test('an editor can create a post and the write survives a reload', async ({
  page,
}) => {
  // Unique per run: the suite is `fullyParallel`, this is the one spec that
  // writes, and a run that dies part-way must not poison the next one.
  const stamp = Date.now()
  const title = `E2E Admin Write ${stamp}`
  const slug = `e2e-admin-write-${stamp}`

  await signIn(page)
  await page.goto('/admin/collections/posts/create')
  await page.fill('#field-title', title)

  // No save button is clicked, and that is the real path rather than a
  // shortcut: `versions.drafts.autosave` is what Live Preview depends on, so
  // the first write happens on its own. Leaving `/create` for an id is the
  // proof a row now exists in Postgres.
  await page.waitForURL(EDIT_VIEW, { timeout: SAVE_TIMEOUT })

  // A second field, saved by a second autosave, so this covers update as well
  // as create. The slug is left empty by the create path — the hook that fills
  // it from the title runs on validation, which an autosaved draft skips.
  const saved = page.waitForResponse(
    (response) =>
      /\/api\/posts/.test(response.url()) && response.status() < 400,
    { timeout: SAVE_TIMEOUT },
  )
  await page.fill('#field-slug', slug)
  await saved

  // The assertion that matters: read it back from the database rather than
  // from the form state still sitting in the page.
  //
  // Navigated away and back rather than reloaded. A reload restores the view
  // from what the browser already had and leaves the fields blank here, which
  // is a fact about `page.reload()` and not about the write — a fresh visit to
  // the same URL shows both values, and is what an editor returning to a
  // document actually does.
  const documentUrl = page.url()
  await page.goto('/admin')
  await page.goto(documentUrl)
  await expect(page.locator('#field-title')).toHaveValue(title, {
    timeout: SAVE_TIMEOUT,
  })
  await expect(page.locator('#field-slug')).toHaveValue(slug)

  // Clean up through the UI, which exercises the delete path rather than
  // reaching around it.
  await page.goto(documentUrl)
  await page.locator('.doc-controls__popup button').first().click()
  await page.getByRole('button', { name: /^delete$/i }).click()
  await page
    .locator('dialog, [role="dialog"]')
    .getByRole('button', { name: /^(delete|confirm|yes)/i })
    .first()
    .click()
  await page.waitForURL(/\/admin\/collections\/posts\/?(\?.*)?$/, {
    timeout: SAVE_TIMEOUT,
  })
})

test('the Preview button opens the draft it belongs to', async ({
  page,
  context,
}) => {
  await signIn(page)

  // Reached by clicking the row, which also covers the draft being listed for
  // an editor — the same document the public is answered 404 for in
  // `privacy-and-redirects.spec.ts`.
  //
  // Not looked up through `page.request`: that helper does not carry the
  // Payload session cookie the browser just obtained, so the query runs
  // anonymously, sees published documents only, and finds nothing. It answers
  // 200 with an empty list rather than 401, which is correct behaviour and a
  // convincing way to conclude the draft is missing.
  await page.goto('/admin/collections/posts?limit=100')
  await page.waitForLoadState('networkidle')
  await page
    .getByRole('link', { name: new RegExp(fixtures.draftPost.title, 'i') })
    .first()
    .click()
  await page.waitForURL(EDIT_VIEW)

  // Selected by href, because the control is an icon with no text: there are
  // two anchors to /api/preview and the one carrying `live=1` is the Live
  // Preview iframe toggle, not the button this covers.
  const previewLink = page
    .locator('a[href*="/api/preview?"][target="_blank"]')
    .filter({ hasNot: page.locator('[href*="live=1"]') })
    .first()
  await expect(previewLink).toHaveAttribute(
    'href',
    new RegExp(`slug=${fixtures.draftPost.slug}`),
  )

  const opened = context.waitForEvent('page')
  await previewLink.click()
  const preview = await opened
  await preview.waitForLoadState('domcontentloaded')

  // /api/preview authorises the session, turns draft mode on, and redirects to
  // the document's real path. Landing there with the draft's own heading is the
  // proof the whole chain ran — not merely that a tab opened.
  await expect(preview).toHaveURL(new RegExp(`/${fixtures.draftPost.slug}/?$`))
  await expect(
    preview.getByRole('heading', { name: fixtures.draftPost.title }).first(),
  ).toBeVisible()
})

test('preview refuses a reader who is not signed in', async ({ request }) => {
  // The other half of the same route, and why the button needs no secret in its
  // URL: authorisation is the session. Without one this is a refusal rather
  // than a door into unpublished work.
  //
  // Requested with the trailing slash `trailingSlash: true` puts on every URL.
  // Without it the answer is a 308 to the slashed form and the assertion below
  // would be testing the redirect rather than the route.
  const response = await request.get(
    `/api/preview/?collection=posts&slug=${fixtures.draftPost.slug}`,
    { maxRedirects: 0 },
  )

  expect(response.status()).toBe(401)
})
