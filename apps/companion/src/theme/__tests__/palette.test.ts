// Every pairing of text and background the app draws, held to WCAG AA.

import { BRAND_COLORS } from '../../generated/brand-tokens'
import { contrastRatio, mix } from '../colour'
import { PALETTES, paletteFor, type Palette } from '../palette'
import { chromeTreatment } from '../chrome'

const AA_TEXT = 4.5

const variants: [string, Palette][] = [
  ['light', paletteFor('light', false)],
  ['light, increased contrast', paletteFor('light', true)],
  ['dark', paletteFor('dark', false)],
  ['dark, increased contrast', paletteFor('dark', true)],
]

describe.each(variants)('the %s palette', (_, palette) => {
  it.each([
    ['text', 'background'],
    ['text', 'surface'],
    ['muted', 'background'],
    ['muted', 'surface'],
    ['accent', 'background'],
    ['accent', 'surface'],
    ['onButton', 'button'],
    ['onInverse', 'inverse'],
  ] as const)('%s on %s meets AA for body text', (foreground, background) => {
    expect(
      contrastRatio(palette[foreground], palette[background]),
    ).toBeGreaterThanOrEqual(AA_TEXT)
  })
})

describe('the light palette', () => {
  it('is the website’s, colour for colour', () => {
    expect(PALETTES.light).toMatchObject({
      background: BRAND_COLORS.paper,
      surface: BRAND_COLORS.surface,
      text: BRAND_COLORS.ink,
      muted: BRAND_COLORS.muted,
      accent: BRAND_COLORS.burgundy,
    })
  })
})

describe('increased contrast', () => {
  it('raises muted text further above AA', () => {
    for (const scheme of ['light', 'dark'] as const) {
      const base = paletteFor(scheme, false)
      const raised = paletteFor(scheme, true)
      expect(contrastRatio(raised.muted, raised.background)).toBeGreaterThan(
        contrastRatio(base.muted, base.background),
      )
    }
  })
})

describe('colour arithmetic', () => {
  it('mixes the way the website’s color-mix does', () => {
    // --color-rule: 26% ink into paper.
    expect(mix(BRAND_COLORS.ink, BRAND_COLORS.paper, 0.26)).toBe(
      BRAND_COLORS.rule,
    )
  })

  it('measures contrast the WCAG way', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrastRatio('#777777', '#777777')).toBe(1)
  })
})

describe('chrome', () => {
  it('uses glass only where the system has it and the reader has not turned it down', () => {
    expect(chromeTreatment('ios', true, false)).toBe('glass')
    expect(chromeTreatment('ios', true, true)).toBe('solid')
    expect(chromeTreatment('ios', false, false)).toBe('solid')
  })

  it('gives Android its own surface rather than an imitation', () => {
    expect(chromeTreatment('android', true, false)).toBe('android')
  })
})
