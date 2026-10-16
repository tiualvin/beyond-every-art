import type { Query } from '@tanstack/react-query'

import {
  PERSIST_MAX_AGE_MS,
  createQueryClient,
  shouldPersist,
} from '../query-client'

const query = (queryKey: unknown[], status = 'success') =>
  ({ queryKey, state: { status } }) as unknown as Query

describe('the query cache', () => {
  it('keeps entries at least as long as it persists them', () => {
    const client = createQueryClient()
    expect(client.getDefaultOptions().queries?.gcTime).toBeGreaterThanOrEqual(
      PERSIST_MAX_AGE_MS,
    )
  })

  it('persists content reads that succeeded', () => {
    expect(shouldPersist(query(['post', 'a-slug']))).toBe(true)
    expect(shouldPersist(query(['posts']))).toBe(true)
  })

  it('does not persist failures, the library, or searches', () => {
    expect(shouldPersist(query(['post', 'a-slug'], 'error'))).toBe(false)
    expect(shouldPersist(query(['library', 'bookmarks']))).toBe(false)
    expect(shouldPersist(query(['search', 'ultramarine']))).toBe(false)
  })
})
