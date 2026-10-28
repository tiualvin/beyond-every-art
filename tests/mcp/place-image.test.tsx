// `placeImage`: an existing Media image into an article's body, under a
// heading, as a draft. The contract follows `setKeyFactsBlock`: place by
// heading, touch nothing else, save a draft as the key's own user, refuse
// what would replace a migrated article.

import { RichText } from '@payloadcms/richtext-lexical/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { buildConverters } from '../../app/(frontend)/components/blocks/registry'
import { mcpTools } from '../../lib/mcp/tools'
import { mcpRequest } from '../support/mcp-request'

type Node = Record<string, unknown> & { type: string; children?: Node[] }

const text = (value: string): Node => ({
  type: 'text',
  detail: 0,
  format: 0,
  mode: 'normal',
  style: '',
  text: value,
  version: 1,
})
const paragraph = (value: string): Node => ({
  type: 'paragraph',
  version: 1,
  format: '',
  indent: 0,
  direction: null,
  textFormat: 0,
  textStyle: '',
  children: [text(value)],
})
const heading = (value: string): Node => ({
  type: 'heading',
  tag: 'h2',
  version: 1,
  format: '',
  indent: 0,
  direction: null,
  children: [text(value)],
})
const body = (...children: Node[]) => ({
  root: {
    type: 'root',
    version: 1,
    format: '',
    indent: 0,
    direction: null,
    children,
  },
})
const children = (content: unknown) =>
  (content as ReturnType<typeof body>).root.children
const types = (content: unknown) => children(content).map((node) => node.type)

const cabinet = {
  id: 7,
  filename: 'pigment-cabinet.jpg',
  url: '/api/media/file/pigment-cabinet.jpg',
  alt: 'A cabinet of pigment jars',
  width: 1400,
  height: 1750,
  caption: 'The cabinet, from the front.',
  credit: 'Photo by Ana Ruiz / Unsplash',
}

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

/** An article, plus a Media library holding `media`, found by id. */
async function article(doc: Record<string, unknown>, media = [cabinet]) {
  const setup = await mcpRequest({ id: 1, slug: 'cabinets', ...doc })
  const read = setup.payload.findByID.getMockImplementation()!
  setup.payload.findByID.mockImplementation((async (args: {
    collection?: string
    id?: unknown
  }) => {
    if (args?.collection !== 'media') return read()
    const found = media.find((item) => String(item.id) === String(args.id))
    if (!found) throw new Error('Not Found')
    return found
  }) as never)
  return setup
}

