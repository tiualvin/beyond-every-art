import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  convertLegacyHtml,
  escapeInlineMarkdown,
  FORMAT,
  imageSources,
  type LexicalNode,
  type MediaLookup,
} from '../../lib/migration/legacy-to-lexical'

// The fixtures are cut byte for byte from migrated articles' stored HTML
// (read through readLegacyHtml on 24 Oct 2026), except `ghost-cards.html`:
// no migrated article carries a Ghost card in its body, so that one is
// Ghost's documented card markup.
const fixture = (name: string) =>
  readFileSync(
    join(process.cwd(), 'tests/fixtures/legacy-convert', `${name}.html`),
    'utf8',
  )

const ids = () => {
  let n = 0
  return () => `id${(n += 1)}`
}

const convert = (html: string, media?: Map<string, MediaLookup>) =>
  convertLegacyHtml(html, { newId: ids(), media })

const types = (nodes: LexicalNode[]) => nodes.map((node) => node.type)

const textOf = (node: LexicalNode): string =>
  `${(node.text as string | undefined) ?? ''}${(node.children ?? []).map(textOf).join('')}`

describe('real migrated articles', () => {
  it.each([
    'most-expensive-colors-in-history',
    'physics-light-renaissance-painting',
    'limited-edition-vs-open-edition-prints',
  ])('converts %s with nothing refused', (name) => {
    const result = convert(fixture(name))
    expect(result.refusals).toEqual([])
    expect(result.state.root.children.length).toBeGreaterThan(3)
  })

  it('keeps every Ghost heading id on its heading, as node state', () => {
    const result = convert(fixture('limited-edition-vs-open-edition-prints'))
    const headings = result.state.root.children.filter(
      (node) => node.type === 'heading',
    )
    expect(
      headings.map((node) => (node.$ as { anchor: string }).anchor),
    ).toEqual([
      'what-are-limited-edition-prints',
      'key-features-of-limited-edition-prints',
      'pros-and-cons-of-limited-edition-prints',
      'pros',
      'cons',
      'pros-and-cons-of-open-edition-prints',
      // Ghost numbers a repeat from -1; this site's own anchors would say -2.
      'pros-1',
      'cons-1',
      'which-type-of-print-is-right-for-you',
    ])
    expect(headings.map((node) => node.tag)).toEqual([
      'h3',
      'h4',
      'h3',
      'h4',
      'h4',
      'h3',
      'h4',
      'h4',
      'h3',
    ])
    // A heading set in <strong> keeps its bold.
    expect(headings[0].children).toEqual([
      expect.objectContaining({
        text: 'What Are Limited Edition Prints?',
        format: FORMAT.bold,
      }),
    ])
  })

  it('keeps hrefs exactly, absolute and root-relative, with emphasis inside', () => {
    const result = convert(fixture('physics-light-renaissance-painting'))
    const links = result.state.root.children.flatMap((node) =>
      (node.children ?? []).filter((child) => child.type === 'link'),
    )
    expect(links.map((link) => (link.fields as { url: string }).url)).toEqual([
      'https://www.beyondeveryart.com/linear-perspective-brunelleschi-alberti-history/',
      'https://en.wikipedia.org/wiki/Linear_perspective',
      '/reading-art-history-as-a-practicing-artist/',
    ])
    expect(links[2].children).toEqual([
      expect.objectContaining({
        text: 'Reading Art History as a Practicing Artist',
        format: FORMAT.italic,
      }),
    ])
    // rel="noopener" on a same-tab link does nothing, so it is noted, not kept.
    expect(result.notes.join(' ')).toMatch(/noopener/)
  })

  it('keeps nested lists, a no-break space and rules', () => {
    const result = convert(fixture('limited-edition-vs-open-edition-prints'))
    const nodes = result.state.root.children
    expect(types(nodes)).toContain('horizontalrule')
    expect(textOf(nodes[0])).toContain('buy a limited edition')

    const last = nodes.at(-1)!
    expect(last).toMatchObject({ type: 'list', listType: 'bullet', tag: 'ul' })
    // An item, then the item holding its nested list — the editor's own shape.
    expect(
      last.children!.map((item) => [item.value, types(item.children!)]),
    ).toEqual([
      [1, ['text']],
      [2, ['list']],
      [2, ['text']],
      [3, ['list']],
    ])
    expect(last.children![1].children![0].children).toHaveLength(2)
  })

  it('sets a paragraph’s textFormat from its first text, as Lexical does', () => {
    const result = convert(fixture('limited-edition-vs-open-edition-prints'))
    const bold = result.state.root.children.find(
      (node) =>
        node.type === 'paragraph' &&
        textOf(node).startsWith('Limited edition prints'),
    )
    expect(bold?.textFormat).toBe(FORMAT.bold)
  })

  it('carries sub- and superscript, and line breaks, as the editor holds them', () => {
    const formula = convert(fixture('ultramarine-science-formula'))
    expect(formula.refusals).toEqual([])
    const link = formula.state.root.children[1].children!.find(
      (n) => n.type === 'link',
    )!
    expect(link.children!.slice(0, 2)).toEqual([
      expect.objectContaining({ text: 'Na', format: 0 }),
      expect.objectContaining({ text: '8-10', format: FORMAT.subscript }),
    ])

    const sienna = convert(fixture('burnt-sienna-opening'))
    expect(sienna.refusals).toEqual([])
    expect(types(sienna.state.root.children[0].children!)).toEqual([
      'text',
      'linebreak',
      'text',
    ])
  })
})

