// The brand's colours as a reader sees them named: what the Today card shows
// and what the Studio offers. Names come from the website's own token names;
// nothing here says anything about a pigment that the tokens do not.

import { BRAND_COLORS, PIGMENT_COLORS } from '../generated/brand-tokens'

export type NamedColour = { name: string; hex: string }

const humanise = (key: string) => {
  const words = key.replace(/([A-Z])/g, ' $1').toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export const PIGMENTS: NamedColour[] = Object.entries(PIGMENT_COLORS).map(
  ([key, hex]) => ({
    name: humanise(key),
    hex,
  }),
)

/** The palette colours a painter would pick from; not the interface greys. */
const BRAND_PICKS = [
  'paper',
  'ink',
  'burgundy',
  'burgundyDeep',
  'dark',
] as const

export const STUDIO_COLOURS: NamedColour[] = [
  ...BRAND_PICKS.map((key) => ({
    name: humanise(key),
    hex: BRAND_COLORS[key],
  })),
  ...PIGMENTS,
]

/** A new palette starts from the brand: paper, ink, burgundy and two pigments. */
export const STARTER_PALETTE = [
  BRAND_COLORS.paper,
  BRAND_COLORS.ink,
  BRAND_COLORS.burgundy,
  PIGMENT_COLORS.cadmium,
  PIGMENT_COLORS.viridian,
]

export function nameOf(hex: string): string {
  return (
    STUDIO_COLOURS.find((colour) => colour.hex === hex.toLowerCase())?.name ??
    hex.toUpperCase()
  )
}

/** One pigment colour per day, in turn, the same for everyone on that UTC date. */
export function pigmentOfTheDay(date: Date): NamedColour {
  const day = Math.floor(date.getTime() / 86_400_000)
  return PIGMENTS[
    ((day % PIGMENTS.length) + PIGMENTS.length) % PIGMENTS.length
  ]!
}
