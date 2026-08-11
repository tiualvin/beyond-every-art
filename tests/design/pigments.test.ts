import { describe, expect, it } from 'vitest'

import {
  PIGMENTS,
  luminance,
  pigmentFor,
  textOn,
} from '../../lib/design/pigments'

describe('pigmentFor', () => {
  it('gives a slug the same pigment every time', () => {
    expect(pigmentFor('materials')).toEqual(pigmentFor('materials'))
  })

  it('always returns a pigment from the palette', () => {
    for (const slug of [
      'materials',
      'art-history',
      'x',
      '',
      'ünïcödé',
      '123',
    ]) {
      expect(PIGMENTS).toContainEqual(pigmentFor(slug))
    }
  })

  it('spreads a realistic set of tags across more than one pigment', () => {
    const slugs = [
      'materials',
      'art-history',
      'creative-practice',
      'exhibitions',
      'conservation',
      'colour-and-light',
    ]
    const used = new Set(slugs.map((slug) => pigmentFor(slug).hex))
    expect(used.size).toBeGreaterThan(1)
  })
})

describe('textOn', () => {
  // The palette spans near-white to near-black, so a single text colour is
  // guaranteed to fail at one end. These are the two ends.
  it('puts ink on the palest pigment', () => {
    expect(textOn('#efe9dd')).toBe('#1b1714')
  })

  it('puts cream on the darkest pigment', () => {
    expect(textOn('#20211f')).toBe('#f3ede4')
  })

  it('clears WCAG AA body text against every pigment', () => {
    for (const pigment of PIGMENTS) {
      const bg = luminance(pigment.hex)
      const fg = luminance(textOn(pigment.hex))
      const contrast = (Math.max(bg, fg) + 0.05) / (Math.min(bg, fg) + 0.05)
      expect(contrast).toBeGreaterThanOrEqual(4.5)
    }
  })
})
