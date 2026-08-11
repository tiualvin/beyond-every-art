import { expect, test } from '@playwright/test'

import { fixtures } from './fixtures'

test.describe('representative public journeys', () => {
  test('homepage leads into the seeded journal', async ({ page }) => {
    await page.goto('/')

    // The cover's wording is editorial and changes with the design; what this
    // journey guards is that the page has exactly one first-level heading and
    // that it renders. Naming the copy here only made a redesign look like a
    // regression.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(
      page.getByText(fixtures.publicPost.title).first(),
    ).toBeVisible()
    await expect(
      page.getByRole('link', { name: 'Read the journal' }),
    ).toHaveAttribute('href', '/journal')
  })

  test('journal and article preserve the public reading path', async ({
    page,
  }) => {
    await page.goto('/journal')

    await expect(
      page.getByRole('heading', {
        level: 1,
        name: 'Every story, newest first',
      }),
    ).toBeVisible()
    await page.getByRole('link', { name: fixtures.publicPost.title }).click()
    await expect(page).toHaveURL(new RegExp(`/${fixtures.publicPost.slug}/?$`))
    await expect(
      page.getByRole('heading', { level: 1, name: fixtures.publicPost.title }),
    ).toBeVisible()
    await expect(
      page.getByRole('heading', {
        level: 2,
        name: 'Why the difference matters',
      }),
    ).toBeVisible()
  })

  test('page, tag, and author archives render seeded content', async ({
    page,
  }) => {
    await page.goto(`/${fixtures.page.slug}/`)
    await expect(
      page.getByRole('heading', { level: 1, name: fixtures.page.title }),
    ).toBeVisible()

    await page.goto(`/tag/${fixtures.tag.slug}/`)
    await expect(
      page.getByRole('heading', { level: 1, name: fixtures.tag.title }),
    ).toBeVisible()
    await expect(
      page.getByText(fixtures.publicPost.title).first(),
    ).toBeVisible()

    await page.goto(`/author/${fixtures.author.slug}/`)
    await expect(
      page.getByRole('heading', { level: 1, name: fixtures.author.title }),
    ).toBeVisible()
    await expect(
      page.getByText(fixtures.publicPost.title).first(),
    ).toBeVisible()
  })

  test('search returns a public article and noindexes result pages', async ({
    page,
  }) => {
    await page.goto('/search/')
    await page
      .getByRole('searchbox', { name: 'Search articles' })
      .fill('Titanium')
    // `exact`: the masthead's "Open search" button also contains "Search".
    await page.getByRole('button', { name: 'Search', exact: true }).click()

    await expect(page).toHaveURL(/\/search\/?\?q=Titanium$/)
    await expect(
      page.getByText(fixtures.publicPost.title).first(),
    ).toBeVisible()
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      'content',
      /noindex/,
    )
  })

  test('newsletter accepts an idempotent synthetic signup', async ({
    page,
  }) => {
    await page.goto('/newsletter/')
    await expect(
      page.getByRole('heading', { level: 1, name: 'Stay in the loop' }),
    ).toBeVisible()

    await page
      .getByRole('textbox', { name: 'Email address' })
      .fill('playwright-smoke@example.test')
    await page.getByRole('button', { name: 'Subscribe' }).click()

    await expect(page).toHaveURL(/\/newsletter\/?\?status=success$/)
    await expect(page.getByRole('status')).toContainText("You're subscribed")
  })
})