describe('tables', () => {
  it('refuses a table without a caption rather than invent one', () => {
    const result = convert(fixture('limited-edition-table-card'))
    expect(result.refusals).toEqual([expect.stringMatching(/has no caption/)])
    // Ghost's card fences and a chat paste's data-* attributes are noted.
    expect(result.notes.join(' ')).toMatch(/kg-card-begin/)
    expect(result.notes.join(' ')).toMatch(/data-\*/)
  })

  it('becomes a comparison table when it has one', () => {
    const html = fixture('limited-edition-table-card').replace(
      '<thead',
      '<caption>Limited and open editions compared</caption><thead',
    )
    const result = convert(html)
    expect(result.refusals).toEqual([])
    const block = result.state.root.children.find(
      (node) => node.type === 'block',
    )!
    expect(block.fields).toMatchObject({
      blockType: 'comparisonTable',
      caption: 'Limited and open editions compared',
      rowHeader: 'Feature',
      columns: [
        { label: 'Limited Edition Prints' },
        { label: 'Open Edition Prints' },
      ],
      rows: [
        {
          label: '**Number of Prints**',
          cells: [
            { value: 'Fixed, limited to a specific number of copies' },
            { value: 'Unlimited, no limit to the number of prints' },
          ],
        },
        { label: '**Price**' },
      ],
    })
    expect(result.cards).toEqual([
      { card: 'html table', block: 'comparisonTable' },
    ])
  })

  it('escapes what inline Markdown would read', () => {
    expect(escapeInlineMarkdown('5*3 [a] (b) _c_ #1')).toBe(
      '5\\*3 \\[a\\] \\(b\\) \\_c\\_ \\#1',
    )
  })
})

describe('Ghost cards', () => {
  const media = new Map<string, MediaLookup>([
    [
      'https://cms.beyondeveryart.com/api/media/file/lapis-lazuli.jpg',
      {
        found: true,
        id: 11,
        alt: 'A polished slab of lapis lazuli',
        filename: 'lapis-lazuli.jpg',
      },
    ],
    [
      'https://cms.beyondeveryart.com/api/media/file/murex.jpg',
      { found: true, id: 12, alt: 'Murex shells', filename: 'murex.jpg' },
    ],
  ])

  it('maps each card to the module that already renders it', () => {
    const result = convert(fixture('ghost-cards'), media)
    expect(result.refusals).toEqual([])
    expect(result.cards.map((card) => `${card.card} → ${card.block}`)).toEqual([
      'kg-image-card → gallery',
      'kg-image-card → upload',
      'kg-gallery-card → gallery',
      'kg-bookmark-card → bookmark',
      'kg-callout-card → callout',
      'kg-toggle-card → accordion',
      'kg-embed-card → embed',
      'kg-blockquote-alt → pullQuote',
    ])
    const nodes = result.state.root.children
    expect(nodes.find((node) => node.type === 'upload')).toMatchObject({
      relationTo: 'media',
      value: 12,
    })
    const blocks = nodes
      .filter((node) => node.type === 'block')
      .map((node) => node.fields)
    expect(blocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          blockType: 'gallery',
          items: [
            expect.objectContaining({
              image: 11,
              caption: 'Lapis lazuli from Sar-e-Sang.',
            }),
          ],
        }),
        expect.objectContaining({
          blockType: 'bookmark',
          url: 'https://www.nationalgallery.org.uk/paintings/glossary/ultramarine',
          title: 'Ultramarine | Glossary | National Gallery, London',
          publisher: 'The National Gallery',
        }),
        expect.objectContaining({
          blockType: 'callout',
          emoji: '💡',
          tone: 'neutral',
        }),
        expect.objectContaining({
          blockType: 'embed',
          title: 'Grinding lapis lazuli',
        }),
        expect.objectContaining({
          blockType: 'pullQuote',
          quote: 'The finest blue was worth more than gold.',
        }),
      ]),
    )
    // A plain blockquote is the editor's own quote node.
    expect(nodes.at(-1)).toMatchObject({ type: 'quote' })
    expect(result.images).toHaveLength(4)
  })

  it('refuses an image with no Media document, or one whose alt text differs', () => {
    const missing = convert(
      '<p><img src="https://example.com/a.jpg" alt="A"></p>',
    )
    expect(missing.refusals).toEqual([
      expect.stringMatching(/no Media document/),
    ])

    const differs = convert(
      '<p><img src="https://cms.beyondeveryart.com/api/media/file/murex.jpg" alt="Shells"></p>',
      media,
    )
    expect(differs.refusals).toEqual([
      expect.stringMatching(/alt text "Shells".*"Murex shells"/),
    ])
  })

  it('lists every image source for the caller to look up', () => {
    expect(imageSources(fixture('ghost-cards'))).toEqual([
      'https://cms.beyondeveryart.com/api/media/file/lapis-lazuli.jpg',
      'https://cms.beyondeveryart.com/api/media/file/murex.jpg',
      'https://www.nationalgallery.org.uk/favicon.ico',
    ])
  })
})

