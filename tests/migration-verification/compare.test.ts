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
        robots: ['disallow:', 'follow', 'index', 'max-image-preview:large'],
      }),
    ])
    const target = crawl('https://target.example', [
      page('/post/', {
        requestedUrl: 'https://target.example/post/',
        finalUrl: 'https://target.example/post/',
        canonical: 'https://target.example/post/',
        robots: [
          'disallow:/',
          'nofollow',
          'noindex',
          'max-image-preview:large',
        ],
      }),
    ])

    expect(compareCrawls(source, target).ok).toBe(false)
    expect(
      compareCrawls(source, target, { allowTargetNoindex: true }),
    ).toMatchObject({ ok: true, issues: [] })
  })

  it('normalizes same-origin Sitemap directives without hiding path changes', () => {
    const source = crawl('https://source.example', [
      page('/robots.txt', {
        robots: ['sitemap:https://source.example/sitemap.xml'],
      }),
    ])
    const target = crawl('https://target.example', [
      page('/robots.txt', {
        requestedUrl: 'https://target.example/robots.txt',
        finalUrl: 'https://target.example/robots.txt',
        canonical: 'https://target.example/robots.txt',
        robots: ['sitemap:https://target.example/sitemap.xml'],
      }),
    ])

    expect(compareCrawls(source, target)).toMatchObject({
      ok: true,
      issues: [],
    })

    target.pages[0].robots = [
      'sitemap:https://target.example/different-sitemap.xml',
    ]
    expect(compareCrawls(source, target).issues).toEqual([
      expect.objectContaining({ code: 'robots_changed' }),
    ])
  })

  it('still compares non-root robots rules when staging noindex is allowed', () => {
    const source = crawl('https://source.example', [
      page('/robots.txt', { robots: ['disallow:', 'user-agent:*'] }),
    ])
    const target = crawl('https://target.example', [
      page('/robots.txt', {
        requestedUrl: 'https://target.example/robots.txt',
        finalUrl: 'https://target.example/robots.txt',
        canonical: 'https://target.example/robots.txt',
        robots: ['disallow:/', 'disallow:/private/', 'user-agent:*'],
      }),
    ])

    expect(
      compareCrawls(source, target, { allowTargetNoindex: true }).issues,
    ).toEqual([expect.objectContaining({ code: 'robots_changed' })])
  })

  it('flags only temporary redirects newly introduced by the target', () => {
    const sourceRedirect = {
      url: 'https://source.example/old/',
      status: 302,
      location: '/post/',
      nextUrl: 'https://source.example/post/',
    }
    const targetRedirect = {
      ...sourceRedirect,
      url: 'https://target.example/old/',
      nextUrl: 'https://target.example/post/',
    }
    const source = crawl('https://source.example', [
      page('/old/', { initialStatus: 302, redirects: [sourceRedirect] }),
    ])
    const target = crawl('https://target.example', [
      page('/old/', {
        requestedUrl: 'https://target.example/old/',
        finalUrl: 'https://target.example/post/',
        initialStatus: 302,
        canonical: 'https://target.example/old/',
        redirects: [targetRedirect],
      }),
    ])

    expect(compareCrawls(source, target).issues).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'temporary_target_redirect' }),
      ]),
    )

    target.pages[0].redirects.push({
      url: 'https://target.example/post/',
      status: 307,
      location: '/new/',
      nextUrl: 'https://target.example/new/',
    })
    expect(compareCrawls(source, target).issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'temporary_target_redirect' }),
      ]),
    )
  })

  it('accepts decorative alt text but catches a missing alt attribute', () => {
    const source = crawl('https://source.example', [
      page('/post/', {
        images: [
          {
            src: 'https://source.example/decorative.jpg',
            internal: true,
            alt: '',
          },
        ],
      }),
    ])
    const target = crawl('https://target.example', [
      page('/post/', {
        requestedUrl: 'https://target.example/post/',
        finalUrl: 'https://target.example/post/',
        canonical: 'https://target.example/post/',
        images: [
          {
            src: 'https://target.example/decorative.jpg',
            internal: true,
            alt: '',
          },
        ],
      }),
    ])

    expect(compareCrawls(source, target)).toMatchObject({
      ok: true,
      issues: [],
    })
    target.pages[0].images[0].alt = null
    expect(compareCrawls(source, target).issues).toEqual([
      expect.objectContaining({ code: 'image_alt_regression' }),
    ])
  })

  it('keeps comparison free of network I/O', () => {
    // The comparator accepts captured values only. This type-level/API guard
    // ensures crawling remains an explicit orchestration concern.
    expect(compareCrawls.length).toBe(2)
    expect(crawlSite).toBeTypeOf('function')
  })
})

