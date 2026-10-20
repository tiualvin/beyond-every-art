// The type system's rules, so a later tweak cannot quietly flatten it again.

import { formatStyle } from '../../reader/inline'
import { FONT_ASSETS, familyFor } from '../fonts'
import {
  MONOSPACE,
  TYPE_SPECS,
  familyOf,
  type,
  type TypeVariant,
} from '../typography'

const bundled = new Set<string>(Object.keys(FONT_ASSETS))

describe('the type roles', () => {
  it.each(Object.keys(TYPE_SPECS) as TypeVariant[])(
    '%s is set in a bundled family',
    (variant) => {
      const family = type[variant].fontFamily!
      expect(family === MONOSPACE || bundled.has(family)).toBe(true)
    },
  )

  it('steps each headline level at least 15% above the next', () => {
    // Two levels 2pt apart read as one; this is what made every heading look
    // the same. The editorial ladder, largest first. Below it, h4 shares body's
    // size and is told apart by face, which the next test holds.
    const ladder: TypeVariant[] = ['display', 'title', 'h2', 'h3', 'body']
    for (let at = 0; at < ladder.length - 1; at += 1) {
      const larger = TYPE_SPECS[ladder[at]!].size
      const smaller = TYPE_SPECS[ladder[at + 1]!].size
      expect(larger / smaller).toBeGreaterThanOrEqual(1.15)
    }
  })

  it('tells a section label, a list headline and an empty state apart by face, not only size', () => {
    expect(TYPE_SPECS.section.face).toBe('sans')
    expect(TYPE_SPECS.section.upper).toBe(true)
    expect(TYPE_SPECS.rowTitle.face).toBe('serif')
    expect(TYPE_SPECS.emptyTitle.face).toBe('sans')
    expect(TYPE_SPECS.h4.size).toBe(TYPE_SPECS.body.size)
    expect(TYPE_SPECS.h4.face).not.toBe(TYPE_SPECS.body.face)
  })

  it('sets what leads in semibold, list headlines in medium, a standfirst in regular', () => {
    expect(type.display.fontFamily).toBe('PlayfairDisplay_600SemiBold')
    expect(type.rowTitle.fontFamily).toBe('PlayfairDisplay_500Medium')
    expect(type.standfirst.fontFamily).toBe('PlayfairDisplay_400Regular')
    expect(type.quote.fontFamily).toBe('PlayfairDisplay_400Regular_Italic')
  })
})

describe('runs inside a role', () => {
  it('keep the role’s weight, and take bold and italic on top of it', () => {
    expect(formatStyle(0, 'h3', '#000000').fontFamily).toBe(
      'PlayfairDisplay_500Medium',
    )
    expect(formatStyle(2, 'h3', '#000000').fontFamily).toBe(
      'PlayfairDisplay_500Medium_Italic',
    )
    expect(formatStyle(1, 'h3', '#000000').fontFamily).toBe(
      'PlayfairDisplay_600SemiBold',
    )
    expect(formatStyle(0, 'body', '#000000').fontFamily).toBe(
      'Inter_400Regular',
    )
    expect(formatStyle(16, 'body', '#000000').fontFamily).toBe(MONOSPACE)
  })

  it('size a sub- or superscript to the run, not to a fixed point size', () => {
    expect(formatStyle(64, 'h2', '#000000').fontSize).toBeGreaterThan(
      formatStyle(64, 'body', '#000000').fontSize!,
    )
  })
})

describe('familyFor', () => {
  it('defaults roman serif to the headline weight and italic serif to the quotation weight', () => {
    expect(familyFor('serif')).toBe('PlayfairDisplay_600SemiBold')
    expect(familyFor('serif', { italic: true })).toBe(
      'PlayfairDisplay_400Regular_Italic',
    )
    expect(familyOf(TYPE_SPECS.label)).toBe('Inter_600SemiBold')
  })
})
