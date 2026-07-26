import { describe, expect, it } from 'vitest'

import {
  isReservedRootSlug,
  normalizeRootSlug,
  validateRootContentSlug,
} from '../../lib/seo/reserved-slugs'

describe('reserved root slugs', () => {
  it('normalizes case, whitespace, and surrounding slashes', () => {
    expect(normalizeRootSlug(' /Publication/ ')).toBe('publication')
  })

  it('protects current and planned application routes', () => {
    expect(isReservedRootSlug('journal')).toBe(true)
    expect(isReservedRootSlug('publication')).toBe(true)
    expect(isReservedRootSlug('an-essay-on-blue')).toBe(false)
  })

  it('returns a Payload-compatible validation result', () => {
    expect(validateRootContentSlug('an-essay-on-blue')).toBe(true)
    expect(validateRootContentSlug('publication')).toContain(
      'reserved for an application route',
    )
  })
})
