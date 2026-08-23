import { describe, expect, it } from 'vitest'

import { GET } from '../../app/ads.txt/route'
import {
  ADS_TXT_CONTENT_TYPE,
  ADS_TXT_RECORDS,
  ADSENSE_PUBLISHER_ID,
  GOOGLE_TAG_ID,
  renderAdsTxt,
} from '../../lib/seo/ads-txt'

// A malformed `ads.txt` fails the way a missing one does — the crawler reads
// no authorized seller and AdSense stops serving — and it fails silently, on a
// site that renders perfectly. So the format is asserted here rather than
// eyeballed on the deployed domain.

describe('renderAdsTxt', () => {
  it('renders the AdSense record in the order the spec defines', () => {
    expect(renderAdsTxt()).toBe(
      `google.com, ${ADSENSE_PUBLISHER_ID}, DIRECT, ${GOOGLE_TAG_ID}\n`,
    )
  })

  it('names an AdSense publisher account, not a bare number', () => {
    expect(ADSENSE_PUBLISHER_ID).toMatch(/^pub-\d{16}$/)
  })

  it('terminates every line and leaves none blank', () => {
    const rendered = renderAdsTxt()
    expect(rendered.endsWith('\n')).toBe(true)
    expect(rendered.split('\n').slice(0, -1)).toHaveLength(
      ADS_TXT_RECORDS.length,
    )
    expect(rendered).not.toMatch(/\n\n/)
  })

  it('omits the certification authority field rather than leaving it empty', () => {
    // A trailing `, ` with nothing after it is a parse error for some crawlers,
    // not an empty fourth field.
    expect(
      renderAdsTxt([
        {
          adSystemDomain: 'example-exchange.com',
          publisherId: '12345',
          relationship: 'RESELLER',
        },
      ]),
    ).toBe('example-exchange.com, 12345, RESELLER\n')
  })
})

describe('GET /ads.txt', () => {
  it('serves the record as plain text', async () => {
    const response = GET()

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe(ADS_TXT_CONTENT_TYPE)
    await expect(response.text()).resolves.toBe(renderAdsTxt())
  })

  it('is cacheable, but not for longer than a correction can wait', async () => {
    const maxAge = GET()
      .headers.get('cache-control')
      ?.match(/max-age=(\d+)/)?.[1]

    expect(Number(maxAge)).toBeLessThanOrEqual(3600)
  })
})
