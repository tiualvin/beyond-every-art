// Headings that keep the id a migrated article gave them.
//
// The converter stores Ghost's heading ids on the nodes; these tests hold the
// three places that have to honour them — the renderer, the contents list and
// the admin editor — and the one that must never take one by accident: an
// anchor derived from text.

import { getEnabledNodes } from '@payloadcms/richtext-lexical'
import { createHeadlessEditor } from '@payloadcms/richtext-lexical/lexical/headless'
import { RichText } from '@payloadcms/richtext-lexical/react'
import { createElement, Fragment } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { buildConverters } from '../../app/(frontend)/components/blocks/registry'
import {
  createAnchorAllocator,
  keptAnchor,
  keptAnchors,
} from '../../lib/content/headings'
import { extractHeadings } from '../../lib/content/toc'
import { contentEditorConfig } from '../../lib/mcp/markdown'
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

const heading = (value: string, anchor?: string, tag = 'h2') => ({
  type: 'heading',
  tag,
  version: 1,
  direction: null,
  format: '',
  indent: 0,
  children: [text(value)],
  ...(anchor ? { $: { anchor } } : {}),
})

const paragraph = (value: string) => ({
  type: 'paragraph',
  version: 1,
  direction: null,
  format: '',
  indent: 0,
  textFormat: 0,
  textStyle: '',
  children: [text(value)],
})

const body = (...children: unknown[]) => ({
  root: {
    type: 'root',
    version: 1,
    direction: null,
    format: '',
    indent: 0,
    children,
  },
})

const ids = (html: string) =>
  [...html.matchAll(/<h[1-6] id="([^"]+)"/g)].map((match) => match[1])

describe('the allocator', () => {
  it('hands a heading the anchor it keeps', () => {
    const allocate = createAnchorAllocator(['pros-1'])
    expect(allocate('Pros', 'pros')).toBe('pros')
    expect(allocate('Pros', 'pros-1')).toBe('pros-1')
  })

  it('never derives an anchor another heading keeps', () => {
    // "Pros 1" would slug to `pros-1`, which a later heading keeps.
    const allocate = createAnchorAllocator(['pros-1'])
    expect(allocate('Pros 1')).toBe('pros-1-2')
    expect(allocate('Pros', 'pros-1')).toBe('pros-1')
  })

  it('falls back to the text when a kept anchor is already taken', () => {
    const allocate = createAnchorAllocator(['method'])
    expect(allocate('Method', 'method')).toBe('method')
    // A heading copied with its state in the admin panel.
    expect(allocate('Method', 'method')).toBe('method-2')
  })

  it('reads only well-formed anchors off a node', () => {
    expect(keptAnchor(heading('A', 'a-b_c.d%20'))).toBe('a-b_c.d%20')
    expect(keptAnchor({ $: { anchor: 'has space' } })).toBeNull()
    expect(keptAnchor({ $: { anchor: '"><script>' } })).toBeNull()
    expect(keptAnchor({})).toBeNull()
  })
})

describe('the renderer', () => {
  const render = (value: ReturnType<typeof body>, parts = 1) => {
    const children = value.root.children
    const allocate = createAnchorAllocator(keptAnchors(children as never))
    const converters = buildConverters(false, allocate)
    const size = Math.ceil(children.length / parts)
    return renderToStaticMarkup(
      createElement(
        Fragment,
        null,
        Array.from({ length: parts }, (_, index) =>
          createElement(RichText, {
            key: index,
            data: body(
              ...children.slice(index * size, (index + 1) * size),
            ) as never,
            converters,
            disableContainer: true,
          }),
        ),
      ),
    )
  }

  it('renders the ids a migrated article had, not ones derived from the text', () => {
    const html = render(
      body(
        heading('Pros:', 'pros'),
        paragraph('One.'),
        heading('Pros:', 'pros-1'),
        heading('Reworded since', 'the-original-heading'),
      ),
    )
    expect(ids(html)).toEqual(['pros', 'pros-1', 'the-original-heading'])
  })

  // `ArticleBody` cuts a long article into several `RichText`s around its ad
  // slots. Each used to build its own allocator, so a heading repeated in a
  // later part got the first one's id.
  it('keeps ids unique across the parts of a body rendered in pieces', () => {
    const html = render(
      body(
        heading('Method'),
        paragraph('a'),
        heading('Method'),
        paragraph('b'),
      ),
      2,
    )
    expect(ids(html)).toEqual(['method', 'method-2'])
  })

  it('lists the same ids in the contents rail', () => {
    const value = body(
      heading('Pros:', 'pros'),
      heading('Pros 1'),
      heading('Pros:', 'pros-1'),
    )
    expect(
      extractHeadings({ kind: 'lexical', content: value as never }).map(
        (e) => e.id,
      ),
    ).toEqual(ids(render(value)))
    expect(ids(render(value))).toEqual(['pros', 'pros-1-2', 'pros-1'])
  })
})

describe('the admin editor', () => {
  // The anchor is Lexical node state, which Lexical carries through import and
  // export when no code claims its key — so an editor who opens a converted
  // article and saves it keeps every anchor. Checked against the posts
  // editor's own nodes, the same load an admin session does.
  it('keeps a heading’s anchor through a load and save', async () => {
    const { payload } = await mcpRequest({ id: 1 })
    const editorConfig = contentEditorConfig(payload as never, 'posts')
    const editor = createHeadlessEditor({
      nodes: getEnabledNodes({ editorConfig }),
    })
    const state = body(heading('Pros:', 'pros-1', 'h4'), paragraph('Kept.'))

    editor.update(
      () => {
        editor.setEditorState(editor.parseEditorState(state as never))
      },
      { discrete: true },
    )
    const saved = editor.getEditorState().toJSON() as unknown as ReturnType<
      typeof body
    >

    expect(saved.root.children[0]).toMatchObject({
      type: 'heading',
      tag: 'h4',
      $: { anchor: 'pros-1' },
    })
  })
})
