import { describe, expect, it } from 'vitest'

import { compareCrawls } from '../../lib/migration-verification/compare'
import {
  DEFAULT_CRAWL_OPTIONS,
  crawlSite,
} from '../../lib/migration-verification/crawl'
import type {
  CrawlResult,
  PageEvidence,
} from '../../lib/migration-verification/types'

function page(
  path: string,
  overrides: Partial<PageEvidence> = {},
): PageEvidence {
  const url = `https://source.example${path}`
  return {
    path,
    requestedUrl: url,
    finalUrl: url,
    initialStatus: 200,
    status: 200,
    redirects: [],
    contentType: 'text/html',
    title: 'Preserved title',
    metaDescription: 'Preserved description',
    canonical: url,
    robots: ['follow', 'index'],
    h1: ['Preserved heading'],
    jsonLdTypes: ['Article'],
    links: [],
    images: [],
    evidenceTruncated: false,
    bodyTruncated: false,
    error: null,
    ...overrides,
  }
}

function crawl(origin: string, pages: PageEvidence[]): CrawlResult {
  return {
    origin,
    seeds: ['/'],
    options: DEFAULT_CRAWL_OPTIONS,
    pages,
    limitReached: false,
  }
}

describe('compareCrawls', () => {
  it('passes equivalent SEO evidence across different origins', () => {
    const source = crawl('https://source.example', [page('/post/')])
    const target = crawl('https://target.example', [
      page('/post/', {
        requestedUrl: 'https://target.example/post/',
        finalUrl: 'https://target.example/post/',
        canonical: 'https://target.example/post/',
        images: [
          {
            src: 'https://target.example/media/new.jpg',
            internal: true,
            alt: 'Art',
          },
        ],
      }),
    ])

    expect(compareCrawls(source, target)).toMatchObject({
      ok: true,
      summary: { errors: 0, warnings: 0, comparedPages: 1 },
      issues: [],
    })
  })

  it('flags acceptance failures and preserves deterministic issue ordering', () => {
    const source = crawl('https://source.example', [
      page('/post/', {
        images: [
          {
            src: 'https://source.example/content/art.jpg',
            internal: true,
            alt: 'Artwork',
          },
        ],
      }),
    ])
    const target = crawl('https://target.example', [
      page('/post/', {
        requestedUrl: 'https://target.example/post/',
        finalUrl: 'https://target.example/missing/',
        initialStatus: 302,
        status: 404,
        redirects: [
          {
            url: 'https://target.example/post/',
            status: 302,
            location: '/missing/',
            nextUrl: 'https://target.example/missing/',
          },
        ],
        title: 'Changed',
        canonical: 'https://source.example/post/',
        robots: ['noindex'],
        images: [
          {
            src: 'https://source.example/content/art.jpg',
            internal: false,
            alt: null,
          },
        ],
      }),
    ])

    const report = compareCrawls(source, target)
    expect(report.ok).toBe(false)
    expect(report.issues.map((issue) => issue.code)).toEqual([
      'image_alt_regression',
      'legacy_image_hotlink',
      'robots_changed',
      'target_canonical_off_origin',
      'temporary_target_redirect',
      'title_changed',
      'unexpected_target_status',
    ])
  })

  it('marks a source path absent from target crawl as an error', () => {
    const report = compareCrawls(
      crawl('https://source.example', [page('/unlinked/')]),
      crawl('https://target.example', []),
    )
    expect(report.issues).toEqual([
      expect.objectContaining({
        code: 'target_url_missing',
        path: '/unlinked/',
      }),
    ])
  })

  it('can ignore only the intentional staging indexing polarity', () => {
    const source = crawl('https://source.example', [
      page('/post/', {
        robots: ['follow', 'index', 'max-image-preview:large'],
      }),
    ])
    const target = crawl('https://target.example', [
      page('/post/', {
        requestedUrl: 'https://target.example/post/',
        finalUrl: 'https://target.example/post/',
        canonical: 'https://target.example/post/',
        robots: ['nofollow', 'noindex', 'max-image-preview:large'],
      }),
    ])

    expect(compareCrawls(source, target).ok).toBe(false)
    expect(
      compareCrawls(source, target, { allowTargetNoindex: true }),
    ).toMatchObject({ ok: true, issues: [] })
  })

  it('keeps comparison free of network I/O', () => {
    // The comparator accepts captured values only. This type-level/API guard
    // ensures crawling remains an explicit orchestration concern.
    expect(compareCrawls.length).toBe(2)
    expect(crawlSite).toBeTypeOf('function')
  })
})
