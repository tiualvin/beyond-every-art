// The allow-list between Payload's documents and what a client is sent.
//
// The post reader runs at depth 2 with overrideAccess, so the raw body below is
// shaped the way it arrives: an internal link's `doc.value` is the whole post
// it points at — here a members-only one, carrying its full body, its owners
// and its last editor — an upload's value is the whole media row, a signup's
// campaign is the whole campaign. The projection must build its output from
// the contract's own field list and copy none of that.

import { describe, expect, it } from 'vitest'

import { BLOCK_SLUGS } from '../../blocks/schema'
import {
  BodySchema,
  type BlockFields,
  type Body,
  type BodyNode,
} from '../../lib/app-api/contract'
import {
  projectBody,
  projectHref,
  projectMediaDoc,
} from '../../lib/app-api/project'
import type { BodyRoot } from '../../lib/content/body'

const SITE = 'https://www.beyondeveryart.com'
const NOW = new Date('2026-10-16T09:00:00.000Z')
const context = { siteUrl: SITE, now: NOW }

/** Strings that exist only in places a client must never see. */
const SECRETS = [
  'SECRET_MEMBERS_BODY',
  'SECRET_LEGACY_HTML',
  'owner@secret.test',
  'editor@secret.test',
  'SECRET_CAMPAIGN_NOTE',
  'SECRET_OBJECT_KEY',
  'secret-original-filename.jpg',
  'https://old-ghost.example/content/images/secret.jpg',
  'SECRET_BLOCK_NAME',
  'SECRET_RELATED_POST',
  'SECRET_DRAFT_TITLE',
]

const owner = {
  id: 7,
  email: 'owner@secret.test',
  role: 'admin',
  name: 'Owner',
}

/** A media row as Payload returns it: far more than the eight keys sent. */
const mediaRow = (name: string) => ({
  id: 41,
  alt: `A ${name}`,
  caption: 'Caption kept on the media row',
  credit: 'Photo by A. Photographer / Unsplash',
  creditURL: 'https://unsplash.com/@photographer',
  filename: 'secret-original-filename.jpg',
  mimeType: 'image/jpeg',
  filesize: 123456,
  width: 2400,
  height: 1600,
  focalX: 50,
  focalY: 50,
  url: `/api/media/file/${name}.jpg`,
  thumbnailURL: null,
  aiGenerated: false,
  ghostURL: 'https://old-ghost.example/content/images/secret.jpg',
  migrationStatus: 'migrated',
  _objectKey: 'SECRET_OBJECT_KEY',
  sizes: {
    card: {
      url: `/api/media/file/${name}-768x512.jpg`,
      width: 768,
      height: 512,
    },
    og: {
      url: `/api/media/file/${name}-1200x630.jpg`,
      width: 1200,
      height: 630,
    },
  },
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
})

const richText = (...children: unknown[]) => ({
  root: {
    type: 'root',
    direction: 'ltr',
    format: '',
    indent: 0,
    version: 1,
    children,
  },
})

const textNode = (text: string, format = 0) => ({
  type: 'text',
  text,
  format,
  detail: 0,
  mode: 'normal',
  style: 'color: red',
  version: 1,
})

const paragraph = (...children: unknown[]) => ({
  type: 'paragraph',
  children,
  direction: 'ltr',
  format: '',
  indent: 0,
  textFormat: 0,
  textStyle: '',
  version: 1,
})

/** A members-only post, populated whole, as an internal link's target. */
const gatedPost = {
  id: 99,
  title: 'A members-only post',
  slug: 'members-only-post',
  _status: 'published',
  publishedAt: '2025-01-01T00:00:00.000Z',
  visibility: 'members',
  excerpt: 'Its excerpt.',
  content: richText(paragraph(textNode('SECRET_MEMBERS_BODY'))),
  legacyHTML: '<p>SECRET_LEGACY_HTML</p>',
  owners: [owner],
  lastEditedBy: { id: 8, email: 'editor@secret.test' },
  reviewState: 'approved',
}

const draftPost = {
  ...gatedPost,
  id: 100,
  slug: 'a-draft',
  title: 'SECRET_DRAFT_TITLE',
  _status: 'draft',
}

const scheduledPost = {
  ...gatedPost,
  id: 101,
  slug: 'a-scheduled-post',
  publishedAt: '2026-12-01T00:00:00.000Z',
}

