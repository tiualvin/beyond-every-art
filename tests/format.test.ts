import { describe, expect, it } from 'vitest'

import { formatDate, readingTimeMinutes } from '../lib/format'

describe('formatDate', () => {
  it('formats an ISO date in a long, stable form (UTC)', () => {
    expect(formatDate('2025-05-20T09:00:00.000Z')).toBe('May 20, 2025')
  })

  it('returns an empty string for missing or invalid input', () => {
    expect(formatDate(null)).toBe('')
    expect(formatDate(undefined)).toBe('')
    expect(formatDate('not-a-date')).toBe('')
  })
})

describe('readingTimeMinutes', () => {
  it('estimates whole minutes from a word count', () => {
    expect(readingTimeMinutes(220)).toBe(1)
    expect(readingTimeMinutes(660)).toBe(3)
  })

  it('never returns less than one minute', () => {
    expect(readingTimeMinutes(0)).toBe(1)
    expect(readingTimeMinutes(-50)).toBe(1)
    expect(readingTimeMinutes(10)).toBe(1)
  })
})
