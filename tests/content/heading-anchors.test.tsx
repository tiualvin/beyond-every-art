// The anchoring rules are unit-tested in `headings.test.ts`. This one proves
// the converter is actually wired into the body renderer, which is the part a
// refactor can quietly undo without a single pure test failing.

import { RichText } from '@payloadcms/richtext-lexical/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { buildConverters } from '../../app/(frontend)/components/blocks/registry'

const text = (value: string) => ({
  type: 'text',
  detail: 0,
  format: 0,
  mode: 'normal',
  style: '',
  text: value,
  version: 1,
})

const heading = (tag: string, value: string) => ({
  type: 'heading',
  tag,
  version: 1,
  direction: 'ltr',
  format: '',
  indent: 0,
  children: [text(value)],
})

const body = (children: unknown[]) => ({
  root: {
    type: 'root',
    direction: 'ltr',
    format: '',
    indent: 0,
    version: 1,
    children,
  },
})

const render = (children: unknown[]) =>
  renderToStaticMarkup(
    <RichText
      data={body(children) as never}
      converters={buildConverters(false)}
      disableContainer
    />,
  )

describe('body headings', () => {
  it('anchors each heading with an id derived from its text', () => {
    const html = render([
      heading('h2', 'Binders and behaviour'),
      heading('h3', 'Linseed versus gum arabic'),
    ])

    expect(html).toContain('<h2 id="binders-and-behaviour">')
    expect(html).toContain('<h3 id="linseed-versus-gum-arabic">')
  })

  it('keeps repeated headings addressable separately', () => {
    const html = render([heading('h2', 'Method'), heading('h2', 'Method')])

    expect(html).toContain('id="method"')
    expect(html).toContain('id="method-2"')
  })

  it('starts numbering afresh for the next document rendered', () => {
    render([heading('h2', 'Method')])
    expect(render([heading('h2', 'Method')])).toContain('id="method"')
  })

  it('preserves the heading level the editor chose', () => {
    const html = render([heading('h4', 'A footnote of a section')])
    expect(html).toContain('<h4 id="a-footnote-of-a-section">')
  })
})
