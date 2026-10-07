import { expect, test } from '@playwright/test'

import { fixtures } from './fixtures'

// The publication routes exist and are deployed, and readers must not reach
// them until the owner signs off the launch (lib/publications/launch.ts). The
// seed publishes an issue, so a 404 here is the gate holding, not an empty
// table. When the launch commit flips the switch, these assertions are the
// ones it rewrites.
test.describe('the publication before launch', () => {
  test('the archive is not public', async ({ page }) => {
    const response = await page.goto('/publication/')
    expect(response?.status()).toBe(404)
  })

  test('a published issue is not public either', async ({ page }) => {
    const response = await page.goto(
      `/publication/${fixtures.publishedPublication.slug}/`,
    )
    expect(response?.status()).toBe(404)
    await expect(
      page.getByText(fixtures.publishedPublication.title),
    ).toHaveCount(0)
  })

  test('an unknown issue is a 404 too', async ({ page }) => {
    const response = await page.goto('/publication/not-an-issue/')
    expect(response?.status()).toBe(404)
  })
})
