import { describe, expect, it } from 'vitest'

import { mcpTools } from '../../lib/mcp/tools'
import { collectBlockJsonLd } from '../../lib/seo/block-jsonld'
import { mcpRequest } from '../support/mcp-request'

// The drafting tools, run for real against the real `content` editor. Only the
// database is stubbed — see `tests/support/mcp-request.ts`.

type Node = Record<string, unknown> & { type: string; children?: Node[] }

const text = (value: string): Node => ({
  type: 'text',
  version: 1,
  text: value,
  format: 0,
  mode: 'normal',
  style: '',
  detail: 0,
})

const paragraph = (value: string): Node => ({
  type: 'paragraph',
  version: 1,
  format: '',
  indent: 0,
  direction: 'ltr',
  textFormat: 0,
  textStyle: '',
  children: [text(value)],
})

const heading = (value: string, tag = 'h2'): Node => ({
  type: 'heading',
  tag,
  version: 1,
  format: '',
  indent: 0,
  direction: 'ltr',
  children: [text(value)],
})

const block = (
  blockType: string,
  fields: Record<string, unknown> = {},
  id: string | null = '65f0c0ffee0000000000abcd',
): Node => ({
  type: 'block',
  version: 2,
  format: '',
  fields: { ...(id ? { id } : {}), blockName: '', blockType, ...fields },
})

const facts = {
  items: [
    { id: 'row1', label: 'Insect', value: 'Dactylopius coccus' },
    { id: 'row2', label: 'Yield', value: '~70,000 insects per lb' },
  ],
}

const upload = (value: number): Node => ({
  type: 'upload',
  version: 3,
  format: '',
  id: 'upload-node',
  fields: null,
  relationTo: 'media',
  value,
})

const body = (...children: Node[]) => ({
  root: {
    type: 'root',
    version: 1,
    format: '',
    indent: 0,
    direction: 'ltr',
    children,
  },
})

type Body = ReturnType<typeof body>

const types = (state: unknown) =>
  (state as Body).root.children.map((node) => node.type)

async function call(
  name: string,
  args: Record<string, unknown>,
  req: Awaited<ReturnType<typeof mcpRequest>>['req'],
) {
  const tool = mcpTools.find((candidate) => candidate.name === name)
  if (!tool) throw new Error(`No tool named ${name}`)
  const result = (await tool.handler(args, req, undefined as never)) as {
    content: Array<{ text: string }>
  }
  return JSON.parse(result.content[0].text) as Record<string, unknown>
}

describe('reading and revising a body as Markdown', () => {
  it('reads the draft with its relationships left as ids', async () => {
    const { req, payload } = await mcpRequest({
      id: 1,
      content: body(paragraph('A body.')),
    })

    await call('readArticleMarkdown', { id: '1' }, req)

    expect(payload.findByID).toHaveBeenCalledWith(
      expect.objectContaining({ depth: 0, draft: true }),
    )
  })

  it('keeps an inline image through a read and a revision', async () => {
    // Populated, the image read as `![alt](url)`, which the converter does not
    // read back: the revision stored the line as text and dropped the image.
    const { req, payload, current } = await mcpRequest({
      id: 1,
      content: body(paragraph('Before.'), upload(7), paragraph('After.')),
    })
    // What Payload hands back when asked for any depth above zero.
    const stored = payload.findByID.getMockImplementation()!
    payload.findByID.mockImplementation(async (args?: { depth?: number }) => {
      const doc = await stored()
      if (args?.depth === 0) return doc
      const populated = structuredClone(doc)
      ;(populated.content as Body).root.children[1].value = {
        id: 7,
        alt: 'A cochineal colony',
        url: '/media/cochineal.jpg',
        mimeType: 'image/jpeg',
      }
      return populated
    })

    const { markdown } = await call('readArticleMarkdown', { id: '1' }, req)
    expect(markdown).toContain('![media:7]()')

    await call('updateArticleMarkdown', { id: '1', markdown }, req)

    expect(types(current().content)).toEqual([
      'paragraph',
      'upload',
      'paragraph',
    ])
    expect((current().content as Body).root.children[1]).toMatchObject({
      relationTo: 'media',
      value: 7,
    })
  })
})

