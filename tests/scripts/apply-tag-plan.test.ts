import { describe, expect, it } from 'vitest'

import { parseArgs, redirectIsLive } from '../../scripts/apply-tag-plan'

describe('tags:apply arguments', () => {
  it('needs a plan', () => {
    expect(() => parseArgs(['--dry-run'])).toThrow('--plan')
  })

  it('dry-runs without a site', () => {
    expect(parseArgs(['--plan', 'p.json', '--dry-run'])).toMatchObject({
      dryRun: true,
      reportPath: '.migration-reports/tag-plan-report.json',
    })
  })

  it('will not change posts without first asking the site about its redirects', () => {
    // The order is the whole safety of a retirement: redirect served, then
    // posts moved. A real run with nothing to ask cannot keep it.
    expect(() => parseArgs(['--plan', 'p.json'])).toThrow('--site')
    expect(
      parseArgs(['--plan', 'p.json', '--site', 'https://www.example.com/']),
    ).toMatchObject({ site: 'https://www.example.com', liveCheck: true })
    expect(parseArgs(['--plan', 'p.json', '--no-live-check']).liveCheck).toBe(
      false,
    )
  })

  it('refuses a site that is more than an origin', () => {
    expect(() =>
      parseArgs(['--plan', 'p.json', '--site', 'https://www.example.com/tag/']),
    ).toThrow('bare origin')
  })
})

describe('redirectIsLive', () => {
  const answer =
    (status: number, location?: string): typeof fetch =>
    async () =>
      new Response(null, {
        status,
        headers: location ? { location } : {},
      })

  const SITE = 'https://www.example.com'

  it('accepts a permanent redirect to the planned destination', async () => {
    expect(
      await redirectIsLive(
        SITE,
        '/tag/art/',
        '/journal/',
        answer(301, 'https://www.example.com/journal/'),
      ),
    ).toBe(true)
    expect(
      await redirectIsLive(
        SITE,
        '/tag/art/',
        '/journal/',
        answer(308, '/journal/'),
      ),
    ).toBe(true)
  })

  it('does not accept the archive still being served', async () => {
    expect(
      await redirectIsLive(SITE, '/tag/art/', '/journal/', answer(200)),
    ).toBe(false)
  })

  it('does not accept a temporary redirect, or one going elsewhere', async () => {
    expect(
      await redirectIsLive(
        SITE,
        '/tag/art/',
        '/journal/',
        answer(302, '/journal/'),
      ),
    ).toBe(false)
    expect(
      await redirectIsLive(SITE, '/tag/art/', '/journal/', answer(301, '/')),
    ).toBe(false)
  })

  it('treats a site it cannot reach as not ready', async () => {
    const unreachable: typeof fetch = async () => {
      throw new TypeError('fetch failed')
    }
    expect(
      await redirectIsLive(SITE, '/tag/art/', '/journal/', unreachable),
    ).toBe(false)
  })
})
