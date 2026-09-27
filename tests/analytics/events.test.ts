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

  // The GA4 tag, loaded directly, defines `gtag`. Everything else about the
  // event — the country, the page, the session — GA4 attaches itself.
  it('goes through gtag when the GA4 tag is loaded directly', () => {
    const gtag = vi.fn()
    sendAdSlot({ gtag }, 'rail-1', 'filled')
    expect(gtag).toHaveBeenCalledWith('event', AD_SLOT_EVENT, {
      placement: 'rail-1',
      fill: 'filled',
    })
  })

  // A Tag Manager container does not define `gtag`; a GA4 event tag inside it
  // maps `ad_slot` to a hit, so the event goes on `dataLayer` in GTM's shape.
  it('pushes onto dataLayer for a Tag Manager container', () => {
    const dataLayer: unknown[] = []
    sendAdSlot({ dataLayer } as TagTarget, 'home-mid', 'unfilled')
    expect(dataLayer).toEqual([
      { event: AD_SLOT_EVENT, placement: 'home-mid', fill: 'unfilled' },
    ])
  })

  // In the GA4-direct case `dataLayer` is also an array, so pushing as well
  // would send the event twice. It is one or the other.
  it('does not also push when gtag handled it', () => {
    const dataLayer: unknown[] = []
    sendAdSlot({ gtag: vi.fn(), dataLayer }, 'rail-1', 'filled')
    expect(dataLayer).toEqual([])
  })

  // Staging, or a local build, where analytics is off. Not an error.
  it('is a no-op when no tag is loaded', () => {
    expect(() => sendAdSlot({}, 'rail-1', 'filled')).not.toThrow()
  })
})
