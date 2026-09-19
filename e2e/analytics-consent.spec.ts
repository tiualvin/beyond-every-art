import { expect, test } from '@playwright/test'

/**
 * Consent Mode defaults have to reach `dataLayer` before a Google tag acts on
 * them, and nothing about that is visible on the page — a default that arrives
 * too late looks exactly like one that arrived in time, except that a cookie
 * was written on an EEA visit before the banner was answered.
 *
 * It also cannot be asserted from the source. The order depends on what React
 * hoists into `<head>`, which placement Next honours, and when `next/script`
 * injects a tag — three behaviours of the framework rather than of this
 * repository, and two of them already surprised us: `beforeInteractive` does
 * not hoist from a route-group root layout, and React lifts both async loaders
 * above an explicit `<head>`. So it is pinned here, against a running server.
 */

/** Whatever the page pushed to `dataLayer`, as a list of command names. */
async function dataLayerCommands(page: import('@playwright/test').Page) {
  return page.evaluate(() =>
    ((window as unknown as { dataLayer?: IArguments[] }).dataLayer ?? []).map(
      (entry) => String(Array.from(entry)[0]),
    ),
  )
}

test('consent defaults reach dataLayer before the tag that sends a hit', async ({
  page,
}) => {
  await page.goto('/')

  // The analytics tag is injected after hydration, so the page has to have
  // settled before the order means anything.
  await expect(page.locator('.site-header__actions[data-ready]')).toBeAttached()
  await page.waitForTimeout(500)

  const commands = await dataLayerCommands(page)

  // Nothing is configured on a deployment that renders no Google tag at all,
  // and that is a valid state rather than a failure — `resolveAnalyticsTag`
  // and `resolveAdsenseClient` both return null on a noindex deployment.
  test.skip(
    commands.length === 0,
    'no Google tag on this deployment, so no consent default to order',
  )

  const firstConsent = commands.indexOf('consent')
  expect(
    firstConsent,
    'no consent default was declared',
  ).toBeGreaterThanOrEqual(0)

  // `config` is the command that sends GA4's first hit. Anything that reads
  // consent must come after the defaults, and this is the one that does.
  const firstConfig = commands.indexOf('config')
  if (firstConfig >= 0) expect(firstConsent).toBeLessThan(firstConfig)
})

test('the denied default names regions rather than denying everywhere', async ({
  page,
}) => {
  await page.goto('/')

  const script = await page.locator('script#consent-mode').textContent()
  test.skip(!script, 'no Google tag on this deployment')

  // Denying globally would be denying forever outside Europe: Google's CMP
  // shows no banner there, so nothing would ever update the signal, and
  // analytics would go cookieless worldwide while looking configured.
  expect(script).toContain('"region"')
  expect(script).toContain('"GB"')
  expect(script).not.toContain('"US"')
  expect(script).toContain('"wait_for_update":500')
})