describe('an article migrated from Ghost', () => {
  const legacyHTML = '<p>The migrated body.</p>'

  it('says so when the page renders from its Ghost HTML', async () => {
    const { req } = await mcpRequest({ id: 1, legacyHTML, content: null })

    const { markdown } = await call('readArticleMarkdown', { id: '1' }, req)

    expect(markdown).toMatch(/renders from migrated Ghost HTML/)
  })

  it('reads the rich-text body once that is what the page renders', async () => {
    // Rewritten in the editor since the import. The body wins over the HTML
    // whenever it holds anything, so this is the text a reader sees — and
    // telling the agent otherwise sent it away from the only edit that counts.
    const { req } = await mcpRequest({
      id: 1,
      legacyHTML,
      content: body(paragraph('Rewritten in the editor.')),
    })

    const { markdown } = await call('readArticleMarkdown', { id: '1' }, req)

    expect(markdown).toBe('Rewritten in the editor.')
  })
})

describe('modules in a body read as Markdown', () => {
  it('stands a marker in for each block, where it sits', async () => {
    // Without one, Payload writes every block as the words "Block Field".
    const { req } = await mcpRequest({
      id: 1,
      content: body(
        heading('The short answer'),
        block('keyFacts', facts),
        paragraph('After.'),
      ),
    })

    const { markdown } = await call('readArticleMarkdown', { id: '1' }, req)

    expect(markdown).toBe(
      '## The short answer\n\n' +
        '<!-- block:keyFacts:65f0c0ffee0000000000abcd -->\n\n' +
        'After.',
    )
    expect(markdown).not.toContain('Block Field')
  })

  it('lists what each block holds, and where', async () => {
    const { req } = await mcpRequest({
      id: 1,
      content: body(
        block('pullQuote', { quote: 'Before any heading.' }, 'aa11'),
        heading('The short answer'),
        paragraph('Intro.'),
        block('keyFacts', facts),
      ),
    })

    const { blocks } = await call('readArticleMarkdown', { id: '1' }, req)

    expect(blocks).toEqual([
      {
        key: 'aa11',
        blockType: 'pullQuote',
        marker: '<!-- block:pullQuote:aa11 -->',
        afterHeading: null,
        fields: {
          id: 'aa11',
          blockType: 'pullQuote',
          quote: 'Before any heading.',
        },
      },
      {
        key: '65f0c0ffee0000000000abcd',
        blockType: 'keyFacts',
        marker: '<!-- block:keyFacts:65f0c0ffee0000000000abcd -->',
        afterHeading: 'The short answer',
        fields: {
          id: '65f0c0ffee0000000000abcd',
          blockType: 'keyFacts',
          ...facts,
        },
      },
    ])
  })

  it('keys a block by position when its id cannot be a marker', async () => {
    // No id at all, or one the Markdown converter would escape.
    const { req } = await mcpRequest({
      id: 1,
      content: body(
        block('callout', {}, null),
        block('callout', {}, 'has_underscore'),
      ),
    })

    const { blocks, markdown } = await call(
      'readArticleMarkdown',
      { id: '1' },
      req,
    )

    expect((blocks as Array<{ key: string }>).map((b) => b.key)).toEqual([
      'n0',
      'n1',
    ])
    expect(markdown).toBe(
      '<!-- block:callout:n0 -->\n\n<!-- block:callout:n1 -->',
    )
  })

  it('reads without writing', async () => {
    const content = body(block('keyFacts', facts))
    const { req, payload, current } = await mcpRequest({ id: 1, content })

    await call('readArticleMarkdown', { id: '1' }, req)

    expect(payload.update).not.toHaveBeenCalled()
    expect(current().content).toEqual(body(block('keyFacts', facts)))
  })

  it('reports no blocks for a body without any', async () => {
    const { req } = await mcpRequest({ id: 1, content: body(paragraph('x')) })

    const { blocks } = await call('readArticleMarkdown', { id: '1' }, req)

    expect(blocks).toEqual([])
  })
})

