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
