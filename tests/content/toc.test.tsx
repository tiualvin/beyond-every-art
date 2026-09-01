// The contents list the rail shows. The interesting property is not that it
// finds headings — it is that the anchors it hands back are the same strings
// the body renders, which is why the last test in each group renders the body
// and compares rather than asserting a slug in isolation.

import { RichText } from '@payloadcms/richtext-lexical/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { buildConverters } from '../../app/(frontend)/components/blocks/registry'
import { FAQ_BLOCK } from '../../blocks/schema'
import type { ArticleBody, BodyNode } from '../../lib/content/body'
import { extractHeadings } from '../../lib/content/toc'

const text = (value: string) => ({
  type: 'text',
  detail: 0,
  format: 0,
  mode: 'normal',
  style: '',
  text: value,
  version: 1,
})

const heading = (tag: string, value: string): BodyNode => ({
  type: 'heading',
  tag,
  version: 1,
  children: [text(value)],
})

const paragraph = (value: string): BodyNode => ({
  type: 'paragraph',
  version: 1,
  children: [text(value)],
})

const richTextValue = (value: string) => ({
  root: { type: 'root', version: 1, children: [paragraph(value)] },
})

const faq = (question: string): BodyNode => ({
  type: 'block',
  version: 1,
  fields: {
    blockType: FAQ_BLOCK,
    heading: 'Questions',
    items: [{ question, answer: richTextValue('An answer.') }],
  },
})

const lexical = (children: BodyNode[]): ArticleBody => ({
  kind: 'lexical',
  content: { root: { type: 'root', children } },
})

const render = (children: BodyNode[]) =>
  renderToStaticMarkup(
    <RichText
      data={{ root: { type: 'root', children } } as never}
      converters={buildConverters(false)}
      disableContainer
    />,
  )

describe('extractHeadings, rich text', () => {
  it('lists the h2 sections in document order', () => {
    const entries = extractHeadings(
      lexical([
        paragraph('Opening.'),
        heading('h2', 'Why the grade mattered'),
        paragraph('Body.'),
        heading('h2', 'Four binders, one pigment'),
      ]),
    )

    expect(entries).toEqual([
      { id: 'why-the-grade-mattered', text: 'Why the grade mattered' },
      { id: 'four-binders-one-pigment', text: 'Four binders, one pigment' },
    ])
  })

  it('leaves out the heading levels the rail does not list', () => {
    const entries = extractHeadings(
      lexical([heading('h2', 'Method'), heading('h3', 'Apparatus')]),
    )

    expect(entries.map((entry) => entry.text)).toEqual(['Method'])
  })

  // The allocator is stateful across every heading in the document, including
  // the levels this list leaves out. Counting only the listed ones would hand
  // back `method` for a section the body renders as `method-2`.
  it('counts the levels it does not list, so repeats keep the right suffix', () => {
    const children = [
      heading('h3', 'Method'),
      heading('h2', 'Method'),
      heading('h2', 'Method'),
    ]

    expect(extractHeadings(lexical(children)).map((entry) => entry.id)).toEqual(
      ['method-2', 'method-3'],
    )

    const html = render(children)
    expect(html).toContain('<h2 id="method-2">')
    expect(html).toContain('<h2 id="method-3">')
  })

  // A block allocates anchors of its own — an FAQ's questions, a
  // media-and-text heading — and this list deliberately does not reimplement
  // that. Past the first block its numbering could drift, so it stops.
  it('stops at the first block rather than risk a wrong anchor', () => {
    const entries = extractHeadings(
      lexical([heading('h2', 'Before'), faq('Method'), heading('h2', 'After')]),
    )

    expect(entries.map((entry) => entry.text)).toEqual(['Before'])
  })

  it('is right to stop: the block does move the anchors after it', () => {
    const html = render([faq('Method'), heading('h2', 'Method')])

    // The FAQ question took `method`, so the section below it is `method-2` —
    // which is exactly the drift the bail-out above avoids reporting wrongly.
    expect(html).toContain('<h2 id="method-2">')
  })
})

describe('extractHeadings, preserved Ghost markup', () => {
  it('reads the ids the markup already carries', () => {
    const entries = extractHeadings({
      kind: 'html',
      html: '<p>Opening.</p><h2 id="understanding-ultramarine" class="x">Understanding <em>ultramarine</em></h2><p>Body.</p>',
    })

    expect(entries).toEqual([
      { id: 'understanding-ultramarine', text: 'Understanding ultramarine' },
    ])
  })

  it('skips a heading with no id, which nothing could link to', () => {
    const entries = extractHeadings({
      kind: 'html',
      html: '<h2>Unanchored</h2><h2 id="anchored">Anchored</h2>',
    })

    expect(entries.map((entry) => entry.id)).toEqual(['anchored'])
  })

  it('decodes the entities a heading arrives with', () => {
    const entries = extractHeadings({
      kind: 'html',
      html: '<h2 id="a">Lead &amp; tin&nbsp;yellow &mdash; the painter&rsquo;s problem</h2>',
    })

    expect(entries[0]?.text).toBe('Lead & tin yellow — the painter’s problem')
  })

  it('has nothing to say about an empty body', () => {
    expect(extractHeadings({ kind: 'empty' })).toEqual([])
  })
})