describe('rich text inside a module, read back', () => {
  // A bold word, so the test shows Markdown and not merely plain text.
  const answer = () => ({
    ...body({
      ...paragraph(''),
      children: [
        text('The dried bodies of '),
        { ...text('females'), format: 1 },
        text('.'),
      ],
    }).root,
  })
  const richText = () => ({ root: answer() })

  it('reads an FAQ answer as Markdown, not as editor state', async () => {
    const { req } = await mcpRequest({
      id: 1,
      content: body(
        heading('FAQ'),
        block('faq', {
          heading: 'FAQ',
          items: [
            { id: 'q1', question: 'What is it made from?', answer: richText() },
          ],
        }),
      ),
    })

    const { blocks } = await call('readArticleMarkdown', { id: '1' }, req)

    expect(blocks).toEqual([
      expect.objectContaining({
        blockType: 'faq',
        fields: expect.objectContaining({
          heading: 'FAQ',
          items: [
            {
              id: 'q1',
              question: 'What is it made from?',
              answer: 'The dried bodies of **females**.',
            },
          ],
        }),
      }),
    ])
  })

  it('does the same for every module that holds rich text', async () => {
    const { req } = await mcpRequest({
      id: 1,
      content: body(block('callout', { tone: 'neutral', content: richText() })),
    })

    const { blocks } = await call('readArticleMarkdown', { id: '1' }, req)

    expect(
      (blocks as Array<{ fields: { content: unknown } }>)[0].fields.content,
    ).toBe('The dried bodies of **females**.')
  })

  it('reports a rich-text value it cannot read as stored, and reads the rest', async () => {
    // One malformed module must not hide every other one from a review.
    const { req } = await mcpRequest({
      id: 1,
      content: body(
        block('callout', { content: 'not editor state' }, 'aa11'),
        block('callout', { content: richText() }, 'bb22'),
      ),
    })

    const { blocks } = await call('readArticleMarkdown', { id: '1' }, req)

    expect(
      (blocks as Array<{ fields: { content: unknown } }>).map(
        (b) => b.fields.content,
      ),
    ).toEqual(['not editor state', 'The dried bodies of **females**.'])
  })

  it('leaves the stored document alone', async () => {
    const content = body(
      block('faq', {
        items: [{ id: 'q1', question: 'Q?', answer: richText() }],
      }),
    )
    const { req, current } = await mcpRequest({ id: 1, content })

    await call('readArticleMarkdown', { id: '1' }, req)

    const stored = (current().content as Body).root.children[0] as Node & {
      fields: { items: Array<{ answer: unknown }> }
    }
    expect(stored.fields.items[0].answer).toEqual(richText())
  })
})

describe('revising a body that holds modules', () => {
  const KEY = '65f0c0ffee0000000000abcd'
  const MARKER = `<!-- block:keyFacts:${KEY} -->`

  const article = () =>
    mcpRequest({
      id: 1,
      content: body(
        heading('The short answer'),
        block('keyFacts', facts),
        paragraph('After.'),
      ),
    })

  const stored = (content: unknown) => (content as Body).root.children

  it('puts each module back exactly as it was after a read and a revision', async () => {
    // Before, a module came back as a paragraph reading "Block Field", which
    // would have published.
    const { req, current } = await article()
    const before = structuredClone(stored(current().content)[1])

    const { markdown } = await call('readArticleMarkdown', { id: '1' }, req)
    const result = await call(
      'updateArticleMarkdown',
      { id: '1', markdown: String(markdown).replace('After.', 'Revised.') },
      req,
    )

    expect(types(current().content)).toEqual(['heading', 'block', 'paragraph'])
    expect(stored(current().content)[1]).toEqual(before)
    expect(result.blocks).toEqual({
      kept: [{ key: KEY, blockType: 'keyFacts' }],
      removed: [],
    })
  })

  it('moves a module when its marker moves', async () => {
    const { req, current } = await article()

    await call(
      'updateArticleMarkdown',
      { id: '1', markdown: `## The short answer\n\nAfter.\n\n${MARKER}` },
      req,
    )

    expect(types(current().content)).toEqual(['heading', 'paragraph', 'block'])
  })

  it('removes a module whose marker is left out, and says so', async () => {
    const { req, current } = await article()

    const result = await call(
      'updateArticleMarkdown',
      { id: '1', markdown: '## The short answer\n\nAfter.' },
      req,
    )

    expect(types(current().content)).toEqual(['heading', 'paragraph'])
    expect(result.blocks).toEqual({
      kept: [],
      removed: [{ key: KEY, blockType: 'keyFacts' }],
    })
  })

  it.each([
    [
      'a marker naming no module in this draft',
      '<!-- block:keyFacts:ffffffffffffffffffffffff -->',
      /names no module/,
    ],
    [
      'a marker naming the wrong type',
      `<!-- block:faq:${KEY} -->`,
      /says faq, but .* is a keyFacts/,
    ],
    ['the same marker twice', `${MARKER}\n\n${MARKER}`, /more than once/],
    [
      'a marker run into a sentence',
      `Some text ${MARKER} and more.`,
      /on a line of its own/,
    ],
    [
      'a marker with no blank line before it',
      `Some text\n${MARKER}`,
      /on a line of its own/,
    ],
    [
      'a marker with its key missing',
      '<!-- block:keyFacts -->',
      /copied exactly/,
    ],
  ])('refuses %s, and saves nothing', async (_case, markdown, message) => {
    // Each can only be a mistake, and saving it would print a literal
    // `<!-- block:… -->` on the page.
    const { req, payload } = await article()

    await expect(
      call('updateArticleMarkdown', { id: '1', markdown }, req),
    ).rejects.toThrow(message)
    expect(payload.update).not.toHaveBeenCalled()
  })
})

