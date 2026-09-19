import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  ADSENSE_CLIENT,
  adsenseScriptUrl,
  resolveAdsenseClient,
} from '@/lib/ads/adsense'

describe('resolveAdsenseClient', () => {
  it('loads the committed publisher when nothing is configured', () => {
    expect(resolveAdsenseClient({})).toBe(ADSENSE_CLIENT)
  })

  it('lets an operator point at a different publisher', () => {
    expect(
      resolveAdsenseClient({
        NEXT_PUBLIC_ADSENSE_CLIENT: 'ca-pub-1234567890123456',
      }),
    ).toBe('ca-pub-1234567890123456')
  })

  it('trims a value pasted with surrounding whitespace', () => {
    expect(
      resolveAdsenseClient({
        NEXT_PUBLIC_ADSENSE_CLIENT: '  ca-pub-1234567890123456  ',
      }),
    ).toBe('ca-pub-1234567890123456')
  })

  // The switch that has to work on the worst day: a policy complaint needs the
  // tag gone in the time it takes to restart the container, not a deploy.
  it('loads nothing when switched off', () => {
    expect(
      resolveAdsenseClient({ NEXT_PUBLIC_ADSENSE_CLIENT: 'off' }),
    ).toBeNull()
    expect(
      resolveAdsenseClient({ NEXT_PUBLIC_ADSENSE_CLIENT: 'OFF' }),
    ).toBeNull()
  })

  // Ad code on a deployment that search engines are told to ignore is how an
  // AdSense application gets declined: the reviewer is asked to monetise a page
  // the crawler cannot reach.
  it('loads nothing on a non-indexable deployment', () => {
    expect(resolveAdsenseClient({ NEXT_PUBLIC_NOINDEX: '1' })).toBeNull()
    expect(
      resolveAdsenseClient({
        NEXT_PUBLIC_NOINDEX: 'true',
        NEXT_PUBLIC_ADSENSE_CLIENT: 'ca-pub-1234567890123456',
      }),
    ).toBeNull()
  })

  it('loads nothing for a malformed publisher id', () => {
    for (const value of [
      'pub-3878635086147352',
      'ca-pub-387863508614735',
      'ca-pub-38786350861473521',
      'ca-pub-abcdefghijklmnop',
      'ca-pub-3878635086147352"></script><script>',
    ]) {
      expect(resolveAdsenseClient({ NEXT_PUBLIC_ADSENSE_CLIENT: value })).toBe(
        null,
      )
    }
  })
})

describe('adsenseScriptUrl', () => {
  it('is the loader Google publishes, carrying the client', () => {
    expect(adsenseScriptUrl('ca-pub-1234567890123456')).toBe(
      'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1234567890123456',
    )
  })
})

// The tag names a publisher and `/ads.txt` declares which publisher may sell
// this inventory. If they drift, the tag is unauthorised by our own record —
// which is the state `ads.txt` exists to prevent, so it is worth failing a
// build over rather than discovering in a revenue report.
describe('the publisher id', () => {
  it('matches the record committed in /ads.txt', () => {
    const adsTxt = readFileSync(join(process.cwd(), 'ads.txt'), 'utf8')
    const publishers = adsTxt
      .split('\n')
      .map((line) => line.split('#')[0].trim())
      .filter(Boolean)
      .map((line) => line.split(',')[1]?.trim())

    expect(publishers).toContain(ADSENSE_CLIENT.replace(/^ca-/, ''))
  })
})
