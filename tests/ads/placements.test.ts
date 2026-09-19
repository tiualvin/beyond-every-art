import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  AD_SLOTS,
  SLOT_SIZES,
  slotIdsAreWellFormed,
  type Placement,
} from '@/lib/ads/placements'

const rail = readFileSync(
  join(process.cwd(), 'app/(frontend)/components/article-rail.tsx'),
  'utf8',
)

describe('the placement inventory', () => {
  // A slot id is interpolated into a `data-ad-slot` attribute. A malformed one
  // does not error anywhere — the unit simply never fills, which looks exactly
  // like an unsold impression and is the failure this area is prone to.
  it('holds only ids AdSense could have issued', () => {
    expect(slotIdsAreWellFormed()).toBe(true)
  })

  it('gives every placement a size to reserve', () => {
    for (const placement of Object.keys(AD_SLOTS) as Placement[]) {
      expect(SLOT_SIZES[placement]).toBeTruthy()
      expect(SLOT_SIZES[placement].width).toBeGreaterThan(0)
      expect(SLOT_SIZES[placement].height).toBeGreaterThan(0)
    }
  })

  // docs/ADVERTISING.md §8: the rail carries a 300x250, because the rail is a
  // 300px track. A wider unit would overflow it and a responsive one would
  // reintroduce the layout shift the reservation exists to prevent.
  it('sizes the rail unit to the rail', () => {
    expect(SLOT_SIZES['rail-1']).toEqual({ width: 300, height: 250 })
  })

  // Only placements with a call site. §8 has five and four are unbuilt; a name
  // with nothing rendering it is a name nobody has had to make work.
  it('lists only the placements something renders', () => {
    expect(Object.keys(AD_SLOTS)).toEqual(['rail-1'])
    expect(rail).toContain('placement="rail-1"')
  })
})

describe('the rail unit', () => {
  // The loader lives in the layout and React dedupes it by `src`; the tag
  // throws if it is evaluated twice on one page. A unit that brought its own
  // loader would break as soon as a second unit appeared.
  it('does not bring its own loader', () => {
    const unit = readFileSync(
      join(process.cwd(), 'app/(frontend)/components/ad-unit.tsx'),
      'utf8',
    )
    expect(unit).not.toContain('pagead2.googlesyndication.com')
    expect(unit).not.toContain('adsenseScriptUrl')
  })

  // §8's rule for this slot specifically: it sits in a sticky group and is in
  // view for most of an article, which is the classic case for refresh and the
  // classic way to turn a rail into a nuisance.
  it('is pushed once and never refreshed', () => {
    const unit = readFileSync(
      join(process.cwd(), 'app/(frontend)/components/ad-unit.tsx'),
      'utf8',
    )
    expect(unit.match(/adsbygoogle\s*=\s*window\.adsbygoogle/g)!.length).toBe(1)
    expect(unit).not.toMatch(/setInterval/)
  })
})
