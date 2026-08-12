import { describe, expect, it } from 'vitest'

import {
  isEmptyRichText,
  richTextToHtml,
  stripLeadingTitleHeading,
  toBodyHtml,
  toTeaserHtml,
} from '../../lib/content/richtext'

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

describe('isEmptyRichText', () => {
  it('treats a missing value as empty', () => {
    expect(isEmptyRichText(undefined)).toBe(true)
    expect(isEmptyRichText(null)).toBe(true)
    expect(isEmptyRichText({})).toBe(true)
  })

  it('treats an untouched editor as empty', () => {
    // What Payload stores for a rich-text field nobody has typed into.
    expect(isEmptyRichText(editorState(paragraph()))).toBe(true)
    expect(isEmptyRichText(editorState(paragraph(text('   '))))).toBe(true)
  })

  it('treats written text as content', () => {
    expect(isEmptyRichText(editorState(paragraph(text('Ultramarine'))))).toBe(
      false,
    )
  })

  it('treats an image-only body as content', () => {
    const upload = {
      type: 'upload',
      relationTo: 'media',
      value: {},
      version: 1,
    }
    expect(isEmptyRichText(editorState(upload))).toBe(false)
  })
})

describe('richTextToHtml', () => {
  it('renders paragraphs without the converter container', () => {
    const html = richTextToHtml(editorState(paragraph(text('Ultramarine'))))
    expect(html).toContain('Ultramarine')
    expect(html).toContain('<p')
    expect(html).not.toContain('payload-richtext')
  })

  it('returns an empty string for an empty editor', () => {
    expect(richTextToHtml(editorState(paragraph()))).toBe('')
    expect(richTextToHtml(null)).toBe('')
  })
})

describe('stripLeadingTitleHeading', () => {
  it('drops a leading heading that repeats the title', () => {
    expect(
      stripLeadingTitleHeading(
        '<h1>Understanding Ultramarine</h1><p>Body.</p>',
        'Understanding Ultramarine',
      ),
    ).toBe('<p>Body.</p>')
  })

  it('looks past whitespace, comments, and heading attributes', () => {
    expect(
      stripLeadingTitleHeading(
        '\n<!-- kg-card-begin -->\n<h2 id="understanding-ultramarine" class="post-title">Understanding Ultramarine</h2>\n<p>Body.</p>',
        'Understanding Ultramarine',
      ),
    ).toBe('<p>Body.</p>')
  })

  it('ignores markup and entities inside the heading', () => {
    expect(
      stripLeadingTitleHeading(
        '<h1><strong>Lapis</strong> &amp; <em>Azurite</em></h1><p>Body.</p>',
        'Lapis & Azurite',
      ),
    ).toBe('<p>Body.</p>')
  })

  it('treats smart punctuation as the straight characters it stands for', () => {
    expect(
      stripLeadingTitleHeading(
        '<h1>A Painter’s Blue — Part One</h1><p>Body.</p>',
        "A Painter's Blue - Part One",
      ),
    ).toBe('<p>Body.</p>')
  })

  it('keeps a leading heading that says something else', () => {
    const html = '<h1>A note before we begin</h1><p>Body.</p>'
    expect(stripLeadingTitleHeading(html, 'Understanding Ultramarine')).toBe(
      html,
    )
  })

  it('keeps a matching heading that the body does not open with', () => {
    const html = '<p>Body.</p><h1>Understanding Ultramarine</h1>'
    expect(stripLeadingTitleHeading(html, 'Understanding Ultramarine')).toBe(
      html,
    )
  })

  it('keeps a deeper heading, which is a section and not the title', () => {
    const html = '<h4>Understanding Ultramarine</h4><p>Body.</p>'
    expect(stripLeadingTitleHeading(html, 'Understanding Ultramarine')).toBe(
      html,
    )
  })

  it('leaves the body alone when there is no title to match', () => {
    const html = '<h1>Understanding Ultramarine</h1><p>Body.</p>'
    expect(stripLeadingTitleHeading(html, null)).toBe(html)
    expect(stripLeadingTitleHeading(html, '   ')).toBe(html)
  })
})

describe('toTeaserHtml', () => {
  const para = (text: string) => `<p>${text}</p>`

  it('takes whole paragraphs until the allowance runs out', () => {
    // Over the 500-character allowance on its own, so the cut lands after it.
    const long = 'word '.repeat(120).trim()
    const html = para(long) + para('Withheld.') + para('Also withheld.')

    const teaser = toTeaserHtml(html)

    expect(teaser).toBe(para(long))
    expect(teaser).not.toContain('Withheld')
  })

  it('keeps going while the opening paragraphs are short', () => {
    const html = para('One.') + para('Two.') + para('Three.')
    expect(toTeaserHtml(html, 200)).toBe(
      [para('One.'), para('Two.'), para('Three.')].join('\n'),
    )
  })

  it('always yields the first paragraph, however long it is', () => {
    const html = para('word '.repeat(400).trim()) + para('Withheld.')
    expect(toTeaserHtml(html, 10)).not.toContain('Withheld')
    expect(toTeaserHtml(html, 10)).toContain('word')
  })

  it('stops at anything that is not a paragraph', () => {
    const html = para('Opening.') + '<figure><img src="/a.jpg" /></figure>'
    expect(toTeaserHtml(html)).toBe(para('Opening.'))
  })

  it('yields nothing when the body does not open with prose', () => {
    expect(toTeaserHtml('<figure><img src="/a.jpg" /></figure>')).toBe('')
    expect(toTeaserHtml('')).toBe('')
  })
})

describe('toBodyHtml', () => {
  it('renders the rich-text body when an editor has written one', () => {
    const html = toBodyHtml({
      content: editorState(paragraph(text('Written in Payload'))),
      legacyHTML: '<p>Imported from Ghost</p>',
    })
    expect(html).toContain('Written in Payload')
    expect(html).not.toContain('Imported from Ghost')
  })

  it('falls back to preserved Ghost markup, which every migrated doc has', () => {
    expect(
      toBodyHtml({
        content: editorState(paragraph()),
        legacyHTML: '<p>Imported from Ghost</p>',
      }),
    ).toBe('<p>Imported from Ghost</p>')
  })

  it('returns an empty string when a document has neither', () => {
    expect(toBodyHtml({})).toBe('')
    expect(toBodyHtml({ content: null, legacyHTML: null })).toBe('')
  })

  it('drops the title heading a migrated Ghost body opens with', () => {
    const legacyHTML =
      '<h1>Understanding Ultramarine</h1><p>Ultramarine is a storied pigment.</p>'
    expect(toBodyHtml({ legacyHTML, title: 'Understanding Ultramarine' })).toBe(
      '<p>Ultramarine is a storied pigment.</p>',
    )
    // The stored markup is the migration's record of what Ghost served, and
    // stays as it was so the change is reversible.
    expect(legacyHTML).toContain('<h1>Understanding Ultramarine</h1>')
  })

  it('drops a repeated title from a rich-text body too', () => {
    const heading = {
      type: 'heading',
      tag: 'h1',
      children: [text('Written in Payload')],
      direction: 'ltr',
      format: '',
      indent: 0,
      version: 1,
    }
    const html = toBodyHtml({
      content: editorState(heading, paragraph(text('The body.'))),
      title: 'Written in Payload',
    })
    expect(html).not.toContain('Written in Payload')
    expect(html).toContain('The body.')
  })
})
