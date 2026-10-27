import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { planLegacyConversion } from '../../lib/mcp/convert-legacy'
import { mcpTools } from '../../lib/mcp/tools'
import { mcpRequest } from '../support/mcp-request'

// The conversion run for real against the real `content` editor, through the
// real tools. Only the database is stubbed — see `tests/support/mcp-request.ts`.

const fixture = (name: string) =>
  readFileSync(
    join(process.cwd(), 'tests/fixtures/legacy-convert', `${name}.html`),
    'utf8',
  )

const tool = (name: string) => {
  const found = mcpTools.find((candidate) => candidate.name === name)
  if (!found) throw new Error(`no tool ${name}`)
  return found
}

type Reply = { content: Array<{ text: string }> }

async function call(
  name: string,
  args: Record<string, unknown>,
  req: unknown,
): Promise<Record<string, unknown>> {
  const reply = (await tool(name).handler(
    args,
    req as never,
    undefined as never,
  )) as Reply
  return JSON.parse(reply.content[0].text)
}

const migrated = (legacyHTML: string, extra: Record<string, unknown> = {}) => ({
  id: 51,
  slug: 'most-expensive-colors-in-history',
  title: 'The Most Expensive Colors in History (and Why They Cost a Fortune)',
  _status: 'published',
  publishedAt: '2025-12-14T05:41:08.000Z',
  legacyHTML,
  content: null,
  ...extra,
})

/** A body with the ids a conversion mints left out, to compare two of them. */
function withoutMintedIds(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutMintedIds)
  if (!value || typeof value !== 'object') return value
  const node = value as Record<string, unknown>
  return Object.fromEntries(
    Object.entries(node)
      .filter(
        ([key]) =>
          !(key === 'id' && (node.type === 'link' || node.type === 'upload')),
      )
      .map(([key, child]) => [key, withoutMintedIds(child)]),
  )
}