describe('what is refused', () => {
  it.each([
    ['<p style="color:red">Red</p>', /`style` attribute/],
    ['<p id="note">Anchored</p>', /`id` attribute/],
    ['<div class="wide"><p>Boxed</p></div>', /no equivalent/],
    ['<script>alert(1)</script>', /no equivalent/],
    ['<iframe src="https://example.com"></iframe>', /no equivalent/],
    ['<p>A <mark>marked</mark> word</p>', /inside a line of text/],
    ['<p>Text <img src="x.jpg" alt=""> more</p>', /inside a line of text/],
    [
      '<p><a href="https://x.test" target="_blank">x</a></p>',
      /`target` attribute/,
    ],
    [
      '<p><a href="https://x.test" rel="nofollow">x</a></p>',
      /cannot carry "nofollow"/,
    ],
    ['<p><a href="javascript:alert(1)">x</a></p>', /javascript: address/],
    ['<p><a href="https://x.test"></a></p>', /has no text/],
    ['<ul><li><p>One</p><p>Two</p></li></ul>', /more than one paragraph/],
    [
      '<div class="kg-card kg-callout-card kg-callout-card-blue"><div class="kg-callout-text">Hi</div></div>',
      /blue callout/,
    ],
  ])('%s', (html, reason) => {
    const result = convert(html)
    expect(result.refusals.join('\n')).toMatch(reason)
  })

  it('never throws, so a dry run can list every refusal at once', () => {
    const result = convert(
      '<p style="x">a</p><video></video><p><a href="javascript:x">b</a></p>',
    )
    expect(result.refusals).toHaveLength(3)
  })
})

describe('whitespace', () => {
  it('collapses as the browser does, and keeps a no-break space', () => {
    const result = convert(
      '<p>\n  Two   spaces,\n<em> a\tbreak </em> and&nbsp;&nbsp;two. </p>',
    )
    expect(result.state.root.children[0].children).toEqual([
      expect.objectContaining({ text: 'Two spaces, ', format: 0 }),
      expect.objectContaining({ text: 'a break ', format: FORMAT.italic }),
      expect.objectContaining({ text: 'and  two.', format: 0 }),
    ])
  })

  it('merges adjacent runs in the same format, as the editor would', () => {
    const result = convert('<p><em>one</em><em> two</em></p>')
    expect(result.state.root.children[0].children).toEqual([
      expect.objectContaining({ text: 'one two', format: FORMAT.italic }),
    ])
  })

  it('notes, rather than keeps, an empty paragraph', () => {
    const result = convert('<p>One</p><p> </p><p>Two</p>')
    expect(types(result.state.root.children)).toEqual([
      'paragraph',
      'paragraph',
    ])
    expect(result.notes.join(' ')).toMatch(/Empty paragraphs/)
  })
})