describe('setKeyFactsBlock', () => {
  const cochineal = [
    { label: 'Insect', value: 'Dactylopius coccus' },
    { label: 'Yield', value: '~70,000 insects per lb' },
  ]

  // A Markdown table as the body really stores one: the editor has no table
  // feature, so the converter keeps it as one paragraph of pipe-bounded lines.
  const pipeTable = (): Node => ({
    ...paragraph('| | |'),
    children: [
      text('| | |'),
      { type: 'linebreak', version: 1 },
      text('|---|---|'),
      { type: 'linebreak', version: 1 },
      text('| Insect | Dactylopius coccus |'),
    ],
  })

  const children = (content: unknown) => (content as Body).root.children
  const factsNode = (content: unknown) =>
    children(content).find((node) => node.type === 'block') as
      (Node & { fields: Record<string, unknown> }) | undefined

  it('inserts the facts under the named heading and leaves the rest alone', async () => {
    const original = body(
      paragraph('Intro.'),
      heading('The short answer'),
      paragraph('Under it.'),
      heading('The insect'),
    )
    const { req, payload, current } = await mcpRequest({
      id: 1,
      content: structuredClone(original),
    })

    const result = await call(
      'setKeyFactsBlock',
      { id: '1', afterHeading: 'The short answer', facts: cochineal },
      req,
    )

    expect(types(current().content)).toEqual([
      'paragraph',
      'heading',
      'block',
      'paragraph',
      'heading',
    ])
    const written = children(current().content)
    expect([written[0], written[1], written[3], written[4]]).toEqual(
      children(original),
    )
    expect(factsNode(current().content)!.fields).toMatchObject({
      blockType: 'keyFacts',
      items: [
        { label: 'Insect', value: 'Dactylopius coccus' },
        { label: 'Yield', value: '~70,000 insects per lb' },
      ],
    })
    expect(factsNode(current().content)!.fields).not.toHaveProperty('heading')

    // Drafts only, as the key's own user, exactly like a Markdown revision.
    expect(payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        draft: true,
        overrideAccess: false,
        data: expect.objectContaining({ _status: 'draft' }),
      }),
    )
    expect(result).toMatchObject({
      placement: 'inserted',
      afterHeading: 'The short answer',
      removedTable: false,
      status: 'draft',
      keyFacts: { facts: 2, heading: null },
    })
  })

  it('matches the heading however it is capitalised or spaced', async () => {
    const { req, current } = await mcpRequest({
      id: 1,
      content: body(heading('The Short  Answer')),
    })

    await call(
      'setKeyFactsBlock',
      { id: '1', afterHeading: ' the short answer ', facts: cochineal },
      req,
    )

    expect(types(current().content)).toEqual(['heading', 'block'])
  })

  it('swaps a pipe table under the heading for the card when asked', async () => {
    const { req, current } = await mcpRequest({
      id: 1,
      content: body(
        heading('The short answer'),
        pipeTable(),
        paragraph('Next.'),
      ),
    })

    const result = await call(
      'setKeyFactsBlock',
      {
        id: '1',
        afterHeading: 'The short answer',
        facts: cochineal,
        replacePipeTable: true,
      },
      req,
    )

    expect(types(current().content)).toEqual(['heading', 'block', 'paragraph'])
    expect(JSON.stringify(current().content)).not.toContain('|---|')
    expect(result.removedTable).toBe(true)
  })

  it('refuses to replace a table that is not there, and saves nothing', async () => {
    const { req, payload } = await mcpRequest({
      id: 1,
      content: body(
        heading('The short answer'),
        paragraph('Prose, not pipes.'),
      ),
    })

    await expect(
      call(
        'setKeyFactsBlock',
        {
          id: '1',
          afterHeading: 'The short answer',
          facts: cochineal,
          replacePipeTable: true,
        },
        req,
      ),
    ).rejects.toThrow(/no Markdown table directly under "The short answer"/)
    expect(payload.update).not.toHaveBeenCalled()
  })

  it('replaces existing facts where they stand, keeping their marker', async () => {
    const { req, current } = await mcpRequest({
      id: 1,
      content: body(
        heading('The insect'),
        block('keyFacts', { heading: 'At a glance', ...facts }),
        heading('The short answer'),
      ),
    })

    const result = await call(
      'setKeyFactsBlock',
      {
        id: '1',
        // Ignored: the facts already have a place.
        afterHeading: 'The short answer',
        facts: [{ label: 'Colourant', value: 'Carminic acid' }],
      },
      req,
    )

    expect(types(current().content)).toEqual(['heading', 'block', 'heading'])
    const fields = factsNode(current().content)!.fields
    expect(fields.id).toBe('65f0c0ffee0000000000abcd')
    expect(fields.items).toEqual([
      expect.objectContaining({ label: 'Colourant', value: 'Carminic acid' }),
    ])
    // The call describes the whole card: no heading given, none kept.
    expect(fields).not.toHaveProperty('heading')
    expect(result).toMatchObject({
      placement: 'replaced',
      afterHeading: 'The insect',
      keyFacts: { marker: '<!-- block:keyFacts:65f0c0ffee0000000000abcd -->' },
    })
  })

  it.each([
    [
      'no afterHeading for an article without facts',
      { facts: cochineal },
      body(heading('The short answer')),
      /pass afterHeading.*"The short answer"/,
    ],
    [
      'a heading the body does not have',
      { afterHeading: 'At a glance', facts: cochineal },
      body(heading('The short answer'), heading('The insect')),
      /No heading in the body reads "At a glance".*"The short answer", "The insect"/,
    ],
    [
      'a heading that heads two sections',
      { afterHeading: 'Notes', facts: cochineal },
      body(heading('Notes'), heading('Notes')),
      /heads 2 sections/,
    ],
    [
      'an article with two sets of facts',
      { facts: cochineal },
      body(
        heading('One'),
        block('keyFacts', facts, 'aa11'),
        heading('Two'),
        block('keyFacts', facts, 'bb22'),
      ),
      /2 key facts modules, under "One", "Two"/,
    ],
    [
      'a fact with a blank value',
      { afterHeading: 'X', facts: [{ label: 'Yield', value: '  ' }] },
      body(heading('X')),
      /Fact 1 has no value/,
    ],
    [
      'more facts than the module holds',
      {
        afterHeading: 'X',
        facts: Array.from({ length: 13 }, (_, i) => ({
          label: `L${i}`,
          value: `V${i}`,
        })),
      },
      body(heading('X')),
      /at most 12 facts/,
    ],
  ])('refuses %s, and saves nothing', async (_case, args, content, message) => {
    const { req, payload } = await mcpRequest({ id: 1, content })

    await expect(
      call('setKeyFactsBlock', { id: '1', ...args }, req),
    ).rejects.toThrow(message)
    expect(payload.update).not.toHaveBeenCalled()
  })

  it('refuses an article whose page renders from Ghost HTML', async () => {
    // A body of one fact card would replace the whole migrated article.
    const { req, payload } = await mcpRequest({
      id: 1,
      legacyHTML: '<h2>The short answer</h2><p>Migrated.</p>',
      content: null,
    })

    await expect(
      call(
        'setKeyFactsBlock',
        { id: '1', afterHeading: 'The short answer', facts: cochineal },
        req,
      ),
    ).rejects.toThrow(/renders from migrated Ghost HTML/)
    expect(payload.update).not.toHaveBeenCalled()
  })

  it('writes facts that the read tool reports and a revision keeps', async () => {
    // The whole loop an agent runs on a draft: set, review, revise.
    const { req, current } = await mcpRequest({
      id: 1,
      content: body(
        heading('The short answer'),
        pipeTable(),
        paragraph('After.'),
      ),
    })

    const set = await call(
      'setKeyFactsBlock',
      {
        id: '1',
        afterHeading: 'The short answer',
        facts: cochineal,
        heading: 'At a glance',
        replacePipeTable: true,
      },
      req,
    )
    const marker = (set.keyFacts as { marker: string }).marker

    const read = await call('readArticleMarkdown', { id: '1' }, req)
    expect(read.markdown).toBe(`## The short answer\n\n${marker}\n\nAfter.`)
    expect(read.blocks).toEqual([
      expect.objectContaining({
        blockType: 'keyFacts',
        marker,
        afterHeading: 'The short answer',
        fields: expect.objectContaining({
          heading: 'At a glance',
          items: [
            expect.objectContaining(cochineal[0]),
            expect.objectContaining(cochineal[1]),
          ],
        }),
      }),
    ])

    const before = structuredClone(factsNode(current().content))
    await call(
      'updateArticleMarkdown',
      {
        id: '1',
        markdown: String(read.markdown).replace('After.', 'Revised.'),
      },
      req,
    )
    expect(factsNode(current().content)).toEqual(before)
  })
})

