import { describe, expect, it } from 'vitest'

import { linkRel, toLinkRelationship } from '../../lib/content/link-rel'

describe('toLinkRelationship', () => {
  it('accepts every known value', () => {
    expect(toLinkRelationship('sponsored')).toBe('sponsored')
    expect(toLinkRelationship('nofollow')).toBe('nofollow')
    expect(toLinkRelationship('ugc')).toBe('ugc')
    expect(toLinkRelationship('normal')).toBe('normal')
  })

  it('falls back for anything else', () => {
    // A document restored from a backup taken before a value was renamed is
    // the realistic way an unknown one arrives.
    expect(toLinkRelationship('paid')).toBe('normal')
    expect(toLinkRelationship(null)).toBe('normal')
    expect(toLinkRelationship(undefined)).toBe('normal')
  })
})

describe('linkRel', () => {
  it('protects every external link regardless of the relationship', () => {
    // `noopener noreferrer` is about the window this page hands the
    // destination, not about ranking, so it does not depend on the choice.
    expect(linkRel('normal', { external: true })).toBe('noopener noreferrer')
    expect(linkRel('sponsored', { external: true })).toBe(
      'sponsored noopener noreferrer',
    )
  })

  it('emits nothing at all for an ordinary internal link', () => {
    // Undefined rather than an empty string, so `rel` is left out of the
    // markup entirely instead of rendered blank.
    expect(linkRel('normal', { external: false })).toBeUndefined()
    expect(linkRel(undefined, { external: false })).toBeUndefined()
  })

  it('still marks an internal link that asked to be marked', () => {
    expect(linkRel('nofollow', { external: false })).toBe('nofollow')
    expect(linkRel('sponsored', { external: false })).toBe('sponsored')
  })

  it('does not mark an unrecognised relationship as anything', () => {
    expect(linkRel('paid', { external: false })).toBeUndefined()
    expect(linkRel('paid', { external: true })).toBe('noopener noreferrer')
  })
})