describe('placeImage', () => {
  const original = () =>
    body(
      paragraph('Intro.'),
      heading('The cabinet'),
      paragraph('Under it.'),
      heading('The drawers'),
    )

  it('places the image directly under the heading and leaves the rest alone', async () => {
    const before = original()
    const { req, payload, current } = await article({
      content: structuredClone(before),
    })

    const result = await call(
      'placeImage',
      {
        id: '1',
        afterHeading: 'The cabinet',
        mediaId: '7',
        caption: 'Whites, for comparison.',
      },
      req,
    )

    expect(types(current().content)).toEqual([
      'paragraph',
      'heading',
      'upload',
      'paragraph',
      'heading',
    ])
    const written = children(current().content)
    expect([written[0], written[1], written[3], written[4]]).toEqual(
      children(before),
    )
    expect(written[2]).toMatchObject({
      type: 'upload',
      relationTo: 'media',
      value: 7,
      fields: { caption: 'Whites, for comparison.' },
    })

    // A draft, as the key's own user — never a publish.
    expect(payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        draft: true,
        overrideAccess: false,
        data: expect.objectContaining({ _status: 'draft' }),
      }),
    )
    expect(result).toMatchObject({
      placement: 'inserted',
      afterHeading: 'The cabinet',
      status: 'draft',
      image: {
        mediaId: 7,
        caption: 'Whites, for comparison.',
        credit: 'Photo by Ana Ruiz / Unsplash',
        markdown: '![media:7]()',
      },
    })
    expect(result).not.toHaveProperty('note')
  })

  // A retried call must not put the picture on the page twice.
  it('updates the same image under the same heading instead of placing it twice', async () => {
    const { req, current } = await article({ content: original() })

    await call(
      'placeImage',
      { id: '1', afterHeading: 'The cabinet', mediaId: '7', caption: 'One.' },
      req,
    )
    const first = children(current().content)[2]
    const result = await call(
      'placeImage',
      {
        id: '1',
        afterHeading: 'The cabinet',
        mediaId: '7',
        credit: 'Courtesy the Forbes',
      },
      req,
    )

    expect(types(current().content).filter((t) => t === 'upload')).toHaveLength(
      1,
    )
    const second = children(current().content)[2]
    expect(second.id).toBe(first.id)
    // The call describes the placement: a caption left out is a caption
    // removed, so the figure falls back to the image's own.
    expect(second.fields).toEqual({ credit: 'Courtesy the Forbes' })
    expect(result).toMatchObject({
      placement: 'updated',
      image: { caption: cabinet.caption, credit: 'Courtesy the Forbes' },
    })
  })

  // Bodies are elided from MCP responses and an image's Markdown is the bare
  // `![media:id]()`, so this list is the only place a caption is visible.
  it('is reported by readArticleMarkdown with its own caption and credit', async () => {
    const { req } = await article({ content: original() })
    await call(
      'placeImage',
      { id: '1', afterHeading: 'The cabinet', mediaId: '7', caption: 'Here.' },
      req,
    )

    const read = await call('readArticleMarkdown', { id: '1' }, req)
    expect(read.images).toEqual([
      {
        afterHeading: 'The cabinet',
        caption: 'Here.',
        credit: null,
        markdown: '![media:7]()',
        mediaId: '7',
      },
    ])
    expect(String(read.markdown)).toContain('![media:7]()')
  })

  it('leaves the read of an article without images exactly as it was', async () => {
    const { req } = await article({ content: original() })
    const read = await call('readArticleMarkdown', { id: '1' }, req)
    expect(read).not.toHaveProperty('images')
  })

  it('refuses an article that still renders from migrated Ghost HTML', async () => {
    const { req, payload } = await article({
      legacyHTML: '<p>The migrated body.</p>',
      content: null,
    })

    await expect(
      call(
        'placeImage',
        { id: '1', afterHeading: 'The cabinet', mediaId: '7' },
        req,
      ),
    ).rejects.toThrow(/renders from migrated Ghost HTML/)
    expect(payload.update).not.toHaveBeenCalled()
  })

  it('refuses a heading the body does not have, naming the ones it does', async () => {
    const { req, payload } = await article({ content: original() })

    await expect(
      call(
        'placeImage',
        { id: '1', afterHeading: 'The shelves', mediaId: '7' },
        req,
      ),
    ).rejects.toThrow(
      /No heading in the body reads "The shelves".*"The cabinet", "The drawers"/,
    )
    expect(payload.update).not.toHaveBeenCalled()
  })

  it('refuses an image the library does not have', async () => {
    const { req, payload } = await article({ content: original() })

    await expect(
      call(
        'placeImage',
        { id: '1', afterHeading: 'The cabinet', mediaId: '99' },
        req,
      ),
    ).rejects.toThrow(/No image in the Media library has id `99`/)
    expect(payload.update).not.toHaveBeenCalled()
  })

  it('says so when the image will show with no credit at all', async () => {
    const { req } = await article({ content: original() }, [
      { ...cabinet, credit: null as unknown as string },
    ])

    const result = await call(
      'placeImage',
      { id: '1', afterHeading: 'The cabinet', mediaId: '7' },
      req,
    )
    expect(result.note).toMatch(/no credit/)
  })

  it('refuses a caption that is a paragraph', async () => {
    const { req, payload } = await article({ content: original() })

    await expect(
      call(
        'placeImage',
        {
          id: '1',
          afterHeading: 'The cabinet',
          mediaId: '7',
          caption: 'word '.repeat(80),
        },
        req,
      ),
    ).rejects.toThrow(/keep it to 300/)
    expect(payload.update).not.toHaveBeenCalled()
  })

  // What the page does with what the tool wrote, once Payload populates the
  // upload as the article read does.
  it('writes a node the page renders as a captioned, credited figure', async () => {
    const { req, current } = await article({ content: original() })
    await call(
      'placeImage',
      { id: '1', afterHeading: 'The cabinet', mediaId: '7', caption: 'Here.' },
      req,
    )

    const placed = children(current().content).map((node) =>
      node.type === 'upload' ? { ...node, value: cabinet } : node,
    )
    const html = renderToStaticMarkup(
      <RichText
        data={body(...placed) as never}
        converters={buildConverters(false)}
        disableContainer
      />,
    )
    expect(html).toContain('<figure class="article__figure body-figure">')
    expect(html).toContain(
      '<figcaption>Here.<span class="article__figure-credit">Photo by Ana Ruiz / Unsplash</span></figcaption>',
    )
  })
})
