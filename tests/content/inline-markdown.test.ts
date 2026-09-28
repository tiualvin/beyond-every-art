import { describe, expect, it } from 'vitest'

import {
  inlineMarkdownToPlainText,
  parseInlineMarkdown,
} from '../../lib/content/inline-markdown'

const text = (value: string) => ({ type: 'text', text: value })

describe('parseInlineMarkdown', () => {
  it('reads italics, bold and code', () => {
    expect(
      parseInlineMarkdown('*Dactylopius coccus*, **carminic** `E120`'),
    ).toEqual([
      { type: 'em', children: [text('Dactylopius coccus')] },
      text(', '),
      { type: 'strong', children: [text('carminic')] },
      text(' '),
      { type: 'code', text: 'E120' },
    ])
  })

  it('reads underscores as italics at word edges only', () => {
    expect(parseInlineMarkdown('_lake_ pigment')).toEqual([
      { type: 'em', children: [text('lake')] },
      text(' pigment'),
    ])
    // Written as words, and kept as words.
    expect(parseInlineMarkdown('snake_case and a_b_c')).toEqual([
      text('snake_case and a_b_c'),
    ])
  })

  it('leaves arithmetic and lone delimiters as text', () => {
    for (const source of ['2 * 3 * 4', '5*', '**', '* not a run *', 'a ** b']) {
      expect(parseInlineMarkdown(source), source).toEqual([text(source)])
    }
  })

  it('nests emphasis inside bold', () => {
    expect(parseInlineMarkdown('**very *red***')).toEqual([
      {
        type: 'strong',
        children: [text('very '), { type: 'em', children: [text('red')] }],
      },
    ])
  })

  it('links to an https address or a path on this site', () => {
    expect(
      parseInlineMarkdown(
        '[Britannica](https://www.britannica.com/x) and [ours](/vermilion/)',
      ),
    ).toEqual([
      {
        type: 'link',
        href: 'https://www.britannica.com/x',
        children: [text('Britannica')],
      },
      text(' and '),
      { type: 'link', href: '/vermilion/', children: [text('ours')] },
    ])
  })

  it.each([
    'javascript:alert(1)',
    'http://example.com',
    '//evil.example',
    'data:text/html,hi',
  ])('keeps the text of a link to %s and drops the link', (url) => {
    expect(parseInlineMarkdown(`[click](${url})`)).toEqual([text('click')])
  })

  it('reads an address with parentheses in it whole', () => {
    expect(
      parseInlineMarkdown(
        '[carmine](https://en.wikipedia.org/wiki/Carmine_(pigment)) lake',
      ),
    ).toEqual([
      {
        type: 'link',
        href: 'https://en.wikipedia.org/wiki/Carmine_(pigment)',
        children: [text('carmine')],
      },
      text(' lake'),
    ])
  })

  it('formats inside a link label', () => {
    expect(parseInlineMarkdown('[*carmine*](/carmine/)')).toEqual([
      {
        type: 'link',
        href: '/carmine/',
        children: [{ type: 'em', children: [text('carmine')] }],
      },
    ])
  })

  it('never nests a link inside a link', () => {
    // The outer brackets are not a link once they hold one; the inner link
    // stands, and the rest is the characters typed.
    expect(parseInlineMarkdown('[*a* [b](/c)](/d)')).toEqual([
      text('['),
      { type: 'em', children: [text('a')] },
      text(' '),
      { type: 'link', href: '/c', children: [text('b')] },
      text('](/d)'),
    ])
  })

  it('honours backslash escapes', () => {
    expect(parseInlineMarkdown('\\*not italic\\* and 1\\_2')).toEqual([
      text('*not italic* and 1_2'),
    ])
  })

  it('treats HTML as the characters typed', () => {
    expect(parseInlineMarkdown('<b>x</b> <script>')).toEqual([
      text('<b>x</b> <script>'),
    ])
  })

  it('is empty for nothing', () => {
    expect(parseInlineMarkdown('')).toEqual([])
    expect(parseInlineMarkdown(null)).toEqual([])
  })
})

describe('inlineMarkdownToPlainText', () => {
  it('keeps the words and drops the markup and URLs', () => {
    expect(
      inlineMarkdownToPlainText(
        '*Dactylopius coccus*, see [Britannica](https://b.example/x) `E120`',
      ),
    ).toBe('Dactylopius coccus, see Britannica E120')
  })
})
