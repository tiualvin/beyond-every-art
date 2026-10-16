// The app's colours, from the website's own tokens.
//
// Light is the website: paper, ink and burgundy, as generated from
// app/globals.css. Dark is a PROPOSAL for the owner's review — the website has
// no dark palette — and it is derived rather than invented: every colour in it
// is a brand token or a mix of two, so it stays the same family. Each palette
// has an increased-contrast variant for readers who ask the system for one.
// tests/palette.test.ts holds every text pairing to WCAG AA.

import { BRAND_COLORS as brand } from '../generated/brand-tokens'
import { mix } from './colour'

export type Palette = {
  /** The page. */
  background: string
  /** Cards, sheets and chrome laid over the page. */
  surface: string
  text: string
  /** Bylines, dates, captions. */
  muted: string
  /** Links and the accent on text-sized marks. */
  accent: string
  /** A filled button. */
  button: string
  onButton: string
  /** Hairlines; decorative, never the only sign of anything. */
  line: string
  /** Stronger dividers. */
  rule: string
  /** The callout tone the website calls dark, and its text. */
  inverse: string
  onInverse: string
  /** Where a missing image goes: the website's plate wash, as stops. */
  plate: [string, string, string]
}

export type Scheme = 'light' | 'dark'

const light: Palette = {
  background: brand.paper,
  surface: brand.surface,
  text: brand.ink,
  muted: brand.muted,
  accent: brand.burgundy,
  button: brand.burgundy,
  onButton: brand.surface,
  line: brand.line,
  rule: brand.rule,
  inverse: brand.dark,
  onInverse: brand.onDark,
  plate: [brand.burgundy, brand.burgundyDeep, brand.dark],
}

/** PROPOSED: not on the website, and waiting on the owner. */
const dark: Palette = {
  background: brand.dark,
  surface: mix(brand.onDark, brand.dark, 0.06),
  text: brand.onDark,
  muted: mix(brand.onDark, brand.dark, 0.68),
  accent: mix(brand.burgundy, brand.paper, 0.5),
  button: brand.burgundy,
  onButton: brand.onDark,
  line: mix(brand.onDark, brand.dark, 0.16),
  rule: mix(brand.onDark, brand.dark, 0.34),
  inverse: brand.surface,
  onInverse: brand.ink,
  plate: [brand.burgundy, brand.burgundyDeep, brand.dark],
}

/** Muted text pulled halfway to the body text, and the rule doing the line's job. */
function withIncreasedContrast(palette: Palette): Palette {
  return {
    ...palette,
    muted: mix(palette.muted, palette.text, 0.5),
    line: palette.rule,
    rule: mix(palette.rule, palette.text, 0.5),
  }
}

export function paletteFor(scheme: Scheme, increaseContrast: boolean): Palette {
  const base = scheme === 'dark' ? dark : light
  return increaseContrast ? withIncreasedContrast(base) : base
}

export const PALETTES = { light, dark } as const
