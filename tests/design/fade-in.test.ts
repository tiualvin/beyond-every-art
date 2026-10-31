// The hero's entrance must not wait for JavaScript.
//
// `FadeIn` wraps the title, standfirst, byline and featured image of a post and
// the homepage cover — the Largest Contentful Paint element on every template.
// It used to be a framer-motion component, which server-rendered those at
// `opacity: 0` and revealed them on hydration: measured on a throttled phone
// against the live site, LCP was 4.0–4.7s with that gate and 1.1–1.5s without
// it. A reader whose script failed never saw the title at all.
//
// None of that shows up in a unit test of behaviour, and the page still looks
// right in a browser with a fast machine. So the constraints are pinned here
// as what they are: the component ships no script and no inline hidden state,
// and the stylesheet keeps the hidden state inside the motion query, as an
// animation frame only.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { describe, expect, it } from 'vitest'

import { FadeIn } from '../../app/(frontend)/components/motion/fade-in'

const source = readFileSync(
  resolve(
    import.meta.dirname,
    '../../app/(frontend)/components/motion/fade-in.tsx',
  ),
  'utf8',
)
const css = readFileSync(
  resolve(import.meta.dirname, '../../app/globals.css'),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//g, '')

const render = (props: Parameters<typeof FadeIn>[0]) =>
  renderToStaticMarkup(createElement(FadeIn, props))

/** Every `@media` block whose condition is `query`, whole, braces balanced. */
function mediaBlocks(query: string): string[] {
  const out: string[] = []
  let from = 0
  for (;;) {
    const start = css.indexOf(`@media ${query}`, from)
    if (start === -1) return out
    const open = css.indexOf('{', start)
    let depth = 1
    let i = open + 1
    while (depth > 0 && i < css.length) {
      if (css[i] === '{') depth++
      else if (css[i] === '}') depth--
      i++
    }
    out.push(css.slice(start, i))
    from = i
  }
}

describe('FadeIn', () => {
  it('is not a client component, so the reveal cannot wait on hydration', () => {
    expect(source).not.toMatch(/^\s*['"]use client['"]/m)
    expect(source).not.toMatch(/from ['"]framer-motion['"]/)
  })

  it('renders no inline hidden state — the server HTML is visible as sent', () => {
    const html = render({ children: 'Title', delay: 0.25, direction: 'none' })
    expect(html).not.toMatch(/opacity/)
    expect(html).not.toMatch(/visibility|display:\s*none/)
  })

  it('adds nothing but the class in the common case', () => {
    expect(render({ children: 'x' })).toBe('<div class="fade-in">x</div>')
  })

  it('keeps a caller’s class on the same box, which the article grid places', () => {
    expect(
      render({ children: 'x', className: 'article__figure-frame' }),
    ).toContain('class="fade-in article__figure-frame"')
  })

  it('carries the stagger and direction as custom properties', () => {
    const html = render({ children: 'x', delay: 0.08, direction: 'none' })
    expect(html).toContain('--fade-delay:0.08s')
    expect(html).toContain('--fade-y:0px')
  })
})

describe('the fade-in rule', () => {
  const blocks = mediaBlocks('(prefers-reduced-motion: no-preference)')
  const motion = blocks.join('\n')

  it('lives inside the motion query, so reduced motion gets content, not a reveal', () => {
    expect(motion).toMatch(/\.fade-in\s*\{[^}]*animation:\s*fade-in\b/)
    // Outside the query nothing may name the class: a hidden state there is
    // content that a reader who asked for no motion never sees.
    const outside = blocks.reduce((rest, block) => rest.replace(block, ''), css)
    expect(outside).not.toMatch(/\.fade-in\b/)
  })

  it('fills backwards, never forwards', () => {
    const rule = motion.match(/\.fade-in\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(rule).toMatch(/\bbackwards\b/)
    expect(rule).not.toMatch(/\b(forwards|both)\b/)
  })

  it('hides only in the from frame of the keyframes', () => {
    const keyframes = css.match(/@keyframes fade-in\s*\{([\s\S]*?\})\s*\}/)?.[1]
    expect(keyframes).toBeDefined()
    expect(keyframes).toMatch(/from\s*\{[^}]*opacity:\s*0/)
    expect(keyframes).not.toMatch(/\bto\s*\{|100%/)
  })
})
