// Rich-text bodies as the API sends them: hand-written, one per block type.
//
// Written against the contract rather than captured from a server, because
// there is no server yet and never will be production data here. Each value
// is what `PostDetail.body.nodes` would hold — already projected, so the
// populated documents Payload reads at depth are not in it.
//
// Copy is about the app itself rather than about art: a fixture states nothing
// a reader could mistake for the publication's own reporting.

import type { BlockSlug } from '../generated/block-slugs'
import type {
  BlockFields,
  BodyNode,
  InlineNode,
  Media,
  ParagraphNode,
} from '../api/contract'

const IMAGE_ORIGIN = 'https://media.fixtures.invalid'

/**
 * An image that never loads: `.invalid` cannot resolve, so fixture mode makes
 * no request to anybody's server and shows the plate a missing image gets.
 */
export function fixtureMedia(
  name: string,
  overrides: Partial<Media> = {},
): Media {
  return {
    url: `${IMAGE_ORIGIN}/${name}.jpg`,
    alt: `Fixture image: ${name.replace(/-/g, ' ')}`,
    width: 1600,
    height: 1067,
    cardUrl: `${IMAGE_ORIGIN}/${name}-768x512.jpg`,
    ogUrl: `${IMAGE_ORIGIN}/${name}-1200x630.jpg`,
    credit: null,
    creditHref: null,
    ...overrides,
  }
}

export const text = (value: string, format = 0): InlineNode => ({
  type: 'text',
  text: value,
  format,
})

export const paragraph = (...children: InlineNode[]): ParagraphNode => ({
  type: 'paragraph',
  children,
})

const block = (fields: BlockFields): BodyNode => ({ type: 'block', fields })

/** Every block type, keyed by its slug, as one body node each. */
export function blockFixtures(siteUrl: string): Record<BlockSlug, BodyNode> {
  return {
    accordion: block({
      blockType: 'accordion',
      heading: 'Panels',
      items: [
        {
          title: 'Open from the start',
          defaultOpen: true,
          content: [paragraph(text('This panel is expanded when it loads.'))],
        },
        {
          title: 'Closed until tapped',
          defaultOpen: false,
          content: [
            paragraph(
              text('Its body is rich text, '),
              text('formatting included', 2),
              text('.'),
            ),
          ],
        },
      ],
    }),
    pullQuote: block({
      blockType: 'pullQuote',
      quote: 'A quotation, set apart from the body around it.',
      attribution: 'The fixture',
      sourceHref: 'https://example.com/source',
      variant: 'large',
    }),
    signup: block({
      blockType: 'signup',
      heading: 'The next article, by email',
      body: 'The app links to the website’s signup page rather than collecting an address itself.',
      href: `${siteUrl}/newsletter/`,
    }),
    callout: block({
      blockType: 'callout',
      emoji: '🎨',
      tone: 'accent',
      content: [
        paragraph(
          text('An aside, set apart from the argument it sits beside.'),
        ),
      ],
    }),
    button: block({
      blockType: 'button',
      label: 'Browse the journal',
      href: `${siteUrl}/journal/`,
      variant: 'primary',
      align: 'center',
    }),
    gallery: block({
      blockType: 'gallery',
      layout: 'grid',
      caption: 'Two images shown together.',
      items: [
        { media: fixtureMedia('gallery-first'), caption: 'The first image' },
        { media: fixtureMedia('gallery-second'), caption: null },
      ],
    }),
    bookmark: block({
      blockType: 'bookmark',
      href: 'https://example.com/an-essay',
      title: 'An essay somewhere else',
      description: 'A rich link to a page off the site, opened in the browser.',
      publisher: 'Example Review',
      image: fixtureMedia('bookmark-thumbnail'),
    }),
    embed: block({
      blockType: 'embed',
      href: 'https://www.youtube.com/watch?v=fixture00001',
      title: 'A video the app links to rather than frames',
      provider: 'youtube',
    }),
    paywall: block({ blockType: 'paywall' }),
    keyTakeaways: block({
      blockType: 'keyTakeaways',
      heading: 'Key takeaways',
      items: [
        'Every module in this article is drawn natively.',
        'A link to another article opens inside the app.',
        'Anything the app does not recognise is left out quietly.',
      ],
    }),
    faq: block({
      blockType: 'faq',
      heading: 'Frequently asked questions',
      items: [
        {
          question: 'Does the reader use a web view?',
          answer: [paragraph(text('No. Each node is a native view.'))],
        },
        {
          question: 'What happens to a module it does not know?',
          answer: [
            paragraph(
              text('It renders nothing, and says so once in development.'),
            ),
          ],
        },
      ],
    }),
    featureList: block({
      blockType: 'featureList',
      heading: 'Three steps',
      intro: 'Steps are always numbered.',
      variant: 'steps',
      numbered: true,
      items: [
        { title: 'Open an article', body: 'From any list.', image: null },
        {
          title: 'Save it',
          body: 'It is kept on the device.',
          image: fixtureMedia('feature-save'),
        },
        { title: 'Read it offline', body: null, image: null },
      ],
    }),
    mediaText: block({
      blockType: 'mediaText',
      media: fixtureMedia('media-text'),
      heading: 'An image beside a passage',
      body: [
        paragraph(
          text('On a phone the image comes first and the text follows.'),
        ),
      ],
      imageSide: 'right',
    }),
    comparisonTable: block({
      blockType: 'comparisonTable',
      caption: 'Two columns compared across three rows.',
      rowHeader: 'Row',
      columns: ['First', 'Second'],
      rows: [
        {
          label: [text('Alpha')],
          cells: [[text('one')], [text('two', 2)]],
        },
        {
          label: [text('Beta', 1)],
          cells: [
            [
              {
                type: 'link',
                href: 'https://example.com/table-source',
                children: [text('a source')],
              },
            ],
            [text('code', 16)],
          ],
        },
        // Fewer cells than columns: padded with blanks, as the website does.
        { label: [text('Gamma')], cells: [[text('only one')]] },
      ],
    }),
    keyFacts: block({
      blockType: 'keyFacts',
      heading: 'At a glance',
      items: [
        { label: 'Modules', value: 'Fifteen' },
        { label: 'Web views', value: 'None' },
      ],
    }),
  }
}