const trashedPost = {
  ...gatedPost,
  id: 102,
  slug: 'trashed',
  deletedAt: '2026-01-01T00:00:00.000Z',
}

const internalLink = (doc: unknown, words: string, relationTo = 'posts') => ({
  type: 'link',
  version: 3,
  fields: {
    linkType: 'internal',
    newTab: false,
    doc: { relationTo, value: doc },
  },
  children: [textNode(words)],
})

const customLink = (url: string, words: string) => ({
  type: 'link',
  version: 3,
  fields: { linkType: 'custom', newTab: true, url },
  children: [textNode(words)],
})

const block = (fields: Record<string, unknown>) => ({
  type: 'block',
  version: 2,
  format: '',
  fields: { id: '65f0c0ffee', blockName: 'SECRET_BLOCK_NAME', ...fields },
})

/** Every block type, populated the way depth 2 populates it. */
const BLOCKS: Record<string, Record<string, unknown>> = {
  accordion: {
    blockType: 'accordion',
    heading: 'Panels',
    items: [
      {
        id: 'a1',
        title: 'Open',
        defaultOpen: true,
        content: richText(paragraph(textNode('Panel one'))),
      },
      { id: 'a2', title: '', content: richText() },
    ],
  },
  pullQuote: {
    blockType: 'pullQuote',
    quote: 'A quotation.',
    attribution: 'Someone',
    sourceURL: 'javascript:alert(1)',
    variant: 'large',
  },
  signup: {
    blockType: 'signup',
    heading: 'Fallback heading',
    body: 'Fallback body',
    submitLabel: 'Join',
    campaign: {
      id: 3,
      slug: 'autumn',
      heading: 'Campaign heading',
      body: 'Campaign body',
      active: true,
      internalNote: 'SECRET_CAMPAIGN_NOTE',
      createdBy: owner,
    },
  },
  callout: {
    blockType: 'callout',
    emoji: '🎨',
    tone: 'dark',
    content: richText(paragraph(textNode('An aside'))),
  },
  button: {
    blockType: 'button',
    label: 'Read on',
    href: '/journal/',
    relationship: 'sponsored',
    variant: 'primary',
    align: 'center',
  },
  gallery: {
    blockType: 'gallery',
    layout: 'rows',
    caption: 'Two images',
    items: [
      { id: 'g1', image: mediaRow('first'), caption: 'First' },
      { id: 'g2', image: 42, caption: 'An id that was never populated' },
    ],
  },
  bookmark: {
    blockType: 'bookmark',
    url: 'https://example.com/essay',
    title: 'An essay',
    description: 'Elsewhere.',
    publisher: 'Example',
    relationship: 'normal',
    image: mediaRow('thumb'),
  },
  embed: {
    blockType: 'embed',
    url: 'https://youtu.be/abcdef12345',
    title: 'A video',
  },
  paywall: { blockType: 'paywall', note: 'Editors only' },
  keyTakeaways: {
    blockType: 'keyTakeaways',
    heading: '',
    items: [
      { id: 'k1', text: 'One' },
      { id: 'k2', text: '  ' },
    ],
  },
  faq: {
    blockType: 'faq',
    heading: '',
    items: [
      {
        id: 'f1',
        question: 'Why?',
        answer: richText(paragraph(internalLink(gatedPost, 'because'))),
      },
    ],
  },
  featureList: {
    blockType: 'featureList',
    heading: 'Steps',
    intro: null,
    variant: 'steps',
    numbered: false,
    items: [
      { id: 'l1', title: 'First', body: 'Do it.', image: mediaRow('step') },
    ],
  },
  mediaText: {
    blockType: 'mediaText',
    image: mediaRow('side'),
    heading: 'Beside',
    body: richText(paragraph(textNode('Words'))),
    imageSide: 'right',
  },
  comparisonTable: {
    blockType: 'comparisonTable',
    caption: 'Compared',
    rowHeader: 'Pigment',
    columns: [{ id: 'c1', label: 'Binder' }],
    rows: [
      {
        id: 'r1',
        label: '*Ultramarine*',
        cells: [
          {
            id: 'v1',
            value:
              '**oil**, [source](/members-only-post/) and [x](javascript:alert(1))',
          },
        ],
      },
    ],
  },
  keyFacts: {
    blockType: 'keyFacts',
    heading: 'At a glance',
    items: [{ id: 'f', label: 'Binder', value: 'Oil' }],
  },
}

