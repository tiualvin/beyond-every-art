import { describe, expect, it } from 'vitest'

import { compareCrawls } from '../../lib/migration-verification/compare'
import { DEFAULT_CRAWL_OPTIONS } from '../../lib/migration-verification/crawl'
import { parseStoredCrawl } from '../../lib/migration-verification/replay'
import type {
  CrawlResult,
  PageEvidence,
} from '../../lib/migration-verification/types'

const GHOST = 'https://www.example.com'

function page(path: string, title: string): PageEvidence {
  const url = `${GHOST}${path}`
  return {
    path,
    requestedUrl: url,
    finalUrl: url,
    initialStatus: 200,
    status: 200,
    redirects: [],
    contentType: 'text/html',
    title,
    metaDescription: null,
    canonical: url,
    robots: [],
    h1: [],
    jsonLdTypes: [],
    links: [],
    images: [],
    evidenceTruncated: false,
    bodyTruncated: false,
    error: null,
  }
}

function crawl(pages: PageEvidence[]): CrawlResult {
  return {
    origin: GHOST,
    seeds: ['/'],
    options: DEFAULT_CRAWL_OPTIONS,
    pages,
    limitReached: false,
  }
}

/** What `pnpm migration:compare --json` wrote, read back. */
function storedReport(source: CrawlResult): unknown {
  return JSON.parse(
    JSON.stringify(compareCrawls(source, crawl([page('/', 'Home')]))),
  )
}

describe('parseStoredCrawl', () => {
  it('takes the source half of an earlier comparison report', () => {
    const source = crawl([page('/', 'Home'), page('/about/', 'About')])

    expect(parseStoredCrawl(storedReport(source))).toEqual(source)
  })

  it('accepts a bare crawl result too', () => {
    const source = crawl([page('/', 'Home')])

    expect(parseStoredCrawl(JSON.parse(JSON.stringify(source)))).toEqual(source)
  })

  it('compares exactly as the live crawl it stands in for', () => {
    const ghost = crawl([page('/', 'Home'), page('/about/', 'About')])
    const production = crawl([page('/', 'Home'), page('/about/', 'Changed')])

    expect(
      compareCrawls(parseStoredCrawl(storedReport(ghost)), production).issues,
    ).toEqual(compareCrawls(ghost, production).issues)
  })

  it('refuses a crawl that stopped at its page cap', () => {
    // Live, that is `source_page_limit_reached`, an error. Replayed, it would be
    // a partial crawl presented as the whole old site.
    const partial = { ...crawl([page('/', 'Home')]), limitReached: true }

    expect(() => parseStoredCrawl(partial)).toThrow('incomplete')
  })

  it('refuses a crawl with nothing in it', () => {
    expect(() => parseStoredCrawl(crawl([]))).toThrow('no pages')
  })

  it('refuses an origin that carries a path', () => {
    expect(() =>
      parseStoredCrawl({ ...crawl([page('/', 'Home')]), origin: `${GHOST}/x` }),
    ).toThrow('no valid origin')
  })

  it('refuses something that is not a crawl at all', () => {
    expect(() => parseStoredCrawl([])).toThrow('JSON object')
    expect(() => parseStoredCrawl({ pages: [{ path: '/' }] })).toThrow()
  })
})
