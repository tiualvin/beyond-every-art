import { describe, expect, it } from 'vitest'

import {
  ACCORDION_BLOCK,
  PULL_QUOTE_BLOCK,
  SIGNUP_BLOCK,
} from '../../blocks/schema'
import {
  stripLeadingTitleNode,
  toArticleBody,
  toTeaserNodes,
  type BodyNode,
} from '../../lib/content/body'

const text = (value: string) => ({
  type: 'text',
  detail: 0,
  format: 0,
  mode: 'normal',
  style: '',
  text: value,
  version: 1,
})

const paragraph = (...children: unknown[]): BodyNode => ({
  type: 'paragraph',
  children: children as BodyNode[],
  direction: 'ltr',
  format: '',
  indent: 0,
  version: 1,
})

const heading = (tag: string, value: string): BodyNode => ({
  type: 'heading',
  tag,
  children: [text(value)] as BodyNode[],
  direction: 'ltr',
  format: '',
  indent: 0,
  version: 1,
})

const block = (blockType: string, fields: Record<string, unknown> = {}) => ({
  type: 'block',
  fields: { blockType, ...fields },
  format: '',
  version: 2,
})

const editorState = (...children: unknown[]) => ({
  root: {
    type: 'root',
    children,
    direction: 'ltr',
    format: '',
    indent: 0,
    version: 1,
  },
})

/** A paragraph whose readable text is `length` characters long. */
const filler = (length: number) => paragraph(text('a'.repeat(length)))

describe('toArticleBody', () => {
  it('reports an untouched document as empty', () => {
    expect(toArticleBody({})).toEqual({ kind: 'empty' })
    expect(toArticleBody({ content: null, legacyHTML: null })).toEqual({
      kind: 'empty',
    })
    expect(toArticleBody({ content: editorState(paragraph()) })).toEqual({
      kind: 'empty',
    })
  })

  it('renders written rich text as lexical', () => {
    const body = toArticleBody({
      content: editorState(paragraph(text('Ultramarine'))),
    })

    expect(body.kind).toBe('lexical')
  })

  it('falls back to preserved Ghost markup', () => {
    const body = toArticleBody({ legacyHTML: '<p>From Ghost</p>' })

    expect(body).toEqual({ kind: 'html', html: '<p>From Ghost</p>' })
  })

  it('prefers rich text over preserved markup once an editor has written any', () => {
    const body = toArticleBody({
      content: editorState(paragraph(text('Rewritten'))),
      legacyHTML: '<p>From Ghost</p>',
    })

    expect(body.kind).toBe('lexical')
  })

  it('keeps a body that is only a module', () => {
    const body = toArticleBody({
      content: editorState(block(PULL_QUOTE_BLOCK, { quote: 'Colour is' })),
    })

    expect(body.kind).toBe('lexical')
  })

  it('drops a heading that repeats the title', () => {
    const body = toArticleBody({
      content: editorState(
        heading('h1', 'Understanding Ultramarine'),
        paragraph(text('The pigment')),
      ),
      title: 'Understanding Ultramarine',
    })

    expect(body.kind === 'lexical' && body.content.root.children).toHaveLength(
      1,
    )
  })
})

describe('stripLeadingTitleNode', () => {
  it('leaves a heading that says something else', () => {
    const nodes = [heading('h2', 'A note on lapis')]

    expect(stripLeadingTitleNode(nodes, 'Understanding Ultramarine')).toEqual(
      nodes,
    )
  })

  it('leaves a heading below h3', () => {
    const nodes = [heading('h4', 'Ultramarine')]

    expect(stripLeadingTitleNode(nodes, 'Ultramarine')).toEqual(nodes)
  })

  it('ignores smart quotes and case, as the HTML twin does', () => {
    const nodes = [heading('h1', 'Whistler’s Blue'), paragraph()]

    expect(stripLeadingTitleNode(nodes, "whistler's blue")).toHaveLength(1)
  })

  it('leaves a body with no title to compare against', () => {
    const nodes = [heading('h1', 'Ultramarine')]

    expect(stripLeadingTitleNode(nodes, null)).toEqual(nodes)
    expect(stripLeadingTitleNode(nodes, '')).toEqual(nodes)
  })
})

describe('toTeaserNodes', () => {
  it('takes whole leading paragraphs up to the limit', () => {
    const nodes = [filler(200), filler(200), filler(200), filler(200)]

    // Third paragraph crosses 500, so it is taken whole and the fourth is not.
    expect(toTeaserNodes(nodes)).toHaveLength(3)
  })

  it('always takes the first paragraph, however long', () => {
    expect(toTeaserNodes([filler(4000), filler(10)])).toHaveLength(1)
  })

  it('stops at anything that is not a paragraph', () => {
    const nodes = [filler(20), heading('h2', 'Materials'), filler(20)]

    expect(toTeaserNodes(nodes)).toHaveLength(1)
  })
})

describe('gated posts', () => {
  // The point of truncating nodes rather than hiding rendered ones: a module
  // that reaches the browser has already been sent. For a `paid` post that is
  // the leak, and CSS cannot un-send it.
  it('withholds modules from a restricted body', () => {
    const body = toArticleBody(
      {
        content: editorState(
          paragraph(text('The opening.')),
          block(SIGNUP_BLOCK, { heading: 'Members only offer' }),
          block(ACCORDION_BLOCK, {
            items: [{ title: 'The withheld method' }],
          }),
          paragraph(text('The rest of the piece.')),
        ),
      },
      { restricted: true },
    )

    expect(body.kind).toBe('lexical')
    const children = body.kind === 'lexical' ? body.content.root.children : []
    expect(children).toHaveLength(1)
    expect(JSON.stringify(children)).not.toContain('Members only offer')
    expect(JSON.stringify(children)).not.toContain('withheld method')
    expect(JSON.stringify(children)).not.toContain('rest of the piece')
  })

  it('withholds the tail of a restricted legacy body', () => {
    const body = toArticleBody(
      { legacyHTML: '<p>The opening.</p><p>The rest.</p>'.repeat(1) },
      { restricted: true },
    )

    expect(body.kind).toBe('html')
  })

  it('reports an empty body when a restricted post opens with a module', () => {
    // Nothing to tease: the piece starts with the module, so a non-member gets
    // the gate rather than a stray fragment.
    const body = toArticleBody(
      { content: editorState(block(SIGNUP_BLOCK, { heading: 'Subscribe' })) },
      { restricted: true },
    )

    expect(body).toEqual({ kind: 'empty' })
  })

  it('leaves an unrestricted body whole', () => {
    const body = toArticleBody({
      content: editorState(
        paragraph(text('The opening.')),
        block(SIGNUP_BLOCK, { heading: 'Subscribe' }),
        paragraph(text('The rest.')),
      ),
    })

    expect(body.kind === 'lexical' && body.content.root.children).toHaveLength(
      3,
    )
  })

  it('does not mutate the document it was given', () => {
    const content = editorState(filler(20), filler(20), heading('h2', 'More'))
    const before = JSON.stringify(content)

    toArticleBody({ content }, { restricted: true })

    expect(JSON.stringify(content)).toBe(before)
  })
})