/** Links of every kind the body can hold, in one paragraph. */
export function linkParagraph(siteUrl: string): ParagraphNode {
  return paragraph(
    text('Links: '),
    {
      type: 'internalLink',
      slug: 'fixture-migrated-article',
      href: `${siteUrl}/fixture-migrated-article/`,
      children: [text('another article, opened in the app')],
    },
    text(', '),
    {
      type: 'internalLink',
      slug: 'about',
      href: `${siteUrl}/about/`,
      children: [text('a page that is not an article')],
    },
    text(', '),
    {
      type: 'link',
      href: 'https://example.com/elsewhere',
      children: [text('a page off the site')],
    },
    text(' and '),
    {
      type: 'link',
      href: 'mailto:editor@example.com',
      children: [text('an email address')],
    },
    text('.'),
  )
}

/** An upload in the body, credited with a link the server built. */
export const imageFixture: BodyNode = {
  type: 'upload',
  media: fixtureMedia('body-upload', {
    credit: 'Photo by A. Fixture / Unsplash',
    creditHref:
      'https://unsplash.com/@fixture?utm_source=beyond_every_art&utm_medium=referral',
  }),
}

/**
 * The callout's dark tone, which `blockFixtures` (one fixture per block type)
 * does not carry: the dark palette once inverted it into a near-white slab,
 * and nothing drew one to notice.
 */
export const darkCalloutFixture: BodyNode = block({
  blockType: 'callout',
  emoji: null,
  tone: 'dark',
  content: [
    paragraph(text('A dark callout, which stays dark in either appearance.')),
  ],
})

/**
 * A block type the app has never heard of. Raw, as a newer server might send
 * it: it is not a valid `BodyNode` until `markUnsupported` has seen it.
 */
export const unknownBlockFixture: unknown = {
  type: 'block',
  fields: { blockType: 'carousel', slides: [{ title: 'A slide' }] },
}

/** A node type the app has never heard of. Raw, like the block above. */
export const unknownNodeFixture: unknown = {
  type: 'table',
  children: [{ type: 'tablerow', children: [] }],
}
