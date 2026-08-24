import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { ComparisonTable } from '../../app/(frontend)/components/blocks/comparison-table'
import { FeatureList } from '../../app/(frontend)/components/blocks/feature-list'
import { MediaText } from '../../app/(frontend)/components/blocks/media-text'
import { PullQuote } from '../../app/(frontend)/components/blocks/pull-quote'

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
    direction: 'ltr',
    format: '',
    indent: 0,
    version: 1,
    children: [
      {
        type: 'paragraph',
        direction: 'ltr',
        format: '',
        indent: 0,
        version: 1,
        children: [text(value)],
      },
    ],
  },
})

const media = (url: string, alt = 'A swatch') => ({
  url,
  alt,
  width: 800,
  height: 600,
  filename: 'swatch.jpg',
})

describe('PullQuote with a source', () => {
  const base = {
    quote: 'Blue was worth more than gold.',
    attribution: 'Cennini',
  }

  it('sets cite and links the attribution', () => {
    const html = render(
      <PullQuote data={{ ...base, sourceURL: 'https://example.com/c' }} />,
    )

    expect(html).toContain('cite="https://example.com/c"')
    expect(html).toContain('href="https://example.com/c"')
    expect(html).toContain('rel="noopener noreferrer"')
  })

  it('leaves the attribution as plain text without a source', () => {
    const html = render(<PullQuote data={base} />)

    expect(html).not.toContain('cite=')
    expect(html).not.toContain('<a')
    expect(html).toContain('Cennini')
  })

  it('drops a source the href guard will not vouch for', () => {
    // Validators run on write; a document can arrive from a restore or an
    // import that never went through one, and this value lands in an href.
    const html = render(
      <PullQuote data={{ ...base, sourceURL: 'javascript:alert(1)' }} />,
    )

    expect(html).not.toContain('javascript:')
    expect(html).not.toContain('<a')
    expect(html).toContain('Cennini')
  })

  it('keeps a relative source as a link but not as cite', () => {
    // `cite` wants a URL identifying the source document; a path is a valid
    // href and a meaningless cite.
    const html = render(<PullQuote data={{ ...base, sourceURL: '/journal' }} />)

    expect(html).toContain('href="/journal"')
    expect(html).not.toContain('cite=')
  })
})

describe('FeatureList steps variant', () => {
  const items = [{ title: 'Grind the pigment' }, { title: 'Add the binder' }]

  it('is always ordered, even with numbering switched off', () => {
    // A procedure's sequence is its content, so the switch does not apply.
    const html = render(
      <FeatureList
        data={{ variant: 'steps', numbered: false, items }}
        anchors={['grind', 'bind']}
        headingAnchor=""
      />,
    )

    expect(html).toContain('<ol')
    expect(html).toContain('feature-list--steps')
  })

  it('honours numbering off for an ordinary list', () => {
    const html = render(
      <FeatureList
        data={{ numbered: false, items }}
        anchors={['grind', 'bind']}
        headingAnchor=""
      />,
    )

    expect(html).toContain('<ul')
    expect(html).toContain('feature-list--list')
  })

  it('falls back to a list for an unrecognised variant', () => {
    const html = render(
      <FeatureList
        data={{ variant: 'carousel' as never, items }}
        anchors={['grind', 'bind']}
        headingAnchor=""
      />,
    )

    expect(html).toContain('feature-list--list')
  })
})

describe('MediaText', () => {
  const body = richText('Ground lapis, once.')

  it('puts the image before the text in the markup whichever side it shows on', () => {
    // Alternating rows is a visual rhythm; it must not reorder the content for
    // a screen reader or a crawler.
    for (const imageSide of ['left', 'right'] as const) {
      const html = render(
        <MediaText
          data={{ image: media('/u.jpg'), body, imageSide }}
          anchor=""
        />,
      )

      expect(html.indexOf('media-text__figure')).toBeLessThan(
        html.indexOf('media-text__body'),
      )
      expect(html).toContain(`media-text--${imageSide}`)
    }
  })

  it('falls back to the left for an unrecognised side', () => {
    expect(
      render(
        <MediaText
          data={{ image: media('/u.jpg'), body, imageSide: 'top' as never }}
          anchor=""
        />,
      ),
    ).toContain('media-text--left')
  })

  it('keeps the text when the upload has not been populated', () => {
    const html = render(<MediaText data={{ image: null, body }} anchor="" />)

    expect(html).not.toContain('media-text__frame')
    expect(html).toContain('Ground lapis, once.')
  })

  it('labels the section only when there is a heading', () => {
    expect(
      render(
        <MediaText
          data={{ image: media('/u.jpg'), heading: 'Lapis', body }}
          anchor="lapis"
        />,
      ),
    ).toContain('aria-labelledby="lapis"')

    expect(
      render(<MediaText data={{ image: media('/u.jpg'), body }} anchor="" />),
    ).not.toContain('aria-labelledby')
  })

  it('renders nothing with neither an image nor a body', () => {
    expect(render(<MediaText data={{}} anchor="" />)).toBe('')
  })
})

describe('ComparisonTable', () => {
  const data = {
    caption: 'How three pigments behave in oil',
    rowHeader: 'Pigment',
    columns: [{ label: 'Lightfastness' }, { label: 'Opacity' }],
    rows: [
      {
        label: 'Ultramarine',
        cells: [{ value: 'Excellent' }, { value: 'Semi-transparent' }],
      },
    ],
  }

  it('builds a real table with a caption and scoped headers', () => {
    const html = render(<ComparisonTable data={data} />)

    expect(html).toContain('<caption')
    expect(html).toContain('How three pigments behave in oil')
    expect(html).toContain('<th scope="col">Pigment</th>')
    expect(html).toContain('<th scope="col">Lightfastness</th>')
    expect(html).toContain('<th scope="row">Ultramarine</th>')
  })

  it('makes the scroll box reachable and named for a keyboard user', () => {
    const html = render(<ComparisonTable data={data} />)

    expect(html).toContain('role="region"')
    expect(html).toContain('tabindex="0"')
    expect(html).toContain('aria-label="How three pigments behave in oil"')
  })

  it('uses an empty cell rather than an empty header for the corner', () => {
    // An empty `<th>` claims to head something it does not describe.
    const html = render(
      <ComparisonTable data={{ ...data, rowHeader: undefined }} />,
    )

    expect(html).toContain('comparison__corner')
    expect(html).not.toContain('<th scope="col"></th>')
  })

  it('pads a row with too few cells instead of refusing to render', () => {
    const html = render(
      <ComparisonTable
        data={{
          ...data,
          rows: [{ label: 'Vermilion', cells: [{ value: 'Poor' }] }],
        }}
      />,
    )

    expect(html).toContain('Poor')
    // One row header plus one cell per column, however many were stored.
    expect(html.match(/<td/g)).toHaveLength(2)
  })

  it('ignores cells beyond the last column', () => {
    const html = render(
      <ComparisonTable
        data={{
          ...data,
          rows: [
            {
              label: 'Vermilion',
              cells: [
                { value: 'Poor' },
                { value: 'Opaque' },
                { value: 'Stray' },
              ],
            },
          ],
        }}
      />,
    )

    expect(html).not.toContain('Stray')
  })

  it('renders nothing without usable columns or rows', () => {
    expect(render(<ComparisonTable data={{ ...data, columns: [] }} />)).toBe('')
    expect(render(<ComparisonTable data={{ ...data, rows: [] }} />)).toBe('')
  })
})
