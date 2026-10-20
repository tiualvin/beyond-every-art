// Every pairing of text and background the app draws, held to WCAG AA.

import { BRAND_COLORS } from '../../generated/brand-tokens'
import { DAILY_COLOURS } from '../../screens/colours'
import { contrastRatio, hexToRgb, mix, readableOn, tone } from '../colour'
import { PALETTES, inverseOf, paletteFor, type Palette } from '../palette'
import { chromeTreatment } from '../chrome'

const AA_TEXT = 4.5

const variants: [string, Palette][] = [
  ['light', paletteFor('light', false)],
  ['light, increased contrast', paletteFor('light', true)],
  ['dark', paletteFor('dark', false)],
  ['dark, increased contrast', paletteFor('dark', true)],
  ['inverse of light', inverseOf(paletteFor('light', false))],
  ['inverse of dark', inverseOf(paletteFor('dark', false))],
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
    ['onTonal', 'tonal'],
    ['onInverse', 'inverse'],
  ] as const)('%s on %s meets AA for body text', (foreground, background) => {
    expect(
      contrastRatio(palette[foreground], palette[background]),
    ).toBeGreaterThanOrEqual(AA_TEXT)
  })

  it.each(['background', 'surface'] as const)(
    'draws a text field’s border at 3:1 against the %s',
    (background) => {
      expect(
        contrastRatio(palette.field, palette[background]),
      ).toBeGreaterThanOrEqual(3)
    },
  )
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

describe('the dark palette (proposed)', () => {
  const dark = paletteFor('dark', false)
  const hueOf = (hex: string) => {
    const [r, g, b] = hexToRgb(hex).map((channel) => channel / 255) as [
      number,
      number,
      number,
    ]
    const max = Math.max(r, g, b)
    const delta = max - Math.min(r, g, b)
    return (60 * (((g - b) / delta + 6) % 6) + 360) % 360
  }

  it('keeps burgundy’s hue in its accent, rather than draining it into mauve', () => {
    expect(hueOf(dark.accent)).toBeCloseTo(hueOf(BRAND_COLORS.burgundy), 0)
    expect(dark.accent).toBe(tone(BRAND_COLORS.burgundy, 0.67, 0.45))
  })

  it.each([
    ['light', paletteFor('light', false)],
    ['light, increased contrast', paletteFor('light', true)],
    ['dark', dark],
    ['dark, increased contrast', paletteFor('dark', true)],
  ] as const)(
    'draws the %s button at 3:1 against the page, so it reads as a control',
    (_, palette) => {
      expect(
        contrastRatio(palette.button, palette.background),
      ).toBeGreaterThanOrEqual(3)
    },
  )

  it('keeps a dark callout dark, darker than the text on the page', () => {
    expect(contrastRatio(dark.inverse, dark.text)).toBeGreaterThan(10)
    expect(contrastRatio(dark.onInverse, dark.inverse)).toBeGreaterThanOrEqual(
      AA_TEXT,
    )
  })

  it('ends the plate wash short of the page, so a missing image keeps an edge', () => {
    expect(dark.plate[2]).not.toBe(dark.background)
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

describe('the colour of the day', () => {
  // Its name, hex and label sit on the colour itself, the label at 12pt.
  it.each(DAILY_COLOURS.map((colour) => [colour.name, colour.hex]))(
    'sets its text on %s at AA',
    (_, hex) => {
      const ink = readableOn(hex, BRAND_COLORS.onDark, BRAND_COLORS.ink)
      expect(contrastRatio(ink, hex)).toBeGreaterThanOrEqual(AA_TEXT)
    },
  )
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
