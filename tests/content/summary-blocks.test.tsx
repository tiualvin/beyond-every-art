import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { Faq } from '../../app/(frontend)/components/blocks/faq'
import { FeatureList } from '../../app/(frontend)/components/blocks/feature-list'
import { KeyTakeaways } from '../../app/(frontend)/components/blocks/key-takeaways'

const render = (node: React.ReactNode) => renderToStaticMarkup(node)

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

const media = (url: string, alt = 'A swatch') => ({
  url,
  alt,
  width: 800,
  height: 600,
  filename: 'swatch.jpg',
})

describe('KeyTakeaways', () => {
  const items = [{ text: 'Lapis and ultramarine are not the same thing.' }]

  it('is a labelled section with an ordered list, not an aside', () => {
    // The element choice is the module: a summary of the argument is part of
    // the argument, and `<aside>` says the opposite.
    const html = render(
      <KeyTakeaways data={{ items }} anchor="key-takeaways" />,
    )

    expect(html).toContain('<section')
    expect(html).not.toContain('<aside')
    expect(html).toContain('<ol')
    expect(html).toContain('aria-labelledby="key-takeaways"')
    expect(html).toContain('id="key-takeaways"')
  })

  it('falls back to a default heading', () => {
    expect(render(<KeyTakeaways data={{ items }} anchor="a" />)).toContain(
      'Key takeaways',
    )
  })

  it('drops blank takeaways and renders nothing when none are left', () => {
    const html = render(
      <KeyTakeaways
        data={{ items: [{ text: '  ' }, { text: 'Kept.' }] }}
        anchor="a"
      />,
    )
    expect(html.match(/<li/g)).toHaveLength(1)

    expect(
      render(<KeyTakeaways data={{ items: [{ text: '' }] }} anchor="a" />),
    ).toBe('')
  })
})

describe('Faq', () => {
  const items = [
    { question: 'Is lapis ultramarine?', answer: richText('Not quite.') },
    { question: 'What replaced it?', answer: richText('A synthetic.') },
  ]
  const anchors = ['is-lapis-ultramarine', 'what-replaced-it']

  it('puts each question in the outline as a heading with its own anchor', () => {
    // The whole reason this is not the dropdown block: an anonymous bold
    // question contributes nothing to the document outline and cannot be
    // linked to on its own.
    const html = render(
      <Faq data={{ items }} anchors={anchors} headingAnchor="faq" />,
    )

    expect(html).toContain(
      '<h3 class="faq__question" id="is-lapis-ultramarine"',
    )
    expect(html).toContain('<h3 class="faq__question" id="what-replaced-it"')
  })

  it('uses native disclosure elements', () => {
    const html = render(
      <Faq data={{ items }} anchors={anchors} headingAnchor="faq" />,
    )

    expect(html).toContain('<details')
    expect(html).toContain('<summary')
    expect(html).toContain('Not quite.')
  })

  it('renders closed by default and open in preview', () => {
    const closed = render(
      <Faq data={{ items }} anchors={anchors} headingAnchor="faq" />,
    )
    const open = render(
      <Faq data={{ items }} anchors={anchors} headingAnchor="faq" preview />,
    )

    expect(closed).not.toContain('open=""')
    expect(open).toContain('open=""')
  })

  it('drops a question with no text, keeping the remaining anchors aligned', () => {
    // Anchors are allocated per stored item, so a dropped row must not shift
    // the anchor of the row after it onto the wrong question.
    const html = render(
      <Faq
        data={{ items: [{ question: '  ' }, items[1]] }}
        anchors={['unused', 'what-replaced-it']}
        headingAnchor="faq"
      />,
    )

    expect(html.match(/<details/g)).toHaveLength(1)
    expect(html).toContain('id="what-replaced-it"')
    expect(html).not.toContain('id="unused"')
  })

  it('renders nothing without a usable question', () => {
    expect(
      render(
        <Faq
          data={{ items: [{ question: '' }] }}
          anchors={[]}
          headingAnchor="faq"
        />,
      ),
    ).toBe('')
  })
})

describe('FeatureList', () => {
  const items = [
    { title: 'Ultramarine', body: 'Ground lapis, once.' },
    { title: 'Vermilion' },
  ]
  const anchors = ['ultramarine', 'vermilion']

  it('gives every item a heading with its own anchor', () => {
    const html = render(
      <FeatureList data={{ items }} anchors={anchors} headingAnchor="" />,
    )

    expect(html).toContain('id="ultramarine"')
    expect(html).toContain('id="vermilion"')
    expect(html).toContain('<h3')
  })

  it('is an ordered list by default and unordered when the order means nothing', () => {
    expect(
      render(
        <FeatureList data={{ items }} anchors={anchors} headingAnchor="" />,
      ),
    ).toContain('<ol')

    expect(
      render(
        <FeatureList
          data={{ items, numbered: false }}
          anchors={anchors}
          headingAnchor=""
        />,
      ),
    ).toContain('<ul')
  })

  it('reads a document saved before `numbered` existed as numbered', () => {
    expect(
      render(
        <FeatureList data={{ items }} anchors={anchors} headingAnchor="" />,
      ),
    ).toContain('<ol')
  })

  it('labels the section only when there is a heading to label it with', () => {
    const withHeading = render(
      <FeatureList
        data={{ heading: 'Six pigments', items }}
        anchors={anchors}
        headingAnchor="six-pigments"
      />,
    )
    const without = render(
      <FeatureList data={{ items }} anchors={anchors} headingAnchor="" />,
    )

    expect(withHeading).toContain('aria-labelledby="six-pigments"')
    expect(without).not.toContain('aria-labelledby')
  })

  it('renders an item image when there is one and no frame when there is not', () => {
    const html = render(
      <FeatureList
        data={{ items: [{ title: 'Ultramarine', image: media('/u.jpg') }] }}
        anchors={['ultramarine']}
        headingAnchor=""
      />,
    )

    expect(html).toContain('feature-list__frame')
    expect(html).toContain('alt="A swatch"')
    expect(
      render(
        <FeatureList data={{ items }} anchors={anchors} headingAnchor="" />,
      ),
    ).not.toContain('feature-list__frame')
  })

  it('renders nothing without a usable item', () => {
    expect(
      render(
        <FeatureList
          data={{ items: [{ body: 'No title' }] }}
          anchors={[]}
          headingAnchor=""
        />,
      ),
    ).toBe('')
  })
})
