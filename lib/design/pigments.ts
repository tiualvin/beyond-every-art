// The palette the topic swatches are painted from.
//
// Tags carry no colour of their own, and adding one would put a presentation
// detail into the content model for no editorial gain. Instead each subject is
// assigned a pigment deterministically from its slug, so a topic keeps the same
// colour across every page and every deploy without anyone maintaining it.

export type Pigment = {
  /** Display name, used where the material itself is the subject. */
  name: string
  hex: string
}

export const PIGMENTS: Pigment[] = [
  { name: 'Ultramarine', hex: '#1f3a93' },
  { name: 'Cadmium Yellow', hex: '#c9820a' },
  { name: 'Lead White', hex: '#efe9dd' },
  { name: 'Burnt Sienna', hex: '#8a3a1e' },
  { name: 'Viridian', hex: '#2e6b52' },
  { name: 'Bone Black', hex: '#20211f' },
]

const INK = '#1b1714'
const ON_DARK = '#f3ede4'

/** FNV-1a, for a stable spread across the palette from a short string. */
function hash(value: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export function pigmentFor(slug: string): Pigment {
  return PIGMENTS[hash(slug) % PIGMENTS.length]
}

function channel(value: number): number {
  const c = value / 255
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

export function luminance(hex: string): number {
  const n = Number.parseInt(hex.replace('#', ''), 16)
  return (
    0.2126 * channel((n >> 16) & 255) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255)
  )
}

function ratio(a: number, b: number): number {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

/**
 * Whichever brand text colour actually contrasts better against the pigment.
 *
 * Picking one and hoping fails at both ends of the palette: ink vanishes on
 * Bone Black, cream vanishes on Lead White. Comparing both is the only way to
 * stay readable across a palette that spans near-white to near-black.
 */
export function textOn(hex: string): string {
  const l = luminance(hex)
  return ratio(l, luminance(INK)) >= ratio(l, luminance(ON_DARK))
    ? INK
    : ON_DARK
}
