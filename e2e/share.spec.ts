import { expect, test } from '@playwright/test'

import { fixtures } from './fixtures'

test('an article offers copy, email, and the native share sheet where it exists', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto(`/${fixtures.publicPost.slug}/`)

  const share = page.locator('.share')
  await expect(share).toBeVisible()

  // Email is a real mailto carrying the title, not a button that does nothing.
  const email = share.getByRole('link', { name: 'Email' })
  await expect(email).toHaveAttribute(
    'href',
    new RegExp(
      `^mailto:\\?subject=${encodeURIComponent(
        fixtures.publicPost.title,
      ).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
    ),
  )

  await share.getByRole('button', { name: 'Copy link' }).click()
  await expect(share.getByRole('status')).toHaveText('Link copied')

  const copied = await page.evaluate(() => navigator.clipboard.readText())
  expect(copied).toBe(page.url())

  // `navigator.share` is absent in headless Chromium, and the button is only
  // rendered where the browser can actually open a sheet.
  const supported = await page.evaluate(() => 'share' in navigator)
  await expect(
    share.getByRole('button', { name: 'Share', exact: true }),
  ).toHaveCount(supported ? 1 : 0)
})
