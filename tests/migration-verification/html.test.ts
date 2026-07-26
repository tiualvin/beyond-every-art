import { describe, expect, it } from 'vitest'

import { extractHtmlEvidence } from '../../lib/migration-verification/html'

describe('extractHtmlEvidence', () => {
  it('extracts normalized SEO, link, image, heading, and JSON-LD evidence', () => {
    const evidence = extractHtmlEvidence(
      `<!doctype html>
      <html><head>
        <title>  An &amp; Excellent   Title </title>
        <meta name="description" content="An &quot;exact&quot; description">
        <meta name="robots" content="index, follow">
        <link href="/article/" rel="alternate canonical">
        <script type="application/ld+json">
          {"@graph":[{"@type":"Article"},{"@type":["Thing","CreativeWork"]}]}
        </script>
      </head><body>
        <h1> A <em>useful</em> heading </h1>
        <a href="/next/?tracking=1#fragment" rel="next nofollow">Next</a>
        <a href="mailto:test@example.com">Email</a>
        <img src="images/work.jpg" alt="A work of art">
      </body></html>`,
      new URL('https://old.example/article/'),
      'https://old.example',
      10,
    )

    expect(evidence).toEqual({
      title: 'An & Excellent Title',
      metaDescription: 'An "exact" description',
      canonical: 'https://old.example/article/',
      robots: ['follow', 'index'],
      h1: ['A useful heading'],
      jsonLdTypes: ['Article', 'CreativeWork', 'Thing'],
      links: [
        {
          href: 'https://old.example/next/?tracking=1',
          internal: true,
          path: '/next/',
          rel: ['next', 'nofollow'],
        },
      ],
      images: [
        {
          src: 'https://old.example/article/images/work.jpg',
          internal: true,
          alt: 'A work of art',
        },
      ],
      evidenceTruncated: false,
    })
  })

  it('caps retained evidence and marks truncation', () => {
    const evidence = extractHtmlEvidence(
      '<a href="/a">a</a><a href="/b">b</a><img src="/one.jpg">',
      new URL('https://example.com/'),
      'https://example.com',
      1,
    )
    expect(evidence.links).toHaveLength(1)
    expect(evidence.images).toHaveLength(1)
    expect(evidence.evidenceTruncated).toBe(true)
  })
})
