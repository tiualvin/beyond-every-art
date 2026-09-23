import type { CrawlResult } from './types'

/**
 * A source crawl that already ran, read back so it can be compared again.
 *
 * This exists because the source stopped being crawlable. After cutover the
 * domain answers from this site, and Ghost's own hostname answers every public
 * path with a 302 back to the domain — so a crawl of it records one
 * out-of-scope redirect per seed and discovers nothing. The last time the old
 * site could be crawled is the last time it can be compared against, and the
 * rehearsal report kept its whole crawl under `.source`.
 *
 * Accepts either a comparison report (the crawl is its `source`) or a bare
 * `CrawlResult`. Refuses anything that would make a replay quietly weaker than
 * the crawl it stands in for: no pages, an origin that is not an origin, or a
 * crawl that stopped at its page cap — the comparator treats that as an error
 * when it happens live, and a replay must not launder it into evidence.
 */
export function parseStoredCrawl(value: unknown): CrawlResult {
  if (!isRecord(value)) {
    throw new Error('Stored crawl must be a JSON object')
  }
  const candidate = isRecord(value.source) ? value.source : value

  const origin = candidate.origin
  if (typeof origin !== 'string' || !isBareOrigin(origin)) {
    throw new Error('Stored crawl has no valid origin')
  }
  const pages = candidate.pages
  if (!Array.isArray(pages) || pages.length === 0) {
    throw new Error('Stored crawl has no pages')
  }
  for (const page of pages) {
    if (
      !isRecord(page) ||
      typeof page.path !== 'string' ||
      !Array.isArray(page.images) ||
      !Array.isArray(page.links) ||
      !Array.isArray(page.redirects)
    ) {
      throw new Error('Stored crawl has a page without path, links or images')
    }
  }
  const options = candidate.options
  if (
    !isRecord(options) ||
    !Number.isSafeInteger(options.maxPages) ||
    (options.maxPages as number) < 1
  ) {
    throw new Error('Stored crawl does not record its page cap')
  }
  if (candidate.limitReached !== false) {
    throw new Error(
      'Stored crawl hit its page cap, so it is incomplete; replaying it would sign off a partial comparison',
    )
  }

  return candidate as unknown as CrawlResult
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isBareOrigin(value: string): boolean {
  try {
    const url = new URL(value)
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.origin === value
    )
  } catch {
    return false
  }
}
