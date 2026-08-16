import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Accordion } from '../../app/(frontend)/components/blocks/accordion'
import { Bookmark } from '../../app/(frontend)/components/blocks/bookmark'
import { ActionButton } from '../../app/(frontend)/components/blocks/button'
import { Callout } from '../../app/(frontend)/components/blocks/callout'
import { Embed } from '../../app/(frontend)/components/blocks/embed'
import { Gallery } from '../../app/(frontend)/components/blocks/gallery'
import { PullQuote } from '../../app/(frontend)/components/blocks/pull-quote'
import { UnknownNode } from '../../app/(frontend)/components/blocks/unknown'

const media = (url: string, alt = 'A swatch') => ({
  url,
  alt,
  width: 800,
  height: 600,
  filename: 'swatch.jpg',
})

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

describe('Callout', () => {
  it('renders as an aside with its tone', () => {
    const html = render(
      <Callout
        data={{ tone: 'accent', content: richText('Mind the varnish.') }}
      />,
    )

    expect(html).toContain('<aside')
    expect(html).toContain('callout--accent')
    expect(html).toContain('Mind the varnish.')
  })

  it('hides the emoji from screen readers', () => {
    // "Sparkles" announced before the sentence adds nothing a reader can use,
    // and some emoji have actively misleading announced names.
    const html = render(
      <Callout data={{ emoji: '💡', content: richText('A note.') }} />,
    )

    expect(html).toContain('aria-hidden="true"')
  })

  it('falls back to the default tone for an unrecognised one', () => {
    const html = render(
      <Callout
        data={{ tone: 'neon' as never, content: richText('A note.') }}
      />,
    )

    expect(html).toContain('callout--neutral')
    expect(html).not.toContain('neon')
  })

  it('renders nothing without content', () => {
    expect(render(<Callout data={{}} />)).toBe('')
    expect(render(<Callout data={{ emoji: '💡' }} />)).toBe('')
  })
})

describe('ActionButton', () => {
  it('renders an external link that does not leak the referrer window', () => {
    const html = render(
      <ActionButton data={{ label: 'Read it', href: 'https://example.com' }} />,
    )

    expect(html).toContain('Read it')
    expect(html).toContain('rel="noopener noreferrer"')
  })

  it('refuses a javascript: URL', () => {
    // The field validator already refuses this on write. This is the render
    // half, for a document that arrived from a restore or an import instead.
    const html = render(
      <ActionButton data={{ label: 'Click', href: 'javascript:alert(1)' }} />,
    )

    expect(html).toBe('')
  })

  it('refuses a protocol-relative URL dressed as a path', () => {
    expect(
      render(<ActionButton data={{ label: 'Go', href: '//evil.test' }} />),
    ).toBe('')
  })

  it('applies variant and alignment', () => {
    const html = render(
      <ActionButton
        data={{
          label: 'Go',
          href: '/journal',
          variant: 'secondary',
          align: 'center',
        }}
      />,
    )

    expect(html).toContain('button--secondary')
    expect(html).toContain('button-block--center')
  })

  it('renders nothing without a label', () => {
    expect(render(<ActionButton data={{ href: '/journal' }} />)).toBe('')
  })
})

describe('Gallery', () => {
  const items = [
    { id: '1', image: media('/a.jpg'), caption: 'Raking light' },
    { id: '2', image: media('/b.jpg') },
  ]

  it('renders every image with its caption', () => {
    const html = render(<Gallery data={{ items }} />)

    expect(html).toContain('gallery--grid')
    expect(html).toContain('Raking light')
    expect(html.match(/<img/g)).toHaveLength(2)
  })

  it('drops an item whose upload did not come back populated', () => {
    // The normal state of a draft mid-edit, and of any query run at a depth
    // too shallow to populate the relation.
    const html = render(
      <Gallery data={{ items: [{ id: '1', image: null }, items[0]] }} />,
    )

    expect(html.match(/<img/g)).toHaveLength(1)
  })

  it('renders nothing when no image survives', () => {
    expect(
      render(<Gallery data={{ items: [{ id: '1', image: null }] }} />),
    ).toBe('')
    expect(render(<Gallery data={{}} />)).toBe('')
  })

  it('applies the rows layout', () => {
    expect(render(<Gallery data={{ items, layout: 'rows' }} />)).toContain(
      'gallery--rows',
    )
  })
})

describe('Bookmark', () => {
  it('makes the whole card one link', () => {
    // One tab stop and one target the width of the card, rather than a thin
    // line of text to hit on a phone.
    const html = render(
      <Bookmark
        data={{
          url: 'https://www.burlington.org.uk/a',
          title: 'On lead white',
          description: 'A long read.',
        }}
      />,
    )

    expect(html.match(/<a /g)).toHaveLength(1)
    expect(html).toContain('On lead white')
    // Publisher falls back to the host when the editor left it blank.
    expect(html).toContain('burlington.org.uk')
  })

  it('keeps the thumbnail out of the accessible name', () => {
    const html = render(
      <Bookmark
        data={{
          url: 'https://example.com/a',
          title: 'A title',
          image: media('/thumb.jpg'),
        }}
      />,
    )

    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('alt=""')
  })

  it('renders nothing for an unsafe or missing URL', () => {
    expect(
      render(<Bookmark data={{ url: 'javascript:alert(1)', title: 'X' }} />),
    ).toBe('')
    expect(render(<Bookmark data={{ title: 'X' }} />)).toBe('')
    expect(render(<Bookmark data={{ url: 'https://example.com' }} />)).toBe('')
  })
})

describe('Embed', () => {
  it('frames an allowlisted provider from the no-cookie host', () => {
    const html = render(
      <Embed
        data={{
          url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          title: 'The pigment film',
        }}
      />,
    )

    expect(html).toContain('youtube-nocookie.com/embed/dQw4w9WgXcQ')
    expect(html).toContain('title="The pigment film"')
    expect(html).toContain('sandbox=')
  })

  it('never grants the frame top-level navigation', () => {
    // Without this a frame could navigate the article out from under the
    // reader.
    const html = render(
      <Embed data={{ url: 'https://vimeo.com/123456789', title: 'A film' }} />,
    )

    expect(html).not.toContain('allow-top-navigation')
  })

  it('degrades to a link for a provider nobody has reviewed', () => {
    const html = render(
      <Embed data={{ url: 'https://example.com/v/1', title: 'Elsewhere' }} />,
    )

    expect(html).not.toContain('<iframe')
    expect(html).toContain('href="https://example.com/v/1"')
    expect(html).toContain('Elsewhere')
  })

  it('renders nothing rather than an untitled frame', () => {
    // The title is the frame's accessible name; an unnamed iframe is a dead
    // end for a screen reader.
    expect(
      render(
        <Embed data={{ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }} />,
      ),
    ).toBe('')
  })

  it('renders nothing for an unsafe URL', () => {
    expect(
      render(<Embed data={{ url: 'javascript:alert(1)', title: 'X' }} />),
    ).toBe('')
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
