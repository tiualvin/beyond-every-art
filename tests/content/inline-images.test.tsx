// An image inside a body — a Lexical `upload` node.
//
// The first article to carry one shipped images the package's own converter
// rendered: a bare `<picture>` pointing at the stored media URL. That URL ends
// in a slash the file does not live at, and it never reaches `next/image`, so
// the browser took a 308 hop and downloaded 1.8MB of PNG where the optimiser
// sends 132KB of WebP. These hold the two faults shut.

import { RichText } from '@payloadcms/richtext-lexical/react'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { buildConverters } from '../../app/(frontend)/components/blocks/registry'

/** A media record as a `depth: 1` query returns it. */
const media = (overrides: Record<string, unknown> = {}) => ({
  id: 219,
  filename: 'tyrian-purple-murex-dye.png',
  // Payload stores the trailing slash. The file is not served there.
  url: '/api/media/file/tyrian-purple-murex-dye.png/',
  alt: 'Three spiky sea snail shells and a bowl of deep red liquid on stone',
  caption: null,
  credit: null,
  creditURL: null,
  width: 1344,
  height: 768,
  sizes: {
    card: { url: '/api/media/file/tyrian-purple-murex-dye-768x439.png/' },
    og: { url: '/api/media/file/tyrian-purple-murex-dye-1200x630.png/' },
  },
  ...overrides,
})

const upload = (value: unknown) => ({
  type: 'upload',
  version: 1,
  format: '',
  relationTo: 'media',
  value,
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

const render = (...children: unknown[]) =>
  renderToStaticMarkup(
    createElement(RichText, {
      data: body(...children) as never,
      converters: buildConverters(false),
      disableContainer: true,
    }),
  )

describe('an image in a body', () => {
  it('goes through the optimiser', () => {
    const html = render(upload(media()))

    // `next/image` is what makes the delivered bytes 132KB instead of 1.8MB.
    expect(html).toContain('/_next/image?url=')
    expect(html).toContain('srcSet=')
  })

  it('never names the stored URL with its trailing slash', () => {
    // The whole first fault in one assertion. `toMediaImage` normalises this;
    // a regression here is a 308 on the image and on every `<source>`.
    const html = render(upload(media()))

    expect(html).not.toContain('tyrian-purple-murex-dye.png%2F')
    expect(html).not.toContain('murex-dye.png/"')
    expect(html).toContain(
      encodeURIComponent('/api/media/file/tyrian-purple-murex-dye.png'),
    )
  })

  it('is a figure, with the alt the media record carries', () => {
    const html = render(upload(media()))

    expect(html).toContain('<figure class="prose__figure">')
    expect(html).toContain('alt="Three spiky sea snail shells')
  })

  it('shows the caption when the record has one', () => {
    const html = render(
      upload(
        media({ caption: 'Murex sea snails, the source of Tyrian purple.' }),
      ),
    )

    expect(html).toContain(
      '<figcaption>Murex sea snails, the source of Tyrian purple.</figcaption>',
    )
  })

  it('renders no empty caption element when the record has none', () => {
    expect(render(upload(media()))).not.toContain('<figcaption')
  })

  it('reserves space for a record that stores no dimensions', () => {
    const html = render(upload(media({ width: null, height: null })))

    expect(html).toContain('prose__figure-fill')
    expect(html).toContain('/_next/image?url=')
  })

  it('renders nothing for a relation the query did not populate', () => {
    // A bare id is the ordinary state of a read at `depth: 0`. An empty frame
    // with a broken image is worse than no figure.
    const html = render(upload(219))

    expect(html).not.toContain('<figure')
    expect(html).not.toContain('<img')
  })

  it('renders nothing when the upload has no resolved file', () => {
    expect(render(upload(media({ url: null })))).not.toContain('<figure')
  })

  it('does not mark a body image as the LCP element', () => {
    // `FeaturedFigure` sets `priority`; four body images competing with it
    // would undo the point of that. `fetchpriority="high"` is what `priority`
    // writes.
    expect(render(upload(media()))).not.toContain('fetchpriority="high"')
  })

  it('sizes the hint against the reading column, not the viewport', () => {
    // `--text-w` is 44rem and the text track resolves to it at every desktop
    // size, so a bare `100vw` would over-fetch on a wide screen.
    const html = render(upload(media()))

    expect(html).toContain('sizes="(max-width: 47rem) 100vw, 44rem"')
  })
})