/** The whole body, as `getPostBySlug` hands it over. */
const rawBody = richText(
  {
    type: 'heading',
    tag: 'h2',
    children: [textNode('A section')],
    direction: 'ltr',
    format: '',
    indent: 0,
    version: 1,
  },
  paragraph(
    textNode('bold and unknown bits', 1 | 2 | 1024),
    { type: 'linebreak', version: 1 },
    { type: 'tab', text: '\t', format: 0, version: 1 },
    internalLink(gatedPost, 'a gated post'),
    internalLink(draftPost, 'a draft'),
    internalLink(scheduledPost, 'a scheduled post'),
    internalLink(trashedPost, 'a trashed post'),
    internalLink(17, 'an unpopulated id'),
    internalLink(gatedPost, 'a page', 'pages'),
    customLink('/an-essay-on-blue/', 'relative'),
    customLink('https://beyondeveryart.com/tag/materials/', 'a tag archive'),
    customLink('/journal/', 'the journal'),
    customLink('https://example.com/x', 'external'),
    customLink('mailto:editor@example.com', 'email'),
    customLink('javascript:alert(1)', 'script'),
    customLink('#section', 'anchor'),
    {
      type: 'autolink',
      fields: { linkType: 'custom', url: 'https://example.com/auto' },
      children: [textNode('auto')],
    },
    { type: 'mention', children: [textNode('SECRET_RELATED_POST')] },
  ),
  {
    type: 'list',
    listType: 'check',
    start: 1,
    tag: 'ul',
    version: 1,
    children: [
      {
        type: 'listitem',
        value: 1,
        checked: true,
        children: [textNode('done')],
      },
      {
        type: 'listitem',
        value: 2,
        children: [
          {
            type: 'list',
            listType: 'number',
            start: 3,
            tag: 'ol',
            children: [
              { type: 'listitem', value: 3, children: [textNode('nested')] },
            ],
          },
        ],
      },
    ],
  },
  { type: 'quote', children: [textNode('quoted')] },
  { type: 'horizontalrule', version: 1 },
  {
    type: 'upload',
    relationTo: 'media',
    value: mediaRow('upload'),
    fields: { alt: 'An override' },
    version: 3,
  },
  { type: 'upload', relationTo: 'media', value: 55, version: 3 },
  {
    type: 'relationship',
    relationTo: 'posts',
    value: { ...gatedPost, title: 'SECRET_RELATED_POST' },
  },
  { type: 'table', children: [] },
  block({ blockType: 'carousel', slides: [] }),
  ...Object.values(BLOCKS).map(block),
)

const projected = projectBody(
  { kind: 'lexical', content: rawBody as unknown as BodyRoot },
  context,
)
const serialised = JSON.stringify(projected)

function nodesOf(body: Body): BodyNode[] {
  return body.kind === 'lexical' ? body.nodes : []
}

function blocksOf(body: Body): BlockFields[] {
  return nodesOf(body).flatMap((node) =>
    node.type === 'block' ? [node.fields] : [],
  )
}

describe('the projection allow-list', () => {
  it('produces only keys the contract names', () => {
    // Parsing strips keys a schema does not name, so a body that survives a
    // parse unchanged had none.
    expect(BodySchema.parse(projected)).toEqual(projected)
  })

  it.each(SECRETS)('never carries %s', (secret) => {
    expect(serialised).not.toContain(secret)
  })

  it('never carries a populated document, a block id, or Lexical bookkeeping', () => {
    for (const key of [
      '"owners"',
      '"lastEditedBy"',
      '"visibility"',
      '"blockName"',
      '"version"',
      '"direction"',
      '"mimeType"',
      '"filename"',
      '"id"',
      '"style"',
    ]) {
      expect(serialised).not.toContain(key)
    }
  })

  it('sends no marker a client would put in for an unknown node', () => {
    expect(serialised).not.toContain('unsupported')
  })

  it('projects every block type except the members-only cut', () => {
    expect(blocksOf(projected).map((fields) => fields.blockType)).toEqual(
      BLOCK_SLUGS.filter((slug) => slug !== 'paywall'),
    )
  })
})

