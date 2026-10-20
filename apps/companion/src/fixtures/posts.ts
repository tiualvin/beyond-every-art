// The posts the app serves when no API is configured.
//
// Three are taken from the shapes `e2e/seed.ts` writes for the website's own
// browser tests — a gated legacy post, a duplicate-title post, and the
// legacy-HTML shape both of them use — and are what the API would answer for
// those rows, so the app is tested against the same cases the website is. The
// seeds hold no rich text, so the rich-text posts are hand-written against the
// contract. None of this is, or is copied from, production content.
//
// Bodies are as the server sends them: already through the title strip, the
// teaser cut and the link withholding. The app must not run any of those
// again, and these fixtures are how its tests notice if it starts to.

import type { Author, BodyNode, PostDetail, TagRef } from '../api/contract'
import {
  blockFixtures,
  fixtureMedia,
  imageFixture,
  linkParagraph,
  paragraph,
  text,
  unknownBlockFixture,
  unknownNodeFixture,
  darkCalloutFixture,
} from './blocks'

export const FIXTURE_AUTHOR: Author = {
  name: 'Fixture Editor',
  slug: 'fixture-editor',
  bio: 'Writes the sample articles the companion app shows when it is not connected to the website.',
  image: null,
}

export const FIXTURE_TAGS = {
  materials: { name: 'Materials', slug: 'materials' },
  reading: { name: 'Reading', slug: 'reading' },
  conservation: { name: 'Conservation', slug: 'conservation' },
} satisfies Record<string, TagRef>

/**
 * The seeded members-only post's two markers, verbatim from e2e/fixtures.ts,
 * so a test here asserts the same boundary the website's browser tests do.
 */
export const GATED_MARKERS = {
  teaser: 'E2E teaser paragraph any reader may see',
  gated: 'E2E gated paragraph no anonymous reader may see',
} as const

/** The body of the post that carries every module, as raw API JSON. */
function everyModuleBody(siteUrl: string): unknown[] {
  const blocks = blockFixtures(siteUrl)
  const nodes: unknown[] = [
    paragraph(
      text('Plain, '),
      text('bold', 1),
      text(', '),
      text('italic', 2),
      text(', '),
      text('both', 3),
      text(', '),
      text('underlined', 8),
      text(', '),
      text('struck through', 4),
      text(', '),
      text('code', 16),
      text(', H'),
      text('2', 32),
      text('O and x'),
      text('2', 64),
      text('.'),
      { type: 'linebreak' },
      text('A line break comes before this sentence.'),
    ),
    linkParagraph(siteUrl),
    {
      type: 'heading',
      tag: 'h2',
      children: [text('Fixture: every module the reader renders')],
    },
    paragraph(
      text(
        'The heading above repeats the title on purpose. The server strips a title heading only when it opens the body; this one does not, so the app renders it.',
      ),
    ),
    { type: 'heading', tag: 'h3', children: [text('Lists and quotations')] },
    {
      type: 'list',
      listType: 'bullet',
      start: 1,
      children: [
        { type: 'listitem', checked: null, children: [text('A bullet')] },
        {
          type: 'listitem',
          checked: null,
          children: [
            text('A bullet with a list under it'),
            {
              type: 'list',
              listType: 'number',
              start: 1,
              children: [
                { type: 'listitem', checked: null, children: [text('Nested')] },
              ],
            },
          ],
        },
      ],
    },
    {
      type: 'list',
      listType: 'number',
      start: 3,
      children: [
        { type: 'listitem', checked: null, children: [text('Third')] },
        { type: 'listitem', checked: null, children: [text('Fourth')] },
      ],
    },
    {
      type: 'list',
      listType: 'check',
      start: 1,
      children: [
        { type: 'listitem', checked: true, children: [text('Done')] },
        { type: 'listitem', checked: false, children: [text('Not yet')] },
      ],
    },
    {
      type: 'quote',
      children: [text('A block quotation from the editor’s own toolbar.')],
    },
    { type: 'horizontalrule' },
    imageFixture,
    ...Object.values(blocks),
    darkCalloutFixture,
    unknownBlockFixture,
    unknownNodeFixture,
    paragraph(text('The last paragraph, after every module.')),
  ]
  return nodes
}

const migratedHtml = (siteUrl: string): string =>
  [
    '<p>A body preserved from Ghost, rendered through the app’s allow-list rather than a browser. It has <strong>bold</strong>, <em>italic</em> and <a href="https://example.com/ghost-link">a link off the site</a>.</p>',
    '<h2 id="section">A section heading</h2>',
    '<p style="color: red; font-size: 40px">Inline styles are dropped; the words stay.</p>',
    '<figure class="kg-card kg-image-card kg-card-hascaption"><img src="https://media.fixtures.invalid/ghost-figure.jpg" class="kg-image" alt="Fixture image: a figure from Ghost" loading="lazy" width="1200" height="800"><figcaption>A Ghost image card, with its caption.</figcaption></figure>',
    '<ul><li>One</li><li>Two<ul><li>Two, nested</li></ul></li></ul>',
    '<ol start="4"><li>Four</li><li>Five</li></ol>',
    '<blockquote>A quotation in the migrated markup.</blockquote>',
    `<p>A link to <a href="/fixture-every-module/">the module showcase</a> opens in the app, as does <a href="${siteUrl}/fixture-every-module/">its full address</a>.</p>`,
    '<script>window.stolen = document.cookie</script>',
    '<iframe src="https://www.youtube.com/embed/fixture00001" title="A frame the app drops"></iframe>',
    '<form action="/subscribe"><input name="email" /><button>Subscribe</button></form>',
    '<style>p { display: none }</style>',
    '<hr>',
    '<pre><code>const preserved = true</code></pre>',
    '<p>Entities decode: Turner &amp; Constable, 10&nbsp;cm, &ldquo;quoted&rdquo;.</p>',
  ].join('\n')

