import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Accordion } from '../../app/(frontend)/components/blocks/accordion'
import { PullQuote } from '../../app/(frontend)/components/blocks/pull-quote'
import { UnknownNode } from '../../app/(frontend)/components/blocks/unknown'

const render = (node: React.ReactNode) => renderToStaticMarkup(node)

const text = (value: string) => ({
  type: 'text',
  detail: 0,
  format: 0,
  mode: 'normal',
  style: '',
  text: value,
  version: 1,
})

const richText = (value: string) => ({
  root: {
    type: 'root',
    children: [
      {
        type: 'paragraph',
        children: [text(value)],
        direction: 'ltr',
        format: '',
        indent: 0,
        version: 1,
      },
    ],
    direction: 'ltr',
    format: '',
    indent: 0,
    version: 1,
  },
})

describe('Accordion', () => {
  const items = [
    {
      id: 'a',
      title: 'Is lapis ultramarine?',
      content: richText('Not quite.'),
    },
    { id: 'b', title: 'What replaced it?', content: richText('A synthetic.') },
  ]

  it('uses native disclosure elements', () => {
    // Not a styling preference: `<details>`/`<summary>` is what supplies the
    // keyboard behavior, the expanded/collapsed state a screen reader reads,
    // and find-in-page. A div-based version has to reimplement all three.
    const html = render(<Accordion data={{ items }} />)

    expect(html).toContain('<details')
    expect(html).toContain('<summary')
    expect(html).toContain('Is lapis ultramarine?')
    expect(html).toContain('Not quite.')
  })

  it('renders panels closed by default', () => {
    expect(render(<Accordion data={{ items }} />)).not.toContain('open=""')
  })

  it('respects a panel marked open', () => {
    const html = render(
      <Accordion data={{ items: [{ ...items[0], defaultOpen: true }] }} />,
    )

    expect(html).toContain('open=""')
  })

  it('opens every panel in preview', () => {
    // Autosave refreshes the preview route every 800ms. Without this an editor
    // writing inside a panel watches it snap shut whenever they pause typing.
    const html = render(<Accordion data={{ items }} preview />)

    expect(html.match(/open=""/g)).toHaveLength(2)
  })

  it('renders an optional heading', () => {
    const html = render(<Accordion data={{ heading: 'Questions', items }} />)

    expect(html).toContain('Questions')
    expect(render(<Accordion data={{ items }} />)).not.toContain(
      'module__heading',
    )
  })

  it('drops a panel with no title', () => {
    // A titleless panel has no control to open it, so it is unreachable
    // rather than merely untidy.
    const html = render(
      <Accordion
        data={{ items: [{ title: '  ', content: richText('Lost') }] }}
      />,
    )

    expect(html).toBe('')
  })

  it('renders nothing rather than an empty shell', () => {
    expect(render(<Accordion data={{}} />)).toBe('')
    expect(render(<Accordion data={{ items: [] }} />)).toBe('')
  })

  it('renders a panel that has a title but no body yet', () => {
    // What a draft looks like mid-edit, which Live Preview renders.
    const html = render(<Accordion data={{ items: [{ title: 'Pending' }] }} />)

    expect(html).toContain('Pending')
  })
})

describe('PullQuote', () => {
  it('keeps the attribution outside the quotation', () => {
    // Inside the blockquote it would attribute words to the speaker that they
    // never said — to a screen reader as much as to a reader.
    const html = render(
      <PullQuote
        data={{ quote: 'Colour is the place', attribution: 'Klee' }}
      />,
    )

    expect(html).toContain('<figure')
    expect(html).toContain('<blockquote')
    expect(html).toContain('<figcaption')
    expect(html.indexOf('Klee')).toBeGreaterThan(html.indexOf('</blockquote>'))
  })

  it('omits the caption when nobody is credited', () => {
    const html = render(<PullQuote data={{ quote: 'Colour is the place' }} />)

    expect(html).not.toContain('<figcaption')
  })

  it('applies the chosen variant', () => {
    expect(
      render(<PullQuote data={{ quote: 'x', variant: 'large' }} />),
    ).toContain('pull-quote--large')
  })

  it('falls back to the default variant for an unrecognised one', () => {
    // A variant goes straight into the class name, so an unchecked value puts
    // whatever the document holds into the markup. Restoring a backup taken
    // before a variant was renamed is the realistic way that happens.
    const html = render(
      <PullQuote data={{ quote: 'x', variant: 'burgundyBoxV2' as never }} />,
    )

    expect(html).toContain('pull-quote--centered')
    expect(html).not.toContain('burgundyBoxV2')
  })

  it('renders nothing without a quote', () => {
    expect(render(<PullQuote data={{}} />)).toBe('')
    expect(render(<PullQuote data={{ quote: '   ' }} />)).toBe('')
  })
})

describe('UnknownNode', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows a reader nothing and logs the slug', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const html = render(
      <UnknownNode nodeType="block" blockType="carousel" preview={false} />,
    )

    expect(html).toBe('')
    expect(warn).toHaveBeenCalledTimes(1)
    const entry = JSON.parse(warn.mock.calls[0][0] as string)
    expect(entry).toMatchObject({
      event: 'unknown_body_node',
      nodeType: 'block',
      blockType: 'carousel',
    })
  })

  it('tells an editor in preview', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    const html = render(
      <UnknownNode nodeType="block" blockType="carousel" preview />,
    )

    expect(html).toContain('Unrecognised module')
    expect(html).toContain('carousel')
  })
})
