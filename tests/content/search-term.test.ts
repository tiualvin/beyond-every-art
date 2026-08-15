import { describe, expect, it } from 'vitest'

import {
  MAX_SEARCH_TERM_LENGTH,
  normaliseSearchTerm,
} from '../../lib/content/queries'

describe('normaliseSearchTerm', () => {
  it('trims and collapses whitespace so one search is one cache key', () => {
    expect(normaliseSearchTerm('  burnt   sienna  ')).toBe('burnt sienna')
  })

  it('truncates, so padding cannot make the scan more expensive', () => {
    const padded = 'a'.repeat(MAX_SEARCH_TERM_LENGTH * 10)

    expect(normaliseSearchTerm(padded)).toHaveLength(MAX_SEARCH_TERM_LENGTH)
  })

  it('reduces a whitespace-only query to nothing, which skips the read', () => {
    expect(normaliseSearchTerm('   \n\t ')).toBe('')
  })

  it('leaves a normal term alone', () => {
    expect(normaliseSearchTerm('ultramarine')).toBe('ultramarine')
  })
})
