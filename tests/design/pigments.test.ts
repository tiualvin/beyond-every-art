import { describe, expect, it } from 'vitest'

import {
  assignPigments,
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

describe('assignPigments', () => {
  /** The live subject list, largest first, as the homepage renders it. */
  const LIVE = [
    'art',
    'palette',
    'studio-notes',
    'exhibitions',
    'music',
    'studio-insider',
    'science-of-art-materials',
    'materials-science',
  ]

  it('gives every live subject its own colour', () => {
    // The regression this exists for: hashing each slug on its own gave these
    // eight subjects four colours, four of them sharing one cream, three of
    // those adjacent at the tail of the row.
    const assigned = assignPigments(LIVE)
    const used = new Set([...assigned.values()].map((p) => p.hex))
    expect(assigned.size).toBe(LIVE.length)
    expect(used.size).toBe(LIVE.length)
  })

  it('is distinct for any set the palette can hold', () => {
    const slugs = PIGMENTS.map((_, i) => `subject-${i}`)
    const used = new Set([...assignPigments(slugs).values()].map((p) => p.hex))
    expect(used.size).toBe(PIGMENTS.length)
  })

  it('terminates when there are more subjects than pigments', () => {
    // Past the palette it cannot stay distinct; what it must not do is spin.
    const slugs = Array.from({ length: PIGMENTS.length + 4 }, (_, i) => `s${i}`)
    const assigned = assignPigments(slugs)
    expect(assigned.size).toBe(slugs.length)
    for (const pigment of assigned.values()) {
      expect(PIGMENTS).toContainEqual(pigment)
    }
  })

  it('does not depend on the order it is given', () => {
    // Render order is by post count, which moves every time something is
    // published. Assignment sorts internally so a publish cannot repaint the
    // row.
    const forwards = assignPigments(LIVE)
    const backwards = assignPigments([...LIVE].reverse())
    for (const slug of LIVE) {
      expect(backwards.get(slug)).toEqual(forwards.get(slug))
    }
  })

  it("prefers a subject's hashed pigment when it is free", () => {
    const [slug] = LIVE
    expect(assignPigments([slug!]).get(slug!)).toEqual(pigmentFor(slug!))
  })

  it('ignores a repeated slug', () => {
    const assigned = assignPigments(['palette', 'palette', 'art'])
    expect(assigned.size).toBe(2)
  })
})