describe('links', () => {
  const inline = (
    nodesOf(projected)[1] as Extract<BodyNode, { type: 'paragraph' }>
  ).children

  it('links a live post by slug and canonical URL only, not by what it carries', () => {
    expect(inline).toContainEqual({
      type: 'internalLink',
      slug: 'members-only-post',
      href: `${SITE}/members-only-post/`,
      children: [{ type: 'text', text: 'a gated post', format: 0 }],
    })
  })

  it('unlinks a draft, a scheduled post, a trashed post and an unpopulated id', () => {
    for (const words of [
      'a draft',
      'a scheduled post',
      'a trashed post',
      'an unpopulated id',
    ]) {
      expect(inline).toContainEqual({ type: 'text', text: words, format: 0 })
    }
  })

  it('sends a site path as an internal link, and a website route as an ordinary one', () => {
    expect(inline).toContainEqual(
      expect.objectContaining({
        type: 'internalLink',
        slug: 'an-essay-on-blue',
      }),
    )
    expect(inline).toContainEqual(
      expect.objectContaining({
        type: 'link',
        href: 'https://beyondeveryart.com/tag/materials/',
      }),
    )
    expect(inline).toContainEqual(
      expect.objectContaining({ type: 'link', href: `${SITE}/journal/` }),
    )
  })

  it('keeps web and email links, and turns anything else into its words', () => {
    expect(inline).toContainEqual(
      expect.objectContaining({ type: 'link', href: 'https://example.com/x' }),
    )
    expect(inline).toContainEqual(
      expect.objectContaining({
        type: 'link',
        href: 'mailto:editor@example.com',
      }),
    )
    expect(inline).toContainEqual(
      expect.objectContaining({
        type: 'link',
        href: 'https://example.com/auto',
      }),
    )
    expect(inline).toContainEqual({ type: 'text', text: 'script', format: 0 })
    expect(inline).toContainEqual({ type: 'text', text: 'anchor', format: 0 })
    expect(serialised).not.toContain('javascript:')
  })

  it('keeps only the format bits Lexical defines', () => {
    expect(inline[0]).toEqual({
      type: 'text',
      text: 'bold and unknown bits',
      format: 3,
    })
  })

  it('drops a node type the contract does not name, and its text', () => {
    expect(serialised).not.toContain('mention')
  })
})

describe('media', () => {
  const upload = nodesOf(projected).find((node) => node.type === 'upload')

  it('sends exactly eight keys, with absolute URLs', () => {
    expect(upload).toEqual({
      type: 'upload',
      media: {
        url: `${SITE}/api/media/file/upload.jpg`,
        alt: 'An override',
        width: 2400,
        height: 1600,
        cardUrl: `${SITE}/api/media/file/upload-768x512.jpg`,
        ogUrl: `${SITE}/api/media/file/upload-1200x630.jpg`,
        credit: 'Photo by A. Photographer / Unsplash',
        creditHref:
          'https://unsplash.com/@photographer?utm_source=beyond_every_art&utm_medium=referral',
      },
    })
  })

  it('leaves out an upload that was never populated', () => {
    expect(
      nodesOf(projected).filter((node) => node.type === 'upload'),
    ).toHaveLength(1)
  })

  it('keeps an absolute URL, as object storage serves it', () => {
    const media = projectMediaDoc(
      { ...mediaRow('x'), url: 'https://media.example.com/x.jpg' },
      SITE,
    )
    expect(media?.url).toBe('https://media.example.com/x.jpg')
  })

  it('refuses a credit link that is not https', () => {
    expect(
      projectMediaDoc(
        { ...mediaRow('x'), creditURL: 'javascript:alert(1)' },
        SITE,
      )?.creditHref,
    ).toBeNull()
  })
})