describe('planLegacyConversion', () => {
  it('reports a real article identical in text, ids, links and round trip', async () => {
    const html = fixture('most-expensive-colors-in-history')
    const { payload } = await mcpRequest(migrated(html))
    const { report } = await planLegacyConversion(
      payload as never,
      migrated(html) as never,
      {
        overrideAccess: true,
      },
    )
    expect(report).toMatchObject({
      convertible: true,
      refused: [],
      plainText: { equal: true },
      headingIds: { equal: true },
      links: { legacy: 3, converted: 3, missing: [], extra: [] },
      images: { legacy: 0, converted: 0 },
      roundTrip: { unchanged: true },
    })
    expect(
      report.headingIds.headings.map((h) => [h.legacy, h.converted]),
    ).toEqual([
      [
        'when-purple-was-worth-more-than-your-house',
        'when-purple-was-worth-more-than-your-house',
      ],
      [
        'the-blue-that-bankrupted-painters',
        'the-blue-that-bankrupted-painters',
      ],
      [
        'dragons-blood-the-resin-that-wasnt-worth-the-hype',
        'dragons-blood-the-resin-that-wasnt-worth-the-hype',
      ],
      ['lead-white-the-beautiful-killer', 'lead-white-the-beautiful-killer'],
    ])
  })

  it('keeps ids the renderer would otherwise number differently', async () => {
    const html = fixture('limited-edition-vs-open-edition-prints')
    const { payload } = await mcpRequest(migrated(html))
    const { report } = await planLegacyConversion(
      payload as never,
      migrated(html) as never,
      {
        overrideAccess: true,
      },
    )
    expect(report.convertible).toBe(true)
    const pros = report.headingIds.headings.filter((h) => h.text === 'Pros:')
    expect(pros.map((h) => h.converted)).toEqual(['pros', 'pros-1'])
  })

  // The editor can hold these; the Markdown tools cannot, so the first
  // revision would flatten them. Refused by name rather than converted into a
  // body that a later edit quietly damages.
  it.each([
    ['ultramarine-science-formula', /subscript text \(first: "8-10"\)/],
    ['burnt-sienna-opening', /line breaks inside a paragraph/],
  ])('refuses %s, naming what Markdown would lose', async (name, reason) => {
    const html = fixture(name)
    const { payload } = await mcpRequest(migrated(html))
    const { report } = await planLegacyConversion(
      payload as never,
      migrated(html) as never,
      {
        overrideAccess: true,
      },
    )
    expect(report.convertible).toBe(false)
    expect(report.refused).toEqual([expect.stringMatching(reason)])
    expect(report.plainText.equal).toBe(true)
    expect(report.roundTrip.unchanged).toBe(false)
  })

  it('refuses a body that already holds something', async () => {
    const html = fixture('most-expensive-colors-in-history')
    const doc = migrated(html, {
      content: {
        root: {
          type: 'root',
          version: 1,
          children: [
            {
              type: 'paragraph',
              version: 1,
              children: [{ type: 'text', version: 1, text: 'Hello' }],
            },
          ],
        },
      },
    })
    const { payload } = await mcpRequest(doc)
    const { report } = await planLegacyConversion(
      payload as never,
      doc as never,
      {
        overrideAccess: true,
      },
    )
    expect(report.refused[0]).toMatch(/already holds something/)
  })

  it('maps images to existing Media documents by filename, and refuses the rest', async () => {
    const html = fixture('ghost-cards')
    const media = [
      {
        id: 11,
        filename: 'lapis-lazuli.jpg',
        alt: 'A polished slab of lapis lazuli',
      },
      { id: 12, filename: 'murex.jpg', alt: 'Murex shells' },
    ]
    const found = await mcpRequest(migrated(html), { media })
    const { report } = await planLegacyConversion(
      found.payload as never,
      migrated(html) as never,
      {
        overrideAccess: true,
      },
    )
    expect(report).toMatchObject({
      convertible: true,
      plainText: { equal: true },
      links: { legacy: 2, converted: 2 },
      images: { legacy: 4, converted: 4 },
      roundTrip: { unchanged: true },
    })

    const none = await mcpRequest(migrated(html), { media: media.slice(0, 1) })
    const refused = await planLegacyConversion(
      none.payload as never,
      migrated(html) as never,
      {
        overrideAccess: true,
      },
    )
    expect(refused.report.refused).toEqual([
      expect.stringMatching(
        /murex\.jpg has no Media document.*no Media document is named murex\.jpg/,
      ),
      expect.stringMatching(/murex\.jpg has no Media document/),
    ])
  })
})

describe('convertLegacyArticle', () => {
  it('is a dry run unless told otherwise, and writes nothing', async () => {
    const html = fixture('most-expensive-colors-in-history')
    const { req, payload } = await mcpRequest(migrated(html))
    const reply = await call(
      'convertLegacyArticle',
      { slug: 'most-expensive-colors-in-history' },
      req,
    )
    expect(reply).toMatchObject({
      dryRun: true,
      convertible: true,
      readers: 'live',
    })
    expect(payload.update).not.toHaveBeenCalled()
  })

  it('saves content and nothing else, as a draft, and says how to undo it', async () => {
    const html = fixture('most-expensive-colors-in-history')
    const { req, payload, current } = await mcpRequest(migrated(html))
    const reply = await call(
      'convertLegacyArticle',
      { slug: 'most-expensive-colors-in-history', dryRun: false },
      req,
    )
    expect(reply).toMatchObject({
      dryRun: false,
      status: 'draft',
      undo: 'version-before',
      readers: 'live',
    })

    const [options] = payload.update.mock.calls[0] as unknown as [
      {
        data: Record<string, unknown>
        draft: boolean
        overrideAccess: boolean
      },
    ]
    expect(Object.keys(options.data).sort()).toEqual(['_status', 'content'])
    expect(options).toMatchObject({ draft: true, overrideAccess: false })
    expect(current().legacyHTML).toBe(html)
  })

  it('throws, saving nothing, when anything is refused', async () => {
    const html = fixture('ultramarine-science-formula')
    const { req, payload } = await mcpRequest(migrated(html))
    await expect(
      tool('convertLegacyArticle').handler(
        { slug: 'x', dryRun: false },
        req as never,
        undefined as never,
      ),
    ).rejects.toThrow(/Not converted, and nothing was saved.*subscript/)
    expect(payload.update).not.toHaveBeenCalled()
  })

  it("refuses an author's key before trying, since legacyHTML takes an editor", async () => {
    const html = fixture('most-expensive-colors-in-history')
    const { req, payload } = await mcpRequest(migrated(html), {
      role: 'author',
    })
    await expect(
      tool('convertLegacyArticle').handler(
        { slug: 'x' },
        req as never,
        undefined as never,
      ),
    ).rejects.toThrow(/takes an editor or an administrator/)
    expect(payload.update).not.toHaveBeenCalled()
  })
})

