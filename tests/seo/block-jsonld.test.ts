import { describe, expect, it } from 'vitest'

import {
  FAQ_BLOCK,
  FEATURE_LIST_BLOCK,
  KEY_TAKEAWAYS_BLOCK,
  PULL_QUOTE_BLOCK,
} from '../../blocks/schema'
import type { ArticleBody } from '../../lib/content/body'
import { collectBlockJsonLd } from '../../lib/seo/block-jsonld'

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

const block = (blockType: string, fields: Record<string, unknown>) => ({
  type: 'block',
  version: 1,
  fields: { blockType, ...fields },
})

const body = (children: unknown[]): ArticleBody => ({
  kind: 'lexical',
  content: {
    root: {
      type: 'root',
      children: children as never,
    },
  },
})

describe('collectBlockJsonLd', () => {
  it('is empty for a body with no blocks', () => {
    expect(collectBlockJsonLd(body([]))).toEqual([])
  })

  it('is empty for preserved Ghost markup and an empty body', () => {
    expect(collectBlockJsonLd({ kind: 'html', html: '<p>Hi</p>' })).toEqual([])
    expect(collectBlockJsonLd({ kind: 'empty' })).toEqual([])
  })

  it('describes an FAQ as questions and answers', () => {
    const nodes = collectBlockJsonLd(
      body([
        block(FAQ_BLOCK, {
          heading: 'Common questions',
          items: [
            {
              question: 'Is lapis ultramarine?',
              answer: richText('Not quite — lapis is the rock.'),
            },
          ],
        }),
      ]),
    )

    expect(nodes).toEqual([
      {
        '@type': 'FAQPage',
        mainEntity: [
          {
            '@type': 'Question',
            name: 'Is lapis ultramarine?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Not quite — lapis is the rock.',
            },
          },
        ],
      },
    ])
  })

  it('drops a question with no answer rather than emitting an empty one', () => {
    const nodes = collectBlockJsonLd(
      body([
        block(FAQ_BLOCK, {
          items: [
            { question: 'Answered?', answer: richText('Yes.') },
            { question: 'Unanswered?' },
            { answer: richText('An answer to nothing.') },
          ],
        }),
      ]),
    )

    expect(nodes[0].mainEntity).toHaveLength(1)
  })

  it('emits nothing for an FAQ whose questions are all unusable', () => {
    expect(
      collectBlockJsonLd(
        body([block(FAQ_BLOCK, { items: [{ question: 'Unanswered?' }] })]),
      ),
    ).toEqual([])
  })

  it('describes a feature list as an ordered ItemList', () => {
    const nodes = collectBlockJsonLd(
      body([
        block(FEATURE_LIST_BLOCK, {
          heading: 'Six pigments',
          items: [
            { title: 'Ultramarine', body: 'Ground lapis, once.' },
            { title: 'Vermilion' },
          ],
        }),
      ]),
    )

    expect(nodes).toEqual([
      {
        '@type': 'ItemList',
        name: 'Six pigments',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Ultramarine',
            description: 'Ground lapis, once.',
          },
          { '@type': 'ListItem', position: 2, name: 'Vermilion' },
        ],
      },
    ])
  })

  it('numbers list positions by what is kept, not by the stored index', () => {
    const nodes = collectBlockJsonLd(
      body([
        block(FEATURE_LIST_BLOCK, {
          items: [
            { body: 'Untitled, dropped' },
            { title: 'First' },
            { body: 'Also dropped' },
            { title: 'Second' },
          ],
        }),
      ]),
    )

    // The dropped rows occupy stored indexes 0 and 2. Numbering from those
    // would start the list at 2 and skip 3; `ItemList` positions run 1..n.
    expect(nodes[0].itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: 'First' },
      { '@type': 'ListItem', position: 2, name: 'Second' },
    ])
  })

  it('says nothing for presentational blocks', () => {
    expect(
      collectBlockJsonLd(
        body([
          block(PULL_QUOTE_BLOCK, { quote: 'A sentence worth pulling.' }),
          block(KEY_TAKEAWAYS_BLOCK, { items: [{ text: 'A point.' }] }),
        ]),
      ),
    ).toEqual([])
  })

  it('ignores a block slug it does not know', () => {
    expect(
      collectBlockJsonLd(body([block('somethingElse', { title: 'Hi' })])),
    ).toEqual([])
  })

  it('collects every block in the body, in reading order', () => {
    const nodes = collectBlockJsonLd(
      body([
        block(FEATURE_LIST_BLOCK, { items: [{ title: 'One' }] }),
        block(FAQ_BLOCK, {
          items: [{ question: 'Why?', answer: richText('Because.') }],
        }),
      ]),
    )

    expect(nodes.map((node) => node['@type'])).toEqual(['ItemList', 'FAQPage'])
  })
})
