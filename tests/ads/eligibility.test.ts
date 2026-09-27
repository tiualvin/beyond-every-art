import { describe, expect, it } from 'vitest'

import { ADSENSE_CLIENT } from '@/lib/ads/adsense'
import { adClientFor } from '@/lib/ads/eligibility'

/** The public origin a real deployment reports; the tag is gated on it. */
const SITE = 'https://www.beyondeveryart.com'

describe('adClientFor', () => {
  it('returns the publisher on an ordinary post', () => {
    expect(adClientFor({}, {}, SITE)).toBe(ADSENSE_CLIENT)
    expect(adClientFor({ restricted: false }, {}, SITE)).toBe(ADSENSE_CLIENT)
  })

  // The origin half of "the deployment serves ads at all", carried through
  // from `resolveAdsenseClient`: a laptop on localhost must render no unit.
  it('carries no unit on a non-public origin', () => {
    expect(adClientFor({}, {}, 'http://127.0.0.1:3000')).toBeNull()
  })

  // docs/ADVERTISING.md §4. A truncated article with ads on it is thin content
  // in the sense AdSense's policies care about, and it is the worst possible
  // reader experience at the exact moment the page is asking for a
  // subscription.
  it('carries no unit on a restricted teaser', () => {
    expect(adClientFor({ restricted: true }, {}, SITE)).toBeNull()
  })

  // Every condition, not just the nearest one: a teaser on a staging
  // deployment must fail both ways round, or the predicate is only testing
  // whichever check happens to come first.
  it('still returns nothing when the deployment serves no ads at all', () => {
    expect(adClientFor({}, { NEXT_PUBLIC_NOINDEX: '1' }, SITE)).toBeNull()
    expect(
      adClientFor({ restricted: true }, { NEXT_PUBLIC_NOINDEX: '1' }, SITE),
    ).toBeNull()
    expect(
      adClientFor(
        { restricted: true },
        { NEXT_PUBLIC_ADSENSE_CLIENT: 'off' },
        SITE,
      ),
    ).toBeNull()
  })

  // The call site takes both answers from one call, so there is no way to
  // render a unit having checked only half of them.
  it('answers "may I" and "for whom" together', () => {
    expect(
      adClientFor(
        {},
        { NEXT_PUBLIC_ADSENSE_CLIENT: 'ca-pub-1234567890123456' },
        SITE,
      ),
    ).toBe('ca-pub-1234567890123456')
  })
})