describe('content images beneath the chrome', () => {
  const WORDMARK = 'https://target.example/_next/image?url=%2Flogo.png'
  const paths = ['/', '/a/', '/b/', '/c/', '/about/', '/d/']

  function sourceSite(aboutImages: number): CrawlResult {
    return crawl(
      'https://source.example',
      paths.map((path) =>
        page(path, {
          images: Array.from(
            { length: path === '/about/' ? aboutImages : 2 },
            (_, index) => ({
              src: `https://source.example/content/images/${path}${index}.jpg`,
              internal: true,
              alt: 'A picture',
            }),
          ),
        }),
      ),
    )
  }

  function targetSite(aboutContentImages: number): CrawlResult {
    return crawl(
      'https://target.example',
      paths.map((path) => {
        const url = `https://target.example${path}`
        const content = path === '/about/' ? aboutContentImages : 2
        return page(path, {
          requestedUrl: url,
          finalUrl: url,
          canonical: url,
          images: [
            // #159 put this on every page, which is what broke `images_lost`.
            { src: WORDMARK, internal: true, alt: 'Beyond Every Art' },
            ...Array.from({ length: content }, (_, index) => ({
              src: `https://target.example/media/${path}${index}.jpg`,
              internal: true,
              alt: 'A picture',
            })),
          ],
        })
      }),
    )
  }

  it('sees a page stripped of its content images behind a sitewide wordmark', () => {
    const report = compareCrawls(sourceSite(3), targetSite(0))

    // The masthead image means the target page is never empty, so the
    // all-or-nothing check stays silent — the exact blind spot found on 18 Sep.
    expect(report.issues.map((issue) => issue.code)).not.toContain(
      'images_lost',
    )
    expect(report.issues).toContainEqual(
      expect.objectContaining({
        code: 'images_reduced',
        path: '/about/',
        expected: 3,
        actual: 0,
      }),
    )
  })

  it('reports a partial loss the zero-check cannot express', () => {
    const report = compareCrawls(sourceSite(10), targetSite(1))

    expect(report.issues).toContainEqual(
      expect.objectContaining({
        code: 'images_reduced',
        path: '/about/',
        expected: 10,
        actual: 1,
      }),
    )
  })

  it('does not fail the gate on its own', () => {
    // A warning: the two sides are different themes, and a comparison that
    // blocked a cutover over one image would be turned off rather than read.
    const report = compareCrawls(sourceSite(3), targetSite(0))

    expect(report.ok).toBe(true)
    expect(
      report.issues.find((issue) => issue.code === 'images_reduced')?.severity,
    ).toBe('warning')
  })

  it('stays quiet when only the chrome differs', () => {
    const report = compareCrawls(sourceSite(2), targetSite(2))

    expect(report.issues.map((issue) => issue.code)).not.toContain(
      'images_reduced',
    )
  })

  it('subtracts nothing from a crawl too small to show what is sitewide', () => {
    // Two pages cannot distinguish a template from a coincidence, so the
    // wordmark counts as content and the target is ahead rather than behind.
    const small = (site: CrawlResult): CrawlResult => ({
      ...site,
      pages: site.pages.slice(0, 2),
    })
    const report = compareCrawls(small(sourceSite(2)), small(targetSite(2)))

    expect(report.issues.map((issue) => issue.code)).not.toContain(
      'images_reduced',
    )
  })
})

describe('after cutover, when both sides share an origin', () => {
  const ORIGIN = 'https://www.example.com'

  function shared(overrides: Partial<PageEvidence>): CrawlResult {
    return crawl(ORIGIN, [
      page('/post/', {
        requestedUrl: `${ORIGIN}/post/`,
        finalUrl: `${ORIGIN}/post/`,
        canonical: `${ORIGIN}/post/`,
        ...overrides,
      }),
    ])
  }

  it('does not read every link and image on the site as legacy', () => {
    const target = shared({
      links: [
        {
          href: `${ORIGIN}/about/`,
          internal: true,
          path: '/about/',
          rel: [],
        },
      ],
      images: [
        {
          src: `${ORIGIN}/_next/image/?url=%2Fapi%2Fmedia%2Ffile%2Fa.jpg&w=3840&q=75`,
          internal: true,
          alt: '',
        },
      ],
    })

    const codes = compareCrawls(shared({}), target).issues.map(
      (issue) => issue.code,
    )
    expect(codes).not.toContain('legacy_image_hotlink')
    expect(codes).not.toContain('legacy_origin_link')
  })

  it("still catches an image requested from Ghost's media path", () => {
    const direct = `${ORIGIN}/content/images/2026/02/a.jpg`
    const optimised = `${ORIGIN}/_next/image/?url=%2Fcontent%2Fimages%2F2026%2F02%2Fb.jpg&w=3840&q=75`
    const target = shared({
      images: [
        { src: direct, internal: true, alt: '' },
        { src: optimised, internal: true, alt: '' },
      ],
    })

    expect(compareCrawls(shared({}), target).issues).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        code: 'legacy_image_hotlink',
        path: '/post/',
        actual: [optimised, direct].sort(),
      }),
    )
  })

  it('records a replayed source in the report', () => {
    const report = compareCrawls(shared({}), shared({}), {
      sourceReplayedFrom: 'rehearsal/site-comparison.json',
    })

    expect(report.sourceReplayedFrom).toBe('rehearsal/site-comparison.json')
    expect(compareCrawls(shared({}), shared({}))).not.toHaveProperty(
      'sourceReplayedFrom',
    )
  })
})
