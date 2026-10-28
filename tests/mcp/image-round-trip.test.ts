// An image's own caption and credit, through a revision in Markdown.
//
// `![media:7]()` is an image's whole Markdown form, so before
// `restoreImageFields` a revision brought back each image without the
// caption an editor — or `placeImage` — gave that placement.

import { describe, expect, it } from 'vitest'

import { mcpTools } from '../../lib/mcp/tools'
import { mcpRequest } from '../support/mcp-request'

const text = (value: string) => ({
  type: 'text',
  detail: 0,
  format: 0,
  mode: 'normal',
  style: '',
  text: value,
  version: 1,
})
const paragraph = (value: string) => ({
  type: 'paragraph',
  version: 1,
  format: '',
  indent: 0,
  direction: null,
  textFormat: 0,
  textStyle: '',
  children: [text(value)],
})
const image = (value: number, nodeId: string, fields: unknown) => ({
  type: 'upload',
  version: 3,
  format: '',
  id: nodeId,
  relationTo: 'media',
  value,
  fields,
})
const state = (...children: unknown[]) => ({
  root: {
    type: 'root',
    version: 1,
    format: '',
    indent: 0,
    direction: null,
    children,
  },
})

async function call(
  name: string,
  args: Record<string, unknown>,
  req: Awaited<ReturnType<typeof mcpRequest>>['req'],
) {
  const tool = mcpTools.find((candidate) => candidate.name === name)!
  const result = (await tool.handler(args, req, undefined as never)) as {
    content: Array<{ text: string }>
  }
  return JSON.parse(result.content[0].text) as Record<string, unknown>
}

describe('an image through readArticleMarkdown and updateArticleMarkdown', () => {
  it('keeps the caption and credit each placement had', async () => {
    const content = state(
      paragraph('Opening.'),
      image(7, 'a1', { caption: 'First use.', credit: 'Courtesy A' }),
      paragraph('Middle.'),
      image(7, 'a2', { caption: 'Second use.' }),
    )
    const { req, payload } = await mcpRequest({
      id: 1,
      slug: 'pigments',
      title: 'Pigments',
      content,
    })

    const read = await call('readArticleMarkdown', { id: '1' }, req)
    const markdown = String(read.markdown)
    expect(markdown).toContain('![media:7]()')

    await call(
      'updateArticleMarkdown',
      { id: '1', markdown: markdown.replace('Middle.', 'Middle, revised.') },
      req,
    )

    const saved = payload.update.mock.calls.at(-1)![0].data
      .content as ReturnType<typeof state>
    const uploads = saved.root.children.filter(
      (node) => (node as { type: string }).type === 'upload',
    ) as Array<{ id: string; fields: unknown }>
    expect(uploads.map((node) => [node.id, node.fields])).toEqual([
      ['a1', { caption: 'First use.', credit: 'Courtesy A' }],
      ['a2', { caption: 'Second use.' }],
    ])
  })
})
