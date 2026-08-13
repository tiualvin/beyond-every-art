import { expect, test } from '@playwright/test'

import { fixtures } from './fixtures'

test.describe('the apps roadmap', () => {
  test('lists published apps and hides drafts', async ({ page }) => {
    await page.goto('/apps')

    await expect(
      page.getByRole('heading', { level: 1, name: 'Apps' }),
    ).toBeVisible()
    await expect(
      page.getByRole('heading', {
        level: 2,
        name: fixtures.publishedApp.title,
      }),
    ).toBeVisible()

    // The page has to keep saying that none of this exists.
    await expect(page.getByText('None of them exist yet.')).toBeVisible()

    // A draft app must not leak into the list or the waitlist's options.
    await expect(page.getByText(fixtures.draftApp.title)).toHaveCount(0)
  })

  test('an unpublished app has no URL', async ({ page }) => {
    const response = await page.goto(`/apps/${fixtures.draftApp.slug}`)
    expect(response?.status()).toBe(404)
  })

  test('an unknown app 404s rather than rendering an empty page', async ({
    page,
  }) => {
    const response = await page.goto('/apps/not-an-app')
    expect(response?.status()).toBe(404)
  })

  test('an app links through to its own page', async ({ page }) => {
    await page.goto('/apps')
    await page
      .getByRole('link', { name: `More about ${fixtures.publishedApp.title}` })
      .click()

    await expect(page).toHaveURL(
      new RegExp(`/apps/${fixtures.publishedApp.slug}$`),
    )
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: fixtures.publishedApp.title,
      }),
    ).toBeVisible()
    // Nothing has shipped, so the page offers the waitlist, not a store link.
    await expect(page.getByRole('button', { name: 'Notify me' })).toBeVisible()
  })

  test('the waitlist takes one address against several apps', async ({
    page,
  }) => {
    await page.goto('/apps')

    await page
      .getByRole('checkbox', { name: fixtures.publishedApp.title })
      .check()
    await page.fill('#waitlist-email', `e2e-${Date.now()}@example.test`)
    await page.getByRole('button', { name: 'Notify me' }).click()

    await expect(page.getByRole('heading', { name: 'Thank you' })).toBeVisible()
  })

  test('the waitlist refuses an empty selection', async ({ page }) => {
    await page.goto('/apps')

    await page.fill('#waitlist-email', 'e2e-nothing-ticked@example.test')
    await page.getByRole('button', { name: 'Notify me' }).click()

    await expect(
      page.getByText('Tick at least one of them first.'),
    ).toBeVisible()
  })
})
