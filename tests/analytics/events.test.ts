import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import {
  AD_SLOT_EVENT,
  adSlotParams,
  sendAdSlot,
  type TagTarget,
} from '@/lib/analytics/events'

describe('an ad_slot coverage event', () => {
  it('names the placement and the outcome', () => {
    expect(adSlotParams('article-inline-2', 'unfilled')).toEqual({
      placement: 'article-inline-2',
      fill: 'unfilled',
    })
  })

  // The GA4 tag, loaded directly, takes a gtag command. Everything else about
  // the event — the country, the page, the session — GA4 attaches itself.
  it('goes through gtag when the GA4 tag is loaded directly', () => {
    const gtag = vi.fn()
    sendAdSlot({ tag: 'ga4', gtag }, 'rail-1', 'filled')
    expect(gtag).toHaveBeenCalledWith('event', AD_SLOT_EVENT, {
      placement: 'rail-1',
      fill: 'filled',
    })
  })

  // A Custom Event trigger matches `{ event }` pushes, so that is the shape a
  // container is given — even though `gtag` exists. The consent bootstrap
  // defines it on every page with a Google tag, a container included, so a
  // `typeof gtag` test sent production's events where no trigger could see
  // them.
  it('pushes onto dataLayer for a Tag Manager container, gtag or not', () => {
    const gtag = vi.fn()
    const dataLayer: unknown[] = []
    sendAdSlot({ tag: 'gtm', gtag, dataLayer }, 'home-mid', 'unfilled')
    expect(dataLayer).toEqual([
      { event: AD_SLOT_EVENT, placement: 'home-mid', fill: 'unfilled' },
    ])
    expect(gtag).not.toHaveBeenCalled()
  })

  // In the GA4-direct case `dataLayer` is also an array, so pushing as well
  // would send the event twice. It is one or the other.
  it('does not also push when gtag handled it', () => {
    const dataLayer: unknown[] = []
    sendAdSlot({ tag: 'ga4', gtag: vi.fn(), dataLayer }, 'rail-1', 'filled')
    expect(dataLayer).toEqual([])
  })

  // Staging, or a local build, where analytics is off. Not an error.
  it('is a no-op when no tag is loaded', () => {
    expect(() => sendAdSlot({}, 'rail-1', 'filled')).not.toThrow()
  })

  // AdSense alone: the consent bootstrap has defined `gtag` and `dataLayer`,
  // and no analytics tag is there to read either.
  it('is a no-op on a page with AdSense and no analytics tag', () => {
    const target: TagTarget = { gtag: vi.fn(), dataLayer: [] }
    sendAdSlot(target, 'rail-1', 'filled')
    expect(target.gtag).not.toHaveBeenCalled()
    expect(target.dataLayer).toEqual([])
  })
})

describe('the tag the server rendered', () => {
  const layout = readFileSync(
    join(process.cwd(), 'app/(frontend)/layout.tsx'),
    'utf8',
  )

  // The other half of the contract above: the attribute `reportAdSlot` reads
  // is written from the same decision that chose which tag to load.
  it('is written onto <html> from resolveAnalyticsTag()', () => {
    expect(layout).toContain('const analyticsTag = resolveAnalyticsTag()')
    expect(layout).toContain('data-analytics-tag={analyticsTag?.kind}')
  })
})