describe('setFAQBlock', () => {
  const qa = [
    {
      question: 'What is cochineal made from?',
      answer: 'The dried bodies of the **cochineal** scale insect.',
    },
    {
      question: 'Is cochineal still used?',
      answer: 'Yes, as [E120](https://example.com/e120) in food.',
    },
  ]

  // How a draft written in Markdown states its FAQ: a section heading, then
  // one paragraph per question with the question in bold.
  const markdownFaqSection = () => [
    heading('FAQ'),
    paragraph('**What is cochineal made from?** The dried bodies.'),
    paragraph('**Is cochineal still used?** Yes, as E120.'),
  ]

  const children = (content: unknown) => (content as Body).root.children
  const faqNode = (content: unknown) =>
    children(content).find(
      (node) =>
        node.type === 'block' &&
        (node as { fields?: { blockType?: string } }).fields?.blockType ===
          'faq',
    ) as (Node & { fields: Record<string, unknown> }) | undefined

  it('inserts under the named heading, with answers as rich text', async () => {
    const original = body(
      paragraph('Intro.'),
      heading('Questions readers ask'),
      heading('The claim'),
    )
    const { req, payload, current } = await mcpRequest({
      id: 1,
      content: structuredClone(original),
    })

    const result = await call(
      'setFAQBlock',
      { id: '1', afterHeading: 'Questions readers ask', items: qa },
      req,
    )

    expect(types(current().content)).toEqual([
      'paragraph',
      'heading',
      'block',
      'heading',
    ])
    const written = children(current().content)
    expect([written[0], written[1], written[3]]).toEqual(children(original))

    const fields = faqNode(current().content)!.fields as {
      heading: string
      items: Array<{ question: string; answer: Body }>
    }
    // No heading asked for: the block's own default, written explicitly.
    expect(fields.heading).toBe('Frequently asked questions')
    expect(fields.items.map((item) => item.question)).toEqual([
      'What is cochineal made from?',
      'Is cochineal still used?',
    ])
    // Rich text, converted with the answer's editor: bold and a link.
    const answer = JSON.stringify(fields.items)
    expect(answer).toContain('"format":1')
    expect(answer).toContain('"type":"link"')
    expect(answer).toContain('https://example.com/e120')

    expect(payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        draft: true,
        overrideAccess: false,
        data: expect.objectContaining({ _status: 'draft' }),
      }),
    )
    expect(result).toMatchObject({
      placement: 'inserted',
      afterHeading: 'Questions readers ask',
      replacedSection: null,
      status: 'draft',
      faq: { heading: 'Frequently asked questions', questions: 2 },
    })
  })

  it('replaces a Markdown FAQ section, keeping its heading', async () => {
    const { req, current } = await mcpRequest({
      id: 1,
      content: body(
        paragraph('Intro.'),
        heading('The short answer'),
        paragraph('Short.'),
        ...markdownFaqSection(),
        heading('The claim'),
        paragraph('Claimed.'),
      ),
    })

    const result = await call(
      'setFAQBlock',
      {
        id: '1',
        afterHeading: 'FAQ',
        items: qa,
        replaceExisting: true,
      },
      req,
    )

    // The heading and both Markdown questions are gone; one block stands in
    // for all three, and the sections either side are untouched.
    expect(types(current().content)).toEqual([
      'paragraph',
      'heading',
      'paragraph',
      'block',
      'heading',
      'paragraph',
    ])
    expect(JSON.stringify(current().content)).not.toContain('**What is')
    expect(faqNode(current().content)!.fields.heading).toBe('FAQ')
    expect(result).toMatchObject({
      placement: 'inserted',
      replacedSection: 'FAQ',
      afterHeading: 'The short answer',
      faq: { heading: 'FAQ' },
    })
  })

  it('takes a deeper heading inside the section with it, and stops at the next', async () => {
    const { req, current } = await mcpRequest({
      id: 1,
      content: body(
        heading('FAQ'),
        heading('What is it?', 'h3'),
        paragraph('An insect.'),
        heading('Next section'),
      ),
    })

    await call(
      'setFAQBlock',
      { id: '1', afterHeading: 'faq', items: qa, replaceExisting: true },
      req,
    )

    expect(types(current().content)).toEqual(['block', 'heading'])
  })

  it.each([
    ['an image', upload(7)],
    ['a key facts module', block('keyFacts', facts, 'aa11')],
  ])(
    'refuses to replace a section holding %s, and saves nothing',
    async (_what, node) => {
      const { req, payload } = await mcpRequest({
        id: 1,
        content: body(...markdownFaqSection(), node, heading('After')),
      })

      await expect(
        call(
          'setFAQBlock',
          { id: '1', afterHeading: 'FAQ', items: qa, replaceExisting: true },
          req,
        ),
      ).rejects.toThrow(/which replacing it would delete/)
      expect(payload.update).not.toHaveBeenCalled()
    },
  )

  it('refuses a section that would take whole sections with it', async () => {
    // An `h1` "FAQ" would otherwise run to the end of the article.
    const { req, payload } = await mcpRequest({
      id: 1,
      content: body(
        heading('FAQ', 'h1'),
        paragraph('**Q?** A.'),
        heading('The insect'),
        paragraph('A scale insect.'),
      ),
    })

    await expect(
      call(
        'setFAQBlock',
        { id: '1', afterHeading: 'FAQ', items: qa, replaceExisting: true },
        req,
      ),
    ).rejects.toThrow(/contains the sections "The insect"/)
    expect(payload.update).not.toHaveBeenCalled()
  })

  it('replaces an existing FAQ where it stands, keeping its id and heading', async () => {
    const { req, current } = await mcpRequest({
      id: 1,
      content: body(
        heading('Intro'),
        block('faq', { heading: 'FAQ', items: [] }),
        heading('The claim'),
      ),
    })

    const result = await call(
      'setFAQBlock',
      // Both ignored: the FAQ already has a place.
      { id: '1', afterHeading: 'The claim', replaceExisting: true, items: qa },
      req,
    )

    expect(types(current().content)).toEqual(['heading', 'block', 'heading'])
    const fields = faqNode(current().content)!.fields
    expect(fields.id).toBe('65f0c0ffee0000000000abcd')
    // Not reset to the default: that would move the section's anchor.
    expect(fields.heading).toBe('FAQ')
    expect(result).toMatchObject({
      placement: 'replaced',
      afterHeading: 'Intro',
      faq: {
        heading: 'FAQ',
        marker: '<!-- block:faq:65f0c0ffee0000000000abcd -->',
      },
    })
  })

  it('renames an existing FAQ when a heading is given', async () => {
    const { req, current } = await mcpRequest({
      id: 1,
      content: body(block('faq', { heading: 'FAQ', items: [] })),
    })

    await call('setFAQBlock', { id: '1', heading: 'Questions', items: qa }, req)

    expect(faqNode(current().content)!.fields.heading).toBe('Questions')
  })

  it.each([
    [
      'no afterHeading for an article without an FAQ',
      { items: qa },
      body(heading('FAQ')),
      /no FAQ yet, so say where the FAQ goes: pass afterHeading.*"FAQ"/,
    ],
    [
      'a heading the body does not have',
      { afterHeading: 'Questions', items: qa },
      body(heading('FAQ')),
      /No heading in the body reads "Questions"/,
    ],
    [
      'an article with two FAQs',
      { items: qa },
      body(
        heading('One'),
        block('faq', {}, 'aa11'),
        heading('Two'),
        block('faq', {}, 'bb22'),
      ),
      /2 FAQ modules, under "One", "Two"/,
    ],
    [
      'a question with no answer',
      { afterHeading: 'FAQ', items: [{ question: 'Why?', answer: '  ' }] },
      body(heading('FAQ')),
      /Question 1 has no answer/,
    ],
    [
      'an answer with a heading in it',
      {
        afterHeading: 'FAQ',
        items: [{ question: 'Why?', answer: '## Because\n\nIt is.' }],
      },
      body(heading('FAQ')),
      /The answer to "Why\?" contains a heading/,
    ],
    [
      'no questions at all',
      { afterHeading: 'FAQ', items: [] },
      body(heading('FAQ')),
      /at least one question/,
    ],
  ])('refuses %s, and saves nothing', async (_case, args, content, message) => {
    const { req, payload } = await mcpRequest({ id: 1, content })

    await expect(
      call('setFAQBlock', { id: '1', ...args }, req),
    ).rejects.toThrow(message)
    expect(payload.update).not.toHaveBeenCalled()
  })

  it('refuses an article whose page renders from Ghost HTML', async () => {
    const { req, payload } = await mcpRequest({
      id: 1,
      legacyHTML: '<h2>FAQ</h2><p>Migrated.</p>',
      content: null,
    })

    await expect(
      call('setFAQBlock', { id: '1', afterHeading: 'FAQ', items: qa }, req),
    ).rejects.toThrow(/renders from migrated Ghost HTML/)
    expect(payload.update).not.toHaveBeenCalled()
  })

  it('writes an FAQ the page describes to search engines', async () => {
    // The stored shape has to be the one the renderer and the structured
    // data read, or the module saves and then says nothing.
    const { req, current } = await mcpRequest({
      id: 1,
      content: body(heading('FAQ')),
    })

    await call(
      'setFAQBlock',
      { id: '1', afterHeading: 'FAQ', items: qa, replaceExisting: true },
      req,
    )

    const nodes = collectBlockJsonLd({
      kind: 'lexical',
      content: current().content,
    } as never)
    expect(nodes).toEqual([
      {
        '@type': 'FAQPage',
        mainEntity: [
          {
            '@type': 'Question',
            name: 'What is cochineal made from?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'The dried bodies of the cochineal scale insect.',
            },
          },
          {
            '@type': 'Question',
            name: 'Is cochineal still used?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Yes, as E120 in food.',
            },
          },
        ],
      },
    ])
  })

  it('writes an FAQ the read tool reports and a revision keeps', async () => {
    const { req, current } = await mcpRequest({
      id: 1,
      content: body(...markdownFaqSection(), heading('The claim')),
    })

    const set = await call(
      'setFAQBlock',
      { id: '1', afterHeading: 'FAQ', items: qa, replaceExisting: true },
      req,
    )
    const marker = (set.faq as { marker: string }).marker

    const read = await call('readArticleMarkdown', { id: '1' }, req)
    expect(read.markdown).toBe(`${marker}\n\n## The claim`)
    expect(read.blocks).toEqual([
      expect.objectContaining({
        blockType: 'faq',
        marker,
        fields: expect.objectContaining({
          heading: 'FAQ',
          items: [
            expect.objectContaining({
              question: 'What is cochineal made from?',
              answer: 'The dried bodies of the **cochineal** scale insect.',
            }),
            expect.objectContaining({
              question: 'Is cochineal still used?',
              answer: 'Yes, as [E120](https://example.com/e120) in food.',
            }),
          ],
        }),
      }),
    ])

    const before = structuredClone(faqNode(current().content))
    await call(
      'updateArticleMarkdown',
      { id: '1', markdown: `${marker}\n\n## The claim\n\nAdded.` },
      req,
    )
    expect(faqNode(current().content)).toEqual(before)
  })
})
