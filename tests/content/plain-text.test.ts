import { describe, expect, it } from 'vitest'

import {
  ACCORDION_BLOCK,
  BOOKMARK_BLOCK,
  BUTTON_BLOCK,
  CALLOUT_BLOCK,
  EMBED_BLOCK,
  FAQ_BLOCK,
  FEATURE_LIST_BLOCK,
  GALLERY_BLOCK,
  KEY_TAKEAWAYS_BLOCK,
  PAYWALL_BLOCK,
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

  it('reads callout prose, which is editorial text in a box', () => {
    const plain = richTextToPlainText(
      editorState(
        block(CALLOUT_BLOCK, {
          content: editorState(paragraph(text('Varnish yellows.'))),
        }),
      ),
    )

    expect(plain).toContain('Varnish yellows.')
  })

  it('reads a button label but never its URL', () => {
    const plain = richTextToPlainText(
      editorState(
        block(BUTTON_BLOCK, {
          label: 'Download the pigment chart',
          href: 'https://example.com/chart.pdf?ref=track',
        }),
      ),
    )

    expect(plain).toContain('Download the pigment chart')
    expect(plain).not.toContain('example.com')
    expect(plain).not.toContain('ref=track')
  })

  it('reads gallery captions, which carry what the images cannot', () => {
    const plain = richTextToPlainText(
      editorState(
        block(GALLERY_BLOCK, {
          items: [{ caption: 'Raking light' }, { caption: 'Cross-section' }],
          caption: 'Three states of the surface',
        }),
      ),
    )

    expect(plain).toContain('Raking light')
    expect(plain).toContain('Cross-section')
    expect(plain).toContain('Three states of the surface')
  })

  it('reads what an editor wrote about a bookmark, not the link', () => {
    const plain = richTextToPlainText(
      editorState(
        block(BOOKMARK_BLOCK, {
          url: 'https://www.burlington.org.uk/a?utm_source=x',
          title: 'On lead white',
          description: 'A long read.',
          publisher: 'The Burlington',
        }),
      ),
    )

    expect(plain).toContain('On lead white')
    expect(plain).toContain('A long read.')
    expect(plain).toContain('The Burlington')
    expect(plain).not.toContain('utm_source')
  })

  it('reads an embed title but not its URL', () => {
    const plain = richTextToPlainText(
      editorState(
        block(EMBED_BLOCK, {
          url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          title: 'Grinding lapis by hand',
        }),
      ),
    )

    expect(plain).toContain('Grinding lapis by hand')
    expect(plain).not.toContain('youtube')
  })

  it('contributes nothing for the members-only marker', () => {
    const plain = richTextToPlainText(
      editorState(
        paragraph(text('Before.')),
        block(PAYWALL_BLOCK, { note: 'EDITOR NOTE' }),
      ),
    )

    expect(plain).toContain('Before.')
    expect(plain).not.toContain('EDITOR NOTE')
  })

  it('keeps every key takeaway', () => {
    // The most quotable sentences in the piece, written to stand alone —
    // exactly what a description or a feed summary should be able to reach.
    const plain = richTextToPlainText(
      editorState(
        block(KEY_TAKEAWAYS_BLOCK, {
          heading: 'Key takeaways',
          items: [
            { text: 'Lapis is the rock, ultramarine the pigment.' },
            { text: 'The synthetic arrived in 1826.' },
          ],
        }),
      ),
    )

    expect(plain).toContain('Key takeaways')
    expect(plain).toContain('Lapis is the rock, ultramarine the pigment.')
    expect(plain).toContain('The synthetic arrived in 1826.')
  })

  it('keeps both halves of every FAQ entry', () => {
    // Questions are often the exact wording somebody searched for, and a
    // collapsed answer is still published text.
    const plain = richTextToPlainText(
      editorState(
        block(FAQ_BLOCK, {
          heading: 'Common questions',
          items: [
            {
              question: 'Is lapis ultramarine?',
              answer: editorState(paragraph(text('Not quite.'))),
            },
          ],
        }),
      ),
    )

    expect(plain).toContain('Common questions')
    expect(plain).toContain('Is lapis ultramarine?')
    expect(plain).toContain('Not quite.')
  })

  it('keeps a feature list’s headings and item copy', () => {
    const plain = richTextToPlainText(
      editorState(
        block(FEATURE_LIST_BLOCK, {
          heading: 'Six pigments',
          intro: 'Each one changed what a painter could do.',
          items: [{ title: 'Ultramarine', body: 'Ground lapis, once.' }],
        }),
      ),
    )

    expect(plain).toContain('Six pigments')
    expect(plain).toContain('Each one changed what a painter could do.')
    expect(plain).toContain('Ultramarine')
    expect(plain).toContain('Ground lapis, once.')
  })

  it('survives a block with no fields at all', () => {
    // What a draft looks like the moment an editor inserts a module and has
    // not filled anything in. Live Preview renders exactly this.
    expect(() =>
      richTextToPlainText(
        editorState(
          block(ACCORDION_BLOCK),
          block(PULL_QUOTE_BLOCK),
          block(KEY_TAKEAWAYS_BLOCK),
          block(FAQ_BLOCK),
          block(FEATURE_LIST_BLOCK),
        ),
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
