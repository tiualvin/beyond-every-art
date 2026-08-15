import { describe, expect, it } from 'vitest'

import { elideArticleBodies, elideDocument } from '../../lib/mcp/response'

const elide = elideArticleBodies('posts')

/** A response shaped the way the plugin's list path builds one. */
function listResponse(docs: Record<string, unknown>[]) {
  return {
    content: [
      {
        text:
          `Collection: "posts"\nTotal: ${docs.length} documents\nPage: 1 of 1\n` +
          docs
            .map((doc) => `\n\`\`\`json\n${JSON.stringify(doc)}\n\`\`\``)
            .join(''),
        type: 'text',
      },
    ],
  }
}

const paginated = (docs: Record<string, unknown>[]) => ({
  docs,
  page: 1,
  totalDocs: docs.length,
  totalPages: 1,
})

describe('elideDocument', () => {
  it('replaces a migrated body with its size', () => {
    const elided = elideDocument({
      id: 1,
      legacyHTML: '<p>x</p>'.repeat(100),
      title: 'Ultramarine',
    })

    expect(elided?.title).toBe('Ultramarine')
    expect(elided?.legacyHTML).toContain(
      '800 characters of migrated Ghost HTML',
    )
    expect(elided?.legacyHTML).toContain('readArticleMarkdown')
  })

  it('weighs a rich-text body by its serialised size', () => {
    const content = { root: { children: [{ text: 'y'.repeat(50) }] } }
    const elided = elideDocument({ content, id: 1 })

    expect(elided?.content).toContain(
      `${JSON.stringify(content).length} characters of rich-text body`,
    )
  })

  // The caller leaves the plugin's own response alone when nothing was heavy,
  // so this has to be distinguishable from an unchanged copy.
  it('returns null when there is nothing to elide', () => {
    expect(elideDocument({ id: 1, title: 'Ultramarine' })).toBeNull()
    expect(elideDocument({ id: 1, legacyHTML: '' })).toBeNull()
    expect(elideDocument({ content: null, id: 1 })).toBeNull()
  })

  it('does not mutate the document it was given', () => {
    const doc = { id: 1, legacyHTML: '<p>x</p>' }
    elideDocument(doc)

    expect(doc.legacyHTML).toBe('<p>x</p>')
  })
})

describe('elideArticleBodies', () => {
  it('rebuilds a list response with every body summarised', () => {
    const docs = [
      { id: 1, legacyHTML: '<p>one</p>', title: 'One' },
      { content: { root: {} }, id: 2, title: 'Two' },
    ]

    const text = elide(listResponse(docs), paginated(docs), null as never)
      .content[0].text

    expect(text).toContain('Collection: "posts"')
    expect(text).toContain('Total: 2 documents')
    expect(text).toContain('Page: 1 of 1')
    expect(text).not.toContain('<p>one</p>')
    expect(text).toContain('"title":"One"')
    expect(text).toContain('"title":"Two"')
  })

  it('summarises a single document from findByID, create, or update', () => {
    const doc = { id: 7, legacyHTML: '<p>body</p>', slug: 'ultramarine' }

    const text = elide(
      {
        content: [
          {
            text: `Resource from collection "posts":\n${JSON.stringify(doc)}`,
            type: 'text',
          },
        ],
      },
      doc,
      null as never,
    ).content[0].text

    expect(text).toContain('Resource from collection "posts"')
    expect(text).toContain('"slug":"ultramarine"')
    expect(text).not.toContain('<p>body</p>')
  })

  // Narrowing responses is the job; reformatting them for its own sake is not.
  it('returns the response untouched when no document carried a body', () => {
    const docs = [{ id: 1, title: 'One' }]
    const response = listResponse(docs)

    expect(elide(response, paginated(docs), null as never)).toBe(response)
  })

  it('returns the response untouched on the error paths, which pass {}', () => {
    const response = { content: [{ text: 'Error: not found', type: 'text' }] }

    expect(elide(response, {}, null as never)).toBe(response)
  })

  it('leaves a selected query alone, since it asked for no body', () => {
    const docs = [
      { id: 1, title: 'One' },
      { id: 2, title: 'Two' },
    ]
    const response = listResponse(docs)

    expect(elide(response, paginated(docs), null as never)).toBe(response)
  })
})