/** Every fixture post, newest first, with hrefs on the configured site. */
export function fixturePosts(siteUrl: string): PostDetail[] {
  const href = (slug: string) => `${siteUrl}/${slug}/`
  const raw = (body: unknown) => body as PostDetail['body']

  return [
    {
      slug: 'fixture-every-module',
      title: 'Fixture: every module the reader renders',
      excerpt:
        'A sample article holding every block type, every link kind, an image, and two things the app has never heard of.',
      href: href('fixture-every-module'),
      publishedAt: '2025-03-04T09:00:00.000Z',
      updatedAt: '2025-03-04T09:00:00.000Z',
      featured: true,
      readingTime: 4,
      visibility: 'public',
      restricted: false,
      authors: [FIXTURE_AUTHOR],
      tags: [FIXTURE_TAGS.reading, FIXTURE_TAGS.materials],
      image: fixtureMedia('every-module-cover', {
        credit: 'Photo by A. Fixture / Unsplash',
        creditHref:
          'https://unsplash.com/@fixture?utm_source=beyond_every_art&utm_medium=referral',
      }),
      body: raw({ kind: 'lexical', nodes: everyModuleBody(siteUrl) }),
    },
    {
      slug: 'fixture-migrated-article',
      title: 'Fixture: a migrated Ghost article',
      excerpt:
        'Preserved Ghost markup, with the scripts, frames, forms and styles a native renderer has to leave behind.',
      href: href('fixture-migrated-article'),
      publishedAt: '2025-03-03T09:00:00.000Z',
      updatedAt: '2025-03-03T09:00:00.000Z',
      featured: false,
      readingTime: 2,
      visibility: 'public',
      restricted: false,
      authors: [FIXTURE_AUTHOR],
      tags: [FIXTURE_TAGS.materials],
      image: fixtureMedia('migrated-cover'),
      body: { kind: 'html', html: migratedHtml(siteUrl) },
    },
    {
      // A subscriber-only post written in the CMS: the teaser is the opening
      // paragraphs, cut on the server. The withheld paragraphs are not here.
      slug: 'fixture-subscriber-teaser',
      title: 'Fixture: a subscriber-only article',
      excerpt: 'Rich text, gated: the app receives the opening paragraphs.',
      href: href('fixture-subscriber-teaser'),
      publishedAt: '2025-02-20T09:00:00.000Z',
      updatedAt: '2025-02-20T09:00:00.000Z',
      featured: false,
      readingTime: 6,
      visibility: 'paid',
      restricted: true,
      authors: [FIXTURE_AUTHOR],
      tags: [FIXTURE_TAGS.reading],
      image: null,
      body: {
        kind: 'lexical',
        nodes: [
          paragraph(
            text('The opening paragraph of a subscriber-only article.'),
          ),
          paragraph(
            text('The second, which is where the server stopped sending.'),
          ),
        ] satisfies BodyNode[],
      },
    },
    {
      // e2e/seed.ts `duplicateTitlePost`. The seed stores
      // `<h1>{title}</h1><p>…</p>`; the server strips that leading heading, so
      // this is the body the API answers with.
      slug: 'e2e-duplicate-title-heading',
      title: 'E2E Duplicate Title Heading',
      excerpt: 'Synthetic post whose imported body repeats its own title.',
      href: href('e2e-duplicate-title-heading'),
      publishedAt: '2025-02-02T09:00:00.000Z',
      updatedAt: '2025-02-02T09:00:00.000Z',
      featured: false,
      readingTime: 1,
      visibility: 'public',
      restricted: false,
      authors: [],
      tags: [],
      image: null,
      body: {
        kind: 'html',
        html: '<p>The heading above came from Ghost and must not reach the page.</p>',
      },
    },
    {
      // e2e/seed.ts `privatePost`, members-only. The seeded body is a long
      // teaser paragraph and a second, gated one; the server's cut keeps the
      // first and drops the second before the response is written.
      slug: 'e2e-members-conservation-notes',
      title: 'E2E Members Conservation Notes',
      excerpt: 'Synthetic member content whose body is gated, not hidden.',
      href: href('e2e-members-conservation-notes'),
      publishedAt: '2025-02-01T09:00:00.000Z',
      updatedAt: '2025-02-01T09:00:00.000Z',
      featured: false,
      readingTime: 1,
      visibility: 'members',
      restricted: true,
      authors: [],
      tags: [FIXTURE_TAGS.conservation],
      image: null,
      body: {
        kind: 'html',
        html: `<p>${GATED_MARKERS.teaser}. Conservation notes open with a long passage about surface cleaning, consolidation, and the way a varnish yellows over the course of a century, written at length so that this opening paragraph on its own carries the teaser past the point where the rest of the body is withheld from a reader who is not yet a member, which is exactly the boundary that these browser tests exist to hold in place across the archive, the feed, the search results, and the post page itself.</p>`,
      },
    },
    {
      slug: 'fixture-empty-body',
      title: 'Fixture: an article with nothing in its body',
      excerpt: 'A body the server reduced to nothing worth rendering.',
      href: href('fixture-empty-body'),
      publishedAt: '2025-01-15T09:00:00.000Z',
      updatedAt: '2025-01-15T09:00:00.000Z',
      featured: false,
      readingTime: 1,
      visibility: 'public',
      restricted: false,
      authors: [FIXTURE_AUTHOR],
      tags: [],
      image: null,
      body: { kind: 'empty' },
    },
  ]
}
