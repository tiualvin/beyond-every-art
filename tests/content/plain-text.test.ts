import { describe, expect, it } from 'vitest'

import {
  ACCORDION_BLOCK,
  PULL_QUOTE_BLOCK,
  SIGNUP_BLOCK,
} from '../../blocks/schema'
import { toArticleBody } from '../../lib/content/body'
import {
  bodyToPlainText,
  htmlToPlainText,
  richTextToPlainText,
} from '../../lib/content/plain-text'

const text = (value: string) => ({
  type: 'text',
  detail: 0,
  format: 0,
  mode: 'normal',
  style: '',
  text: value,
  version: 1,
})

const paragraph = (...children: unknown[]) => ({
  type: 'paragraph',
  children,
  direction: 'ltr',
  format: '',
  indent: 0,
  version: 1,
})

const block = (blockType: string, fields: Record<string, unknown> = {}) => ({
  type: 'block',
  fields: { blockType, ...fields },
  format: '',
  version: 2,
})

const editorState = (...children: unknown[]) => ({
  root: {
    type: 'root',
    children,
    direction: 'ltr',
    format: '',
    indent: 0,
    version: 1,
  },
})

describe('richTextToPlainText', () => {
  it('reads ordinary rich text', () => {
    expect(
      richTextToPlainText(editorState(paragraph(text('Ultramarine')))),
    ).toContain('Ultramarine')
  })

  it('is empty for an untouched editor', () => {
    expect(richTextToPlainText(null)).toBe('')
    expect(richTextToPlainText(editorState())).toBe('')
  })
})

describe('block serialization', () => {
  it('expands every accordion panel, open or not', () => {
    // A collapsed panel is still published text. Indexing only the open ones
    // would make an article unfindable by its own content.
    const plain = richTextToPlainText(
      editorState(
        block(ACCORDION_BLOCK, {
          heading: 'Common questions',
          items: [
            {
              title: 'Is lapis the same as ultramarine?',
              content: editorState(paragraph(text('Not quite.'))),
              defaultOpen: false,
            },
            {
              title: 'What replaced it?',
              content: editorState(paragraph(text('A synthetic.'))),
            },
          ],
        }),
      ),
    )

    expect(plain).toContain('Common questions')
    expect(plain).toContain('Is lapis the same as ultramarine?')
    expect(plain).toContain('Not quite.')
    expect(plain).toContain('What replaced it?')
    expect(plain).toContain('A synthetic.')
  })

  it('reads a pull quote and its attribution', () => {
    const plain = richTextToPlainText(
      editorState(
        block(PULL_QUOTE_BLOCK, {
          quote: 'Colour is the place where our brain meets the universe.',
          attribution: 'Paul Klee',
        }),
      ),
    )

    expect(plain).toContain('Colour is the place')
    expect(plain).toContain('Paul Klee')
  })

  it('omits signup form chrome', () => {
    const plain = richTextToPlainText(
      editorState(
        paragraph(text('The body.')),
        block(SIGNUP_BLOCK, {
          heading: 'Stay close to the work',
          body: 'New stories when they are ready.',
          submitLabel: 'Subscribe',
        }),
      ),
    )

    expect(plain).toContain('The body.')
    expect(plain).not.toContain('Stay close to the work')
    expect(plain).not.toContain('Subscribe')
  })

  it('survives a block with no fields at all', () => {
    // What a draft looks like the moment an editor inserts a module and has
    // not filled anything in. Live Preview renders exactly this.
    expect(() =>
      richTextToPlainText(
        editorState(block(ACCORDION_BLOCK), block(PULL_QUOTE_BLOCK)),
      ),
    ).not.toThrow()
  })
})

describe('htmlToPlainText', () => {
  it('strips markup from preserved Ghost bodies', () => {
    expect(htmlToPlainText('<p>Lapis <em>lazuli</em></p>')).toBe('Lapis lazuli')
  })

  it('drops script and style content rather than reading it as text', () => {
    const html =
      '<p>Body</p><script>alert(1)</script><style>p{color:red}</style>'

    expect(htmlToPlainText(html)).toBe('Body')
  })

  it('decodes the non-breaking spaces Ghost exports are full of', () => {
    expect(htmlToPlainText('<p>Lapis&nbsp;lazuli</p>')).toBe('Lapis lazuli')
  })
})

describe('bodyToPlainText', () => {
  it('reads whichever branch the body took', () => {
    expect(
      bodyToPlainText(
        toArticleBody({ content: editorState(paragraph(text('Written'))) }),
      ),
    ).toContain('Written')

    expect(bodyToPlainText(toArticleBody({ legacyHTML: '<p>Ghost</p>' }))).toBe(
      'Ghost',
    )

    expect(bodyToPlainText(toArticleBody({}))).toBe('')
  })
})
