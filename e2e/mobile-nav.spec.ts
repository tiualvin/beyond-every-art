import { expect, test } from '@playwright/test'

test.use({ viewport: { width: 390, height: 844 } })

test('mobile navigation is a keyboard-accessible disclosure', async ({
  page,
}) => {
  await page.goto('/')

  const toggle = page.getByRole('button', { name: 'Menu' })
  const panel = page.locator('#mobile-nav')

  await expect(toggle).toBeVisible()
  await expect(toggle).toHaveAttribute('aria-controls', 'mobile-nav')
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(panel).toBeHidden()

  await toggle.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'Close' })).toHaveAttribute(
    'aria-expanded',
    'true',
  )
  await expect(panel).toBeVisible()
  await expect(panel.getByRole('link', { name: 'Journal' })).toBeVisible()

  await panel.getByRole('link', { name: 'Journal' }).focus()
  await page.keyboard.press('Escape')
  await expect(panel).toBeHidden()
  await expect(toggle).toBeFocused()
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
})
