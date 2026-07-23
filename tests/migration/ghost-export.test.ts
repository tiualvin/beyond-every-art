import { describe, expect, it } from 'vitest'
import {
  parseGhostExport,
  summarizeGhostExport,
} from '../../lib/migration/ghost-export'

describe('Ghost export parser', () => {
  it('rejects an invalid export', () =>
    expect(() => parseGhostExport({})).toThrow('Invalid Ghost export'))
  it('summarizes records and reports duplicate slugs', () => {
    const ghost = parseGhostExport({
      db: [
        {
          data: {
            posts: [
              { id: '1', slug: 'same' },
              { id: '2', slug: 'same' },
            ],
            tags: [],
            users: [],
          },
        },
      ],
    })
    expect(summarizeGhostExport(ghost)).toMatchObject({
      posts: 2,
      duplicateSlugs: ['same'],
    })
  })
})
