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
  // Six more, because `assignPigments` cannot give eight subjects distinct
  // colours out of six slots however it walks. Every one is a real pigment and
  // every one clears AA against whichever brand text colour `textOn` picks for
  // it — the test in `tests/design/pigments.test.ts` is what holds that true,
  // and it is why Terre Verte (#5d7355) is not here: it came back at 4.46:1.
  { name: 'Vermilion', hex: '#b03227' },
  { name: 'Prussian Blue', hex: '#12305c' },
  { name: 'Verdigris', hex: '#3f8f86' },
  { name: 'Naples Yellow', hex: '#f0dcae' },
  { name: 'Raw Umber', hex: '#6b4a2f' },
  { name: 'Madder Lake', hex: '#8e2f42' },
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

/**
 * A pigment each, for a set of subjects shown together.
 *
 * `pigmentFor` alone cannot do this. It hashes a slug into the palette, and a
 * hash collides long before the palette runs out — with the live tag list,
 * six pigments gave eight subjects four colours, and four of those subjects
 * shared one cream. Doubling the palette did not fix it either: twelve slots
 * still produced six colours for the same eight slugs, and across a sample of
 * plausible eight-slug sets, none came back collision-free. That is the
 * birthday problem, not a palette that is too small.
 *
 * So a collision is resolved rather than tolerated: each subject takes its
 * hashed pigment when that one is free, and otherwise the next free pigment
 * walking forward through the palette. Distinct up to `PIGMENTS.length`
 * subjects, which is the most the swatch row can show at once anyway.
 *
 * **Assigned over slugs sorted alphabetically, deliberately**, not in the order
 * the caller happens to render. Render order is by post count, and a count
 * changes every time something is published — so assigning in that order would
 * repaint half the row whenever an article went out. Sorted by slug, a
 * subject's colour moves only when a subject is added or removed, and only for
 * the ones that actually collide.
 *
 * The trade this accepts, stated plainly: `pigmentFor` promised a slug the same
 * pigment forever, and this does not. A colliding subject's colour depends on
 * which other subjects exist. Distinctness is worth more than that promise —
 * four identical swatches in a row make the chart unreadable, whereas a subject
 * shifting from one pigment to another when the tag list changes is a thing
 * nobody can see happening.
 */
export function assignPigments(slugs: readonly string[]): Map<string, Pigment> {
  const assigned = new Map<string, Pigment>()
  const taken = new Set<number>()

  for (const slug of [...new Set(slugs)].sort()) {
    const preferred = hash(slug) % PIGMENTS.length
    let index = preferred
    // Bounded by the palette: after a full lap every slot is taken, and the
    // subject keeps its hashed pigment rather than looping forever.
    for (let step = 0; step < PIGMENTS.length && taken.has(index); step++) {
      index = (index + 1) % PIGMENTS.length
    }
    taken.add(index)
    assigned.set(slug, PIGMENTS[index]!)
  }

  return assigned
}
