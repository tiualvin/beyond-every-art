import { describe, expect, it } from 'vitest'

import { mcpTools } from '../../lib/mcp/tools'
import { mcpRequest } from '../support/mcp-request'

// The drafting tools, run for real against the real `content` editor. Only the
// database is stubbed — see `tests/support/mcp-request.ts`.

type Node = Record<string, unknown> & { type: string; children?: Node[] }

const text = (value: string): Node => ({
  type: 'text',
  version: 1,
  text: value,
  format: 0,
  mode: 'normal',
  style: '',
  detail: 0,
})

const paragraph = (value: string): Node => ({
  type: 'paragraph',
  version: 1,
  format: '',
  indent: 0,
  direction: 'ltr',
  textFormat: 0,
  textStyle: '',
  children: [text(value)],
})

const heading = (value: string, tag = 'h2'): Node => ({
  type: 'heading',
  tag,
  version: 1,
  format: '',
  indent: 0,
  direction: 'ltr',
  children: [text(value)],
})

const block = (
  blockType: string,
  fields: Record<string, unknown> = {},
  id: string | null = '65f0c0ffee0000000000abcd',
): Node => ({
  type: 'block',
  version: 2,
  format: '',
  fields: { ...(id ? { id } : {}), blockName: '', blockType, ...fields },
})

const facts = {
  items: [
    { id: 'row1', label: 'Insect', value: 'Dactylopius coccus' },
    { id: 'row2', label: 'Yield', value: '~70,000 insects per lb' },
  ],
}

const upload = (value: number): Node => ({
  type: 'upload',
  version: 3,
  format: '',
  id: 'upload-node',
  fields: null,
  relationTo: 'media',
  value,
})

const body = (...children: Node[]) => ({
  root: {
    type: 'root',
    version: 1,
    format: '',
    indent: 0,
    direction: 'ltr',
    children,
  },
})

type Body = ReturnType<typeof body>

const types = (state: unknown) =>
  (state as Body).root.children.map((node) => node.type)

async function call(
  name: string,
  args: Record<string, unknown>,
  req: Awaited<ReturnType<typeof mcpRequest>>['req'],
) {
  const tool = mcpTools.find((candidate) => candidate.name === name)
  if (!tool) throw new Error(`No tool named ${name}`)
  const result = (await tool.handler(args, req, undefined as never)) as {
    content: Array<{ text: string }>
  }
  return JSON.parse(result.content[0].text) as Record<string, unknown>
}

describe('reading and revising a body as Markdown', () => {
  it('reads the draft with its relationships left as ids', async () => {
    const { req, payload } = await mcpRequest({
      id: 1,
      content: body(paragraph('A body.')),
    })

    await call('readArticleMarkdown', { id: '1' }, req)

    expect(payload.findByID).toHaveBeenCalledWith(
      expect.objectContaining({ depth: 0, draft: true }),
    )
  })

  it('keeps an inline image through a read and a revision', async () => {
    // Populated, the image read as `![alt](url)`, which the converter does not
    // read back: the revision stored the line as text and dropped the image.
    const { req, payload, current } = await mcpRequest({
      id: 1,
      content: body(paragraph('Before.'), upload(7), paragraph('After.')),
    })
    // What Payload hands back when asked for any depth above zero.
    const stored = payload.findByID.getMockImplementation()!
    payload.findByID.mockImplementation(async (args?: { depth?: number }) => {
      const doc = await stored()
      if (args?.depth === 0) return doc
      const populated = structuredClone(doc)
      ;(populated.content as Body).root.children[1].value = {
        id: 7,
        alt: 'A cochineal colony',
        url: '/media/cochineal.jpg',
        mimeType: 'image/jpeg',
      }
      return populated
    })

    const { markdown } = await call('readArticleMarkdown', { id: '1' }, req)
    expect(markdown).toContain('![media:7]()')

    await call('updateArticleMarkdown', { id: '1', markdown }, req)

    expect(types(current().content)).toEqual([
      'paragraph',
      'upload',
      'paragraph',
    ])
    expect((current().content as Body).root.children[1]).toMatchObject({
      relationTo: 'media',
      value: 7,
    })
  })
})

