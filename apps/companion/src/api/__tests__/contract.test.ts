import {
  BLOCK_TYPES,
  BodyNodeSchema,
  PostDetailSchema,
  markUnsupported,
  type BodyNode,
} from '../contract'
import { BLOCK_SLUGS } from '../../generated/block-slugs'
import {
  blockFixtures,
  imageFixture,
  linkParagraph,
  unknownBlockFixture,
  unknownNodeFixture,
} from '../../fixtures/blocks'
import { fixturePosts } from '../../fixtures/posts'

const SITE = 'https://www.beyondeveryart.com'

/**
 * Parsing strips keys the schema does not name, so a value that survives a
 * parse unchanged carried nothing outside the contract.
 */
const expectExactlyTheContract = (
  schema: typeof BodyNodeSchema,
  value: unknown,
) => expect(schema.parse(value)).toEqual(value)

describe('the contract', () => {
  it('describes exactly the blocks the website renders', () => {
    // BLOCK_SLUGS is generated from blocks/schema.ts; BLOCK_TYPES is the
    // contract's own list. A block added on the website fails here until the
    // contract says what the API sends for it.
    expect([...BLOCK_TYPES]).toEqual([...BLOCK_SLUGS])
  })
})

describe('block fixtures', () => {
  const fixtures = blockFixtures(SITE)

  it('covers every block type', () => {
    expect(Object.keys(fixtures).sort()).toEqual([...BLOCK_SLUGS].sort())
  })

  it.each(Object.entries(fixtures))(
    '%s validates against the contract',
    (_, node) => {
      expectExactlyTheContract(BodyNodeSchema, node)
      expect((node as Extract<BodyNode, { type: 'block' }>).type).toBe('block')
    },
  )

  it('validates internal links, external links and images', () => {
    expectExactlyTheContract(BodyNodeSchema, linkParagraph(SITE))
    expectExactlyTheContract(BodyNodeSchema, imageFixture)
  })

  it('rejects a block type it does not know', () => {
    expect(BodyNodeSchema.safeParse(unknownBlockFixture).success).toBe(false)
  })

  it('rejects a node type it does not know', () => {
    expect(BodyNodeSchema.safeParse(unknownNodeFixture).success).toBe(false)
  })

  it('marks an unknown block, keeping its name for diagnostics', () => {
    expect(BodyNodeSchema.parse(markUnsupported(unknownBlockFixture))).toEqual({
      type: 'unsupported',
      nodeType: 'block',
      blockType: 'carousel',
    })
  })

  it('marks an unknown node type', () => {
    expect(BodyNodeSchema.parse(markUnsupported(unknownNodeFixture))).toEqual({
      type: 'unsupported',
      nodeType: 'table',
      blockType: null,
    })
  })

  it('marks an unknown inline node without losing its paragraph', () => {
    const paragraph = {
      type: 'paragraph',
      children: [
        { type: 'text', text: 'kept', format: 0 },
        { type: 'mention', id: 4 },
      ],
    }
    expect(BodyNodeSchema.parse(markUnsupported(paragraph))).toEqual({
      type: 'paragraph',
      children: [
        { type: 'text', text: 'kept', format: 0 },
        { type: 'unsupported', nodeType: 'mention', blockType: null },
      ],
    })
  })

  it('still rejects a known type with the wrong shape', () => {
    // A newer server is tolerated; a broken one is not.
    const broken = { type: 'heading', tag: 'h9', children: [] }
    expect(BodyNodeSchema.safeParse(markUnsupported(broken)).success).toBe(
      false,
    )
  })

  it('refuses a link that is not http(s) or mailto', () => {
    const scripted = {
      type: 'paragraph',
      children: [
        {
          type: 'link',
          href: 'javascript:alert(1)',
          children: [{ type: 'text', text: 'x', format: 0 }],
        },
      ],
    }
    expect(BodyNodeSchema.safeParse(scripted).success).toBe(false)
  })

  it('refuses a credit link that is not https', () => {
    const media = {
      type: 'upload',
      media: {
        ...(imageFixture as { media: object }).media,
        creditHref: 'http://unsplash.com/@x',
      },
    }
    expect(BodyNodeSchema.safeParse(media).success).toBe(false)
  })
})

describe('fixture posts', () => {
  it.each(fixturePosts(SITE).map((post) => [post.slug, post] as const))(
    '%s validates against the contract',
    (_, post) => {
      const prepared = { ...post, body: markUnsupported(post.body) }
      expect(PostDetailSchema.parse(prepared)).toEqual(prepared)
    },
  )

  it('carries the website’s teaser, and only the teaser, for gated posts', () => {
    for (const post of fixturePosts(SITE)) {
      expect(post.restricted).toBe(post.visibility !== 'public')
    }
  })
})
