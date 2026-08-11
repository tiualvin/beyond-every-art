import { expect, type Page, test } from '@playwright/test'

/**
 * The masthead's controls are React state, so a click that lands before
 * hydration does nothing and the overlay never opens. `data-ready` is set when
 * the chrome mounts on the client, which is the difference between "the button
 * is on screen" and "the button works".
 */
async function openHome(page: Page) {
  await page.goto('/')
  await expect(page.locator('.site-header__actions[data-ready]')).toBeAttached()
}

test.describe('header chrome', () => {
  test('mobile navigation is a keyboard-accessible disclosure', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await openHome(page)

    const toggle = page.getByRole('button', { name: 'Open menu' })
    const panel = page.locator('#mobile-nav')

    await expect(toggle).toBeVisible()
    await expect(toggle).toHaveAttribute('aria-controls', 'mobile-nav')
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(panel).toBeHidden()

    await toggle.focus()
    await page.keyboard.press('Enter')
    const close = page.getByRole('button', { name: 'Close menu' })
    await expect(close).toHaveAttribute('aria-expanded', 'true')
    await expect(panel).toBeVisible()
    await expect(panel.getByRole('link', { name: 'Journal' })).toBeVisible()

    // The panel's contents clear the masthead, so the control that opened the
    // menu is still on screen to close it. The panel's own box is full-bleed;
    // what has to sit below the bar is what you can see and touch.
    const headerBox = await page.locator('.site-header').first().boundingBox()
    const searchBox = await panel
      .locator('.mobile-nav__search')
      .first()
      .boundingBox()
    expect(searchBox!.y).toBeGreaterThanOrEqual(headerBox!.height)

    await panel.getByRole('link', { name: 'Journal' }).focus()
    await page.keyboard.press('Escape')
    await expect(panel).toBeHidden()
    await expect(toggle).toBeFocused()
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })

  test('search opens as a drawer and finds a seeded article', async ({
    page,
  }) => {
    await openHome(page)

    const panel = page.locator('.search-panel')
    await expect(panel).toBeHidden()

    await page.getByRole('button', { name: 'Open search' }).click()
    await expect(panel).toBeVisible()

    const field = panel.getByRole('searchbox', { name: 'Search the archive' })
    await expect(field).toBeFocused()
    await field.fill('white')

    const results = panel.locator('.search__result')
    await expect(results.first()).toBeVisible()
    // Results are real posts from the same query `/search` runs, not a
    // client-side index that could disagree with it.
    await expect(results.first()).toHaveAttribute('href', /^\/[^/]+\/?$/)

    await page.keyboard.press('Escape')
    await expect(panel).toBeHidden()
  })

  test('subscribe modal records a signup without leaving the page', async ({
    page,
  }) => {
    await openHome(page)

    // By role alone: the dialog is labelled by its own heading, and that
    // heading changes once the signup succeeds.
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeHidden()

    // Located by class, not label: the bar's call to action is editable in
    // site settings and currently reads "Newsletter".
    await page.locator('.site-header__subscribe').click()
    await expect(dialog).toBeVisible()

    await dialog
      .getByLabel('Email address')
      .fill(`chrome-${Date.now()}@example.com`)
    await dialog.getByRole('button', { name: 'Subscribe' }).click()

    await expect(dialog.getByText(/you.re on the list/i)).toBeVisible()
    // The whole point of the modal over the newsletter page: no navigation.
    expect(new URL(page.url()).pathname).toBe('/')

    await dialog.getByRole('button', { name: 'Done' }).click()
    await expect(dialog).toBeHidden()
  })

  test('the paid plan prices both periods and offers no dead payment button', async ({
    page,
  }) => {
    await openHome(page)
    await page.locator('.site-header__subscribe').click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // Free is the default, and the billing toggle belongs to the paid plan.
    await expect(dialog.locator('.plan.is-selected .plan__name')).toHaveText(
      'Free',
    )
    await expect(dialog.locator('.billing')).toBeHidden()

    await dialog.locator('.plan input[value=paid]').check({ force: true })
    await expect(dialog.locator('.plan.is-selected .plan__name')).toHaveText(
      'Member',
    )
    await expect(dialog.locator('.plan__price').nth(1)).toContainText('$5')

    await dialog.getByRole('button', { name: /Yearly/ }).click()
    await expect(dialog.locator('.plan__price').nth(1)).toContainText('$50')

    // No payment link is configured in CI, and the modal has to say so rather
    // than offer a button that goes nowhere.
    await expect(dialog.locator('.modal__cta')).toBeDisabled()
    await expect(dialog.getByText(/isn.t open here yet/i)).toBeVisible()
  })
})
