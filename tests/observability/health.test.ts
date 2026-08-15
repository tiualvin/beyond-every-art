import { describe, expect, it } from 'vitest'

import { HEALTH_PROBE_QUERY } from '../../lib/observability/health'

describe('HEALTH_PROBE_QUERY', () => {
  // The whole point of the query, and the option a tidy-up removes first.
  // Payload's find issues a separate COUNT for pagination metadata unless this
  // is off, so without it the probe costs *more* than the count it replaced.
  it('asks for no pagination, so no COUNT is issued', () => {
    expect(HEALTH_PROBE_QUERY.pagination).toBe(false)
  })

  // With pagination off, `limit: 0` would mean "no limit" and select the whole
  // table — the one value that turns this into the worst possible probe.
  it('reads exactly one row', () => {
    expect(HEALTH_PROBE_QUERY.limit).toBe(1)
  })

  // `id` looks like the obvious column and is a type error: Payload returns it
  // on every document and leaves it out of the generated select type, so only
  // a real field can be named here.
  it('populates no relationships and reads one column', () => {
    expect(HEALTH_PROBE_QUERY.depth).toBe(0)
    expect(HEALTH_PROBE_QUERY.select).toEqual({ slug: true })
  })

  // A collection that always exists, is always migrated, and needs no auth.
  it('queries a collection that is always present', () => {
    expect(HEALTH_PROBE_QUERY.collection).toBe('posts')
  })
})