describe('an article migrated from Ghost', () => {
  const legacyHTML = '<p>The migrated body.</p>'

  it('says so when the page renders from its Ghost HTML', async () => {
    const { req } = await mcpRequest({ id: 1, legacyHTML, content: null })

    const { markdown } = await call('readArticleMarkdown', { id: '1' }, req)

    expect(markdown).toMatch(/renders from migrated Ghost HTML/)
  })

  it('reads the rich-text body once that is what the page renders', async () => {
    // Rewritten in the editor since the import. The body wins over the HTML
    // whenever it holds anything, so this is the text a reader sees — and
    // telling the agent otherwise sent it away from the only edit that counts.
    const { req } = await mcpRequest({
      id: 1,
      legacyHTML,
      content: body(paragraph('Rewritten in the editor.')),
    })

    const { markdown } = await call('readArticleMarkdown', { id: '1' }, req)

    expect(markdown).toBe('Rewritten in the editor.')
  })
})

describe('modules in a body read as Markdown', () => {
  it('stands a marker in for each block, where it sits', async () => {
    // Without one, Payload writes every block as the words "Block Field".
    const { req } = await mcpRequest({
      id: 1,
      content: body(
        heading('The short answer'),
        block('keyFacts', facts),
        paragraph('After.'),
      ),
    })

    const { markdown } = await call('readArticleMarkdown', { id: '1' }, req)

    expect(markdown).toBe(
      '## The short answer\n\n' +
        '<!-- block:keyFacts:65f0c0ffee0000000000abcd -->\n\n' +
        'After.',
    )
    expect(markdown).not.toContain('Block Field')
  })

  it('lists what each block holds, and where', async () => {
    const { req } = await mcpRequest({
      id: 1,
      content: body(
        block('pullQuote', { quote: 'Before any heading.' }, 'aa11'),
        heading('The short answer'),
        paragraph('Intro.'),
        block('keyFacts', facts),
      ),
    })

    const { blocks } = await call('readArticleMarkdown', { id: '1' }, req)

    expect(blocks).toEqual([
      {
        key: 'aa11',
        blockType: 'pullQuote',
        marker: '<!-- block:pullQuote:aa11 -->',
        afterHeading: null,
        fields: {
          id: 'aa11',
          blockType: 'pullQuote',
          quote: 'Before any heading.',
        },
      },
      {
        key: '65f0c0ffee0000000000abcd',
        blockType: 'keyFacts',
        marker: '<!-- block:keyFacts:65f0c0ffee0000000000abcd -->',
        afterHeading: 'The short answer',
        fields: {
          id: '65f0c0ffee0000000000abcd',
          blockType: 'keyFacts',
          ...facts,
        },
      },
    ])
  })

  it('keys a block by position when its id cannot be a marker', async () => {
    // No id at all, or one the Markdown converter would escape.
    const { req } = await mcpRequest({
      id: 1,
      content: body(
        block('callout', {}, null),
        block('callout', {}, 'has_underscore'),
      ),
    })

    const { blocks, markdown } = await call(
      'readArticleMarkdown',
      { id: '1' },
      req,
    )

    expect((blocks as Array<{ key: string }>).map((b) => b.key)).toEqual([
      'n0',
      'n1',
    ])
    expect(markdown).toBe(
      '<!-- block:callout:n0 -->\n\n<!-- block:callout:n1 -->',
    )
  })

  it('reads without writing', async () => {
    const content = body(block('keyFacts', facts))
    const { req, payload, current } = await mcpRequest({ id: 1, content })

    await call('readArticleMarkdown', { id: '1' }, req)

    expect(payload.update).not.toHaveBeenCalled()
    expect(current().content).toEqual(body(block('keyFacts', facts)))
  })

  it('reports no blocks for a body without any', async () => {
    const { req } = await mcpRequest({ id: 1, content: body(paragraph('x')) })

    const { blocks } = await call('readArticleMarkdown', { id: '1' }, req)

    expect(blocks).toEqual([])
  })
})
