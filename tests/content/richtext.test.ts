import { describe, expect, it } from 'vitest'

import {
  isEmptyRichText,
  richTextToHtml,
  toBodyHtml,
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
})
