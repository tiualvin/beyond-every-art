import { describe, expect, it } from 'vitest'

import {
  buildRedirectPlan,
  parseGhostRedirects,
} from '../../lib/migration/redirects'

describe('parseGhostRedirects', () => {
  it('rejects a non-array export', () => {
    expect(() => parseGhostRedirects({})).toThrow(
      'Invalid Ghost redirects export',
    )
  })

  it('drops malformed entries missing from/to', () => {
    const rules = parseGhostRedirects([
      { from: '/old', to: '/new' },
      { from: '/missing-to' },
      { to: '/missing-from' },
      null,
      'not-an-object',
    ])
    expect(rules).toEqual([{ from: '/old', to: '/new' }])
  })
})

describe('buildRedirectPlan', () => {
  it('maps permanent (default) rules to a 301', () => {
    const plan = buildRedirectPlan([{ from: '/old', to: '/new' }])
    expect(plan).toEqual([
      { source: '/old', destination: '/new', statusCode: '301' },
    ])
  })

  it('maps permanent: false to a 302', () => {
    const plan = buildRedirectPlan([
      { from: '/old', to: '/new', permanent: false },
    ])
    expect(plan[0].statusCode).toBe('302')
  })

  it('keeps the first rule when a source repeats', () => {
    const plan = buildRedirectPlan([
      { from: '/old', to: '/first' },
      { from: '/old', to: '/second' },
    ])
    expect(plan).toEqual([
      { source: '/old', destination: '/first', statusCode: '301' },
    ])
  })
})