describe('a converted article', () => {
  async function converted(name = 'most-expensive-colors-in-history') {
    const html = fixture(name)
    const request = await mcpRequest(migrated(html))
    await call(
      'convertLegacyArticle',
      { slug: 'x', dryRun: false },
      request.req,
    )
    return { ...request, html }
  }

  // The point of converting: the module tools refuse a migrated article,
  // because a body holding only a module would replace the page.
  it('takes an FAQ and key facts, which it refused before', async () => {
    const before = await mcpRequest(
      migrated(fixture('most-expensive-colors-in-history')),
    )
    await expect(
      tool('setFAQBlock').handler(
        {
          slug: 'x',
          afterHeading: 'Lead White: The Beautiful Killer',
          items: [{ question: 'Was lead white poisonous?', answer: 'Yes.' }],
        },
        before.req as never,
        undefined as never,
      ),
    ).rejects.toThrow(/renders from migrated Ghost HTML/)

    const { req, current } = await converted()
    const faq = await call(
      'setFAQBlock',
      {
        slug: 'x',
        afterHeading: 'Lead White: The Beautiful Killer',
        items: [
          {
            question: 'Was lead white poisonous?',
            answer: 'Yes — and its makers knew it.',
          },
        ],
      },
      req,
    )
    expect(faq).toMatchObject({ status: 'draft', placement: 'inserted' })

    const facts = await call(
      'setKeyFactsBlock',
      {
        slug: 'x',
        afterHeading: 'When Purple Was Worth More Than Your House',
        facts: [{ label: 'Snails per gram', value: 'About 10,000' }],
      },
      req,
    )
    expect(facts).toMatchObject({ status: 'draft', placement: 'inserted' })

    const blocks = (
      current().content as {
        root: {
          children: Array<{ type: string; fields?: { blockType?: string } }>
        }
      }
    ).root.children
      .filter((node) => node.type === 'block')
      .map((node) => node.fields?.blockType)
    expect(blocks.sort()).toEqual(['faq', 'keyFacts'])
  })

  it('reads its kept anchors as {#anchor} and survives a revision unchanged', async () => {
    const { req, current } = await converted(
      'limited-edition-vs-open-edition-prints',
    )
    const stored = current().content

    const read = await call('readArticleMarkdown', { slug: 'x' }, req)
    expect(read.markdown).toContain('#### **Pros:** {#pros-1}')
    expect(read.markdown).toContain(
      '### **What Are Limited Edition Prints?** {#what-are-limited-edition-prints}',
    )

    const updated = await call(
      'updateArticleMarkdown',
      { slug: 'x', markdown: read.markdown },
      req,
    )
    expect(updated.anchors).toMatchObject({ removed: [], added: [] })
    expect(withoutMintedIds(current().content)).toEqual(
      withoutMintedIds(stored),
    )
  })

  it('says which anchors a revision lets go', async () => {
    const { req } = await converted()
    const read = await call('readArticleMarkdown', { slug: 'x' }, req)
    const markdown = (read.markdown as string).replace(
      ' {#the-blue-that-bankrupted-painters}',
      '',
    )
    const updated = await call(
      'updateArticleMarkdown',
      { slug: 'x', markdown },
      req,
    )
    expect(updated.anchors).toMatchObject({
      removed: ['the-blue-that-bankrupted-painters'],
      note: expect.stringMatching(/sitelinks/),
    })
  })
})

