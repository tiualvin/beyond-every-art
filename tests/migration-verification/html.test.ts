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

  it('preserves invalid numeric entities without failing extraction', () => {
    const evidence = extractHtmlEvidence(
      `<h1>Valid &#x1f600; invalid &#x110000; &#9999999; &#xD800; &#0; &#xnope;</h1>
       <img src="/work.jpg" alt="Valid &#128512; invalid &#1114112;">`,
      new URL('https://example.com/article/'),
      'https://example.com',
      10,
    )

    expect(evidence.h1).toEqual([
      'Valid 😀 invalid &#x110000; &#9999999; &#xD800; &#0; &#xnope;',
    ])
    expect(evidence.images).toEqual([
      {
        src: 'https://example.com/work.jpg',
        internal: true,
        alt: 'Valid 😀 invalid &#1114112;',
      },
    ])
  })

  it('ignores evidence in non-rendered bodies while retaining JSON-LD', () => {
    const evidence = extractHtmlEvidence(
      `<script type="application/ld+json">
         {"@type":"Article","example":"<h1>Script heading</h1><a href='/script'>link</a><img src='/script.jpg'>"}
       </script>
       <script><a href="/inline-script">script link</a></script>
       <style><h1>Style heading</h1><img src="/style.jpg"></style>
       <noscript><a href="/noscript">noscript link</a></noscript>
       <template><h1>Template heading</h1><img src="/template.jpg"></template>
       <h1>Visible heading</h1>
       <a href="/visible">Visible link</a>
       <img src="/visible.jpg" alt="Visible image">`,
      new URL('https://example.com/article/'),
      'https://example.com',
      10,
    )

    expect(evidence.jsonLdTypes).toEqual(['Article'])
    expect(evidence.h1).toEqual(['Visible heading'])
    expect(evidence.links).toEqual([
      {
        href: 'https://example.com/visible',
        internal: true,
        path: '/visible',
        rel: [],
      },
    ])
    expect(evidence.images).toEqual([
      {
        src: 'https://example.com/visible.jpg',
        internal: true,
        alt: 'Visible image',
      },
    ])
  })
})
