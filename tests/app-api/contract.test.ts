// The content contract, held to the website it describes.

import { describe, expect, it } from 'vitest'

import { BLOCK_SLUGS } from '../../blocks/schema'
import {
  API_PREFIX,
  BLOCK_TYPES,
  MAX_SEARCH_LENGTH,
  apiPaths,
} from '../../lib/app-api/contract'
import { MAX_SEARCH_TERM_LENGTH } from '../../lib/content/queries'
import { isReservedRootSlug } from '../../lib/seo/reserved-slugs'

describe('the content contract', () => {
  it('describes exactly the blocks the website renders', () => {
    // A block added to blocks/schema.ts fails here until the contract says
    // what the API sends for it — and the app's renderer, typed over the
    // generated slugs, fails to compile until it says how to draw it.
    expect([...BLOCK_TYPES]).toEqual([...BLOCK_SLUGS])
  })

  it('promises the search length the website actually searches for', () => {
    expect(MAX_SEARCH_LENGTH).toBe(MAX_SEARCH_TERM_LENGTH)
  })

  it('slashes every path', () => {
    for (const path of [
      apiPaths.posts(),
      apiPaths.post('a'),
      apiPaths.tags(),
      apiPaths.tag('a'),
      apiPaths.authors(),
      apiPaths.author('a'),
      apiPaths.search('a'),
    ]) {
      expect(
        new URL(path, `https://example.com${API_PREFIX}`).pathname,
      ).toMatch(/\/$/)
    }
  })

  it('serves under a reserved root segment', () => {
    // Otherwise a post could be published at the API's own path.
    const [root] = API_PREFIX.split('/').filter(Boolean)
    expect(root).toBeDefined()
    expect(isReservedRootSlug(root ?? '')).toBe(true)
  })
})