describe('an FAQ that would replace a section with a kept anchor', () => {
  it('is refused, since the section’s address would go with it', async () => {
    const html =
      '<h2 id="faq-1">FAQ</h2><p><strong>Is it toxic?</strong></p><p>Yes.</p>'
    const request = await mcpRequest(migrated(html))
    await call(
      'convertLegacyArticle',
      { slug: 'x', dryRun: false },
      request.req,
    )
    await expect(
      tool('setFAQBlock').handler(
        {
          slug: 'x',
          afterHeading: 'FAQ',
          replaceExisting: true,
          items: [{ question: 'Is it toxic?', answer: 'Yes.' }],
        },
        request.req as never,
        undefined as never,
      ),
    ).rejects.toThrow(/keeps the anchor #faq-1/)
  })

  it('goes ahead when the FAQ heading reproduces the anchor', async () => {
    const html =
      '<h2 id="faq">FAQ</h2><p><strong>Is it toxic?</strong></p><p>Yes.</p>'
    const request = await mcpRequest(migrated(html))
    await call(
      'convertLegacyArticle',
      { slug: 'x', dryRun: false },
      request.req,
    )
    const reply = await call(
      'setFAQBlock',
      {
        slug: 'x',
        afterHeading: 'FAQ',
        replaceExisting: true,
        items: [{ question: 'Is it toxic?', answer: 'Yes.' }],
      },
      request.req,
    )
    expect(reply).toMatchObject({ replacedSection: 'FAQ' })
  })
})

describe('a table with a caption', () => {
  it('becomes a comparison table with the same words, and survives a revision', async () => {
    const html = fixture('limited-edition-table-card')
      .replace(
        '<thead',
        '<caption>Limited and open editions (e.g., 5/100) compared</caption><thead',
      )
      .replace(
        '<td>Typically higher due to rarity</td>',
        '<td>Typically <em>higher</em>, see <a href="/fine-art-print-value-guide/">value</a></td>',
      )
    const { payload } = await mcpRequest(migrated(html))
    const { report, state } = await planLegacyConversion(
      payload as never,
      migrated(html) as never,
      {
        overrideAccess: true,
      },
    )
    expect(report).toMatchObject({
      convertible: true,
      plainText: { equal: true },
      links: { legacy: 1, converted: 1, missing: [], extra: [] },
      roundTrip: { unchanged: true },
      cards: [{ card: 'html table', block: 'comparisonTable' }],
    })
    const table = state.root.children.find((node) => node.type === 'block')!
    expect(JSON.stringify(table.fields)).toContain(
      '"value":"Typically *higher*, see [value](/fine-art-print-value-guide/)"',
    )
  })

  it('refuses a cell link whose address a cell cannot hold exactly', async () => {
    const html = fixture('limited-edition-table-card')
      .replace('<thead', '<caption>Compared</caption><thead')
      .replace(
        '<td>Typically higher due to rarity</td>',
        '<td><a href="https://en.wikipedia.org/wiki/Print_(art)">Print</a></td>',
      )
    const { payload } = await mcpRequest(migrated(html))
    const { report } = await planLegacyConversion(
      payload as never,
      migrated(html) as never,
      {
        overrideAccess: true,
      },
    )
    expect(report.refused).toEqual([
      expect.stringMatching(/parenthesis or a space/),
    ])
  })
})
