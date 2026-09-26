import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  AD_SLOTS,
  minViewportWidth,
  MOBILE_MAX_WIDTH,
  slotMediaQuery,
  reservedHeight,
  SLOT_SIZES,
  slotIdsAreWellFormed,
  type Placement,
} from '@/lib/ads/placements'

const rail = readFileSync(
  join(process.cwd(), 'app/(frontend)/components/article-rail.tsx'),
  'utf8',
)
const body = readFileSync(
  join(process.cwd(), 'app/(frontend)/components/body.tsx'),
  'utf8',
)

describe('the placement inventory', () => {
  // A slot id is interpolated into a `data-ad-slot` attribute. A malformed one
  // does not error anywhere — the unit simply never fills, which looks exactly
  // like an unsold impression and is the failure this area is prone to.
  it('holds only ids AdSense could have issued', () => {
    expect(slotIdsAreWellFormed()).toBe(true)
  })

  // Every placement reserves something before anything fills it, whichever
  // shape it is. Zero would be a unit that pushes the page down when it lands.
  it('gives every placement a height to reserve', () => {
    for (const placement of Object.keys(AD_SLOTS) as Placement[]) {
      expect(SLOT_SIZES[placement]).toBeTruthy()
      expect(reservedHeight(placement)).toBeGreaterThan(0)
    }
  })

  // docs/ADVERTISING.md §8: the rail carries a 300x250, because the rail is a
  // 300px track. A wider unit would overflow it and a responsive one would
  // reintroduce the layout shift the reservation exists to prevent.
  it('sizes the rail unit to the rail', () => {
    expect(SLOT_SIZES['rail-1']).toEqual({
      kind: 'fixed',
      width: 300,
      height: 250,
    })
  })

  // A fluid unit has no maximum, so §8's "reserve the maximum" cannot be
  // honoured literally; the floor is what there is. Saying which shape a slot
  // is, in the type, is what stops a renderer guessing.
  it('marks the in-article unit as the one with no fixed height', () => {
    const size = SLOT_SIZES['article-inline']
    expect(size.kind).toBe('fluid')
    expect(reservedHeight('article-inline')).toBeGreaterThanOrEqual(250)
  })

  // Only placements with a call site. §8 has five and four are unbuilt; a name
  // with nothing rendering it is a name nobody has had to make work.
  it('lists only the placements something renders', () => {
    expect(Object.keys(AD_SLOTS)).toEqual(['rail-1', 'article-inline'])
    expect(rail).toContain('placement="rail-1"')
    expect(body).toContain('placement="article-inline"')
  })
})

// §8's rule for every placement: decide what the space says when the network
// says nothing, because that is what a large share of readers actually see.
// Both built units now answer it, and the in-body one went a release without
// answering it while a test asserted only that the placement was named — which
// is why these check what is passed rather than that something renders.
describe('an unfilled slot', () => {
  it('gives the rail box something to hold', () => {
    expect(rail).toContain('<RailFallback')
  })

  // The defect: `<AdUnit placement="article-inline" client={adClient!} />`,
  // self-closing, in both body branches. It renders a labelled empty box on
  // every article a blocker or an unsold impression touches, and nothing about
  // it looks wrong at the call site.
  it('gives every in-body box something to hold', () => {
    expect(body).toContain('<InlinePromo post={promo} />')
    expect(body).not.toMatch(/<AdUnit[^>]*\/>/)
  })

  // House content is not the ad and is never handed to the network as though
  // it were: it is passed as children, which `AdUnit` renders beside the
  // `<ins>` and reveals only once Google has declined the slot.
  it('keeps the house content out of the unit', () => {
    expect(body).toMatch(/<AdUnit[^>]*>\s*\{promo && <InlinePromo/)
  })
})

describe('a placement its track has hidden', () => {
  // The bug this exists to stop: `.article__rail` is `display: none` below
  // 1280px, the component mounts anyway, and every phone that opens an article
  // asks Google to fill a box nobody can see. CSS cannot prevent that, so the
  // breakpoint has to be readable from the code that does the asking.
  it('gives the rail unit the viewport its track needs', () => {
    expect(minViewportWidth('rail-1')).toBe(1280)
  })

  // The reading column exists at every width, so the in-article unit has no
  // requirement. A number here would stop it filling on phones, which is where
  // most of the reading happens.
  it('puts no requirement on a unit in the reading column', () => {
    expect(minViewportWidth('article-inline')).toBeNull()
  })

  it('asks the browser before pushing, and keeps listening', () => {
    const unit = readFileSync(
      join(process.cwd(), 'app/(frontend)/components/ad-unit.tsx'),
      'utf8',
    )

    // Read from the placement rather than written into the component, so the
    // stylesheet, the placement and the push cannot disagree.
    expect(unit).toMatch(/slotMediaQuery\(placement, tier\)/)
    expect(unit).toMatch(/window\.matchMedia\(media\)/)

    // Watched, not read once: a window dragged wider brings the track back.
    expect(unit).toMatch(/addEventListener\('change'/)
    expect(unit).toMatch(/removeEventListener\('change'/)
  })
})

describe('the phone-only tier', () => {
  // The same bug the other way up: a phone-only unit is `display: none` above
  // the phone breakpoint, and hiding it stops nothing in JavaScript.
  it('asks for an ad only at phone width', () => {
    expect(slotMediaQuery('article-inline', 'mobile')).toBe(
      `(max-width: ${MOBILE_MAX_WIDTH}px)`,
    )
  })

  it('leaves the ordinary in-article unit free to fill everywhere', () => {
    expect(slotMediaQuery('article-inline')).toBeNull()
  })

  it('keeps the rail unit to the width its track needs', () => {
    expect(slotMediaQuery('rail-1')).toBe('(min-width: 1280px)')
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