describe('blocks', () => {
  const byType = Object.fromEntries(
    blocksOf(projected).map((fields) => [fields.blockType, fields]),
  )

  it('drops an accordion panel with no title', () => {
    expect(byType.accordion).toMatchObject({
      items: [{ title: 'Open', defaultOpen: true }],
    })
  })

  it('refuses a pull quote source that is not https', () => {
    expect(byType.pullQuote).toMatchObject({
      sourceHref: null,
      variant: 'large',
    })
  })

  it('sends a live campaign’s copy and a link to the newsletter page, never the campaign', () => {
    expect(byType.signup).toEqual({
      blockType: 'signup',
      heading: 'Campaign heading',
      body: 'Campaign body',
      href: `${SITE}/newsletter/`,
    })
  })

  it('makes a relative button link absolute, and drops its rel', () => {
    expect(byType.button).toEqual({
      blockType: 'button',
      label: 'Read on',
      href: `${SITE}/journal/`,
      variant: 'primary',
      align: 'center',
    })
  })

  it('drops a gallery item whose image was never populated', () => {
    expect(byType.gallery).toMatchObject({ items: [{ caption: 'First' }] })
  })

  it('names the provider an embed resolves to', () => {
    expect(byType.embed).toMatchObject({
      href: 'https://youtu.be/abcdef12345',
      provider: 'youtube',
    })
  })

  it('defaults empty headings the way the website does', () => {
    expect(byType.keyTakeaways).toMatchObject({
      heading: 'Key takeaways',
      items: ['One'],
    })
    expect(byType.faq).toMatchObject({ heading: 'Frequently asked questions' })
  })

  it('parses table cells as inline Markdown, through the same link policy', () => {
    const rows = (
      byType.comparisonTable as Extract<
        BlockFields,
        { blockType: 'comparisonTable' }
      >
    ).rows
    expect(rows[0]!.label).toEqual([
      { type: 'text', text: 'Ultramarine', format: 2 },
    ])
    expect(rows[0]!.cells[0]).toContainEqual({
      type: 'text',
      text: 'oil',
      format: 1,
    })
    expect(rows[0]!.cells[0]).toContainEqual(
      expect.objectContaining({
        type: 'internalLink',
        slug: 'members-only-post',
      }),
    )
  })
})

describe('a comparison table', () => {
  const tableOf = (fields: Record<string, unknown>) => {
    const [table] = blocksOf(
      projectBody(
        {
          kind: 'lexical',
          content: richText(
            block({ blockType: 'comparisonTable', ...fields }),
          ) as unknown as BodyRoot,
        },
        context,
      ),
    )
    return table as Extract<BlockFields, { blockType: 'comparisonTable' }>
  }

  it('sends only what the website draws: no blank column or row, one cell per column', () => {
    // A column deleted in the editor leaves its cell in every row, because
    // columns and cells are separate arrays; the page never shows it.
    const table = tableOf({
      caption: 'Compared',
      columns: [
        { id: 'c1', label: 'Hue' },
        { id: 'c2', label: '   ' },
        { id: 'c3', label: 'Lightfastness' },
      ],
      rows: [
        {
          id: 'r1',
          label: ' Ultramarine ',
          cells: [
            { id: 'v1', value: 'Blue' },
            { id: 'v2', value: 'I' },
            { id: 'v3', value: 'SECRET_DELETED_COLUMN_CELL' },
          ],
        },
        {
          id: 'r2',
          label: '   ',
          cells: [{ id: 'v4', value: 'SECRET_BLANK_ROW_CELL' }],
        },
        { id: 'r3', label: 'Half filled', cells: [{ id: 'v5', value: 'Red' }] },
      ],
    })

    expect(table.columns).toEqual(['Hue', 'Lightfastness'])
    expect(table.rows.map((row) => row.cells.length)).toEqual([2, 2])
    expect(table.rows[0]!.label).toEqual([
      { type: 'text', text: 'Ultramarine', format: 0 },
    ])
    expect(table.rows[1]!.cells[1]).toEqual([])
    expect(JSON.stringify(table)).not.toContain('SECRET')
  })

  it('is not sent when no column or no row survives', () => {
    expect(
      tableOf({
        columns: [{ id: 'c1', label: ' ' }],
        rows: [{ id: 'r1', label: 'Row', cells: [{ id: 'v1', value: 'x' }] }],
      }),
    ).toBeUndefined()
    expect(
      tableOf({
        columns: [{ id: 'c1', label: 'Hue' }],
        rows: [{ id: 'r1', label: ' ', cells: [{ id: 'v1', value: 'x' }] }],
      }),
    ).toBeUndefined()
  })
})

describe('bodies that are not rich text', () => {
  it('passes processed legacy HTML through as it is', () => {
    expect(
      projectBody({ kind: 'html', html: '<p>teaser</p>' }, context),
    ).toEqual({
      kind: 'html',
      html: '<p>teaser</p>',
    })
  })

  it('calls a body empty when nothing in it survives', () => {
    expect(
      projectBody(
        {
          kind: 'lexical',
          content: richText({ type: 'table' }) as unknown as BodyRoot,
        },
        context,
      ),
    ).toEqual({
      kind: 'empty',
    })
  })
})

describe('projectHref', () => {
  it('reads the apex and www as the same site', () => {
    expect(projectHref('https://beyondeveryart.com/a-post', SITE)).toEqual({
      kind: 'internal',
      slug: 'a-post',
      href: `${SITE}/a-post/`,
    })
  })
})
