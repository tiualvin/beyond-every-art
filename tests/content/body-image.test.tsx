import { RichText } from '@payloadcms/richtext-lexical/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { BodyImage } from '../../app/(frontend)/components/body-image'
import { buildConverters } from '../../app/(frontend)/components/blocks/registry'
import type { BodyNode } from '../../lib/content/body'
import { collectBodyImages, toBodyImage } from '../../lib/content/body-image'

const media = {
  id: 41,
  url: '/api/media/file/pigment-cabinet.jpg/',
  filename: 'pigment-cabinet.jpg',
  alt: 'A cabinet of ground pigments in glass jars',
  width: 1600,
  height: 1067,
  caption: 'The pigment cabinet at the Forbes collection.',
  credit: 'Photo by Ana Ruiz',
  creditURL: 'https://unsplash.com/@anaruiz',
}

const upload = (
  value: unknown = media,
  fields: Record<string, unknown> | null = null,
): BodyNode => ({
  type: 'upload',
  version: 3,
  format: '',
  id: '66f0c0ffee0000000000abcd',
  relationTo: 'media',
  value,
  // Lexical stores `null` for a node whose extra fields were never opened,
  // which `BodyNode` does not model.
  fields: fields as BodyNode['fields'],
})

describe('toBodyImage', () => {
  it("uses the image's own caption and credit when the placement has none", () => {
    expect(toBodyImage(upload())).toMatchObject({
      caption: media.caption,
      credit: media.credit,
      creditURL: 'https://unsplash.com/@anaruiz',
    })
  })

  it("prefers the placement's caption", () => {
    expect(
      toBodyImage(upload(media, { caption: '  Storage, not trade.  ' }))
        ?.caption,
    ).toBe('Storage, not trade.')
  })

  // A placement naming somebody else must not link to whoever the record
  // credits: that would attribute one person's work to another's profile.
  it("drops the record's credit link when the placement credits someone else", () => {
    const figure = toBodyImage(upload(media, { credit: 'Courtesy the Forbes' }))
    expect(figure?.credit).toBe('Courtesy the Forbes')
    expect(figure?.creditURL).toBeNull()
  })

  it('renders nothing for an image that did not populate', () => {
    expect(toBodyImage(upload(41))).toBeNull()
    expect(toBodyImage(upload({ alt: 'no file' }))).toBeNull()
    expect(toBodyImage({ ...upload(), relationTo: 'users' })).toBeNull()
  })
})

describe('collectBodyImages', () => {
  it('finds images in reading order, nested ones included', () => {
    const second = { ...media, id: 42, url: '/api/media/file/second.jpg' }
    const images = collectBodyImages({
      root: {
        children: [
          upload(),
          {
            type: 'list',
            children: [{ type: 'listitem', children: [upload(second)] }],
          },
          { type: 'paragraph', children: [{ type: 'text', text: 'x' }] },
        ],
      },
    })
    expect(images.map((figure) => figure.image.url)).toEqual([
      '/api/media/file/pigment-cabinet.jpg',
      '/api/media/file/second.jpg',
    ])
  })
})

describe('BodyImage', () => {
  const html = renderToStaticMarkup(
    <BodyImage figure={toBodyImage(upload())!} />,
  )

  it('is a figure whose figcaption carries the caption and the credit', () => {
    expect(html).toMatch(/^<figure class="article__figure body-figure">/)
    expect(html).toMatch(
      /<figcaption>The pigment cabinet at the Forbes collection\.<span class="article__figure-credit"><a [^>]*>Photo by Ana Ruiz<\/a><\/span><\/figcaption>/,
    )
  })

  it('links the credit with the referral parameters Unsplash asks for', () => {
    expect(html).toContain('utm_source=beyond_every_art')
    expect(html).toContain('rel="noopener noreferrer"')
  })

  // Below the fold by construction: the hero holds the LCP element. And
  // dimensioned, so a late image cannot shift the text under a reader.
  it('loads lazily, reserves its space and names its rendered width', () => {
    expect(html).toContain('loading="lazy"')
    expect(html).toContain('width="1600"')
    expect(html).toContain('height="1067"')
    expect(html).toContain('sizes="(max-width: 47rem) 100vw, 44rem"')
    expect(html).toContain('alt="A cabinet of ground pigments in glass jars"')
  })

  it('has no figcaption when there is nothing to say', () => {
    const bare = renderToStaticMarkup(
      <BodyImage
        figure={toBodyImage(upload({ ...media, caption: null, credit: null }))!}
      />,
    )
    expect(bare).not.toContain('<figcaption')
  })
})

// The page renders bodies through `RichText` with these converters. This is
// the path an image placed by the editor, or by the MCP tool, actually takes.
describe('an upload node in a rendered body', () => {
  it('renders as the figure, not as a bare img', () => {
    const html = renderToStaticMarkup(
      <RichText
        data={{ root: { type: 'root', children: [upload()] } } as never}
        converters={buildConverters(false)}
        disableContainer
      />,
    )
    expect(html).toContain('<figure class="article__figure body-figure">')
    expect(html).toContain('<figcaption>')
  })
})
