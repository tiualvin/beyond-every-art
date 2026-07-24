import { describe, expect, it } from 'vitest'
import {
  parseGhostExport,
  summarizeGhostExport,
} from '../../lib/migration/ghost-export'

describe('Ghost export parser', () => {
  it('rejects an invalid export', () =>
    expect(() => parseGhostExport({})).toThrow('Invalid Ghost export'))
  it('summarizes records and reports duplicate slugs (legacy db[0].data shape)', () => {
    const ghost = parseGhostExport({
      db: [
        {
          meta: { version: '5.0' },
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
      version: '5.0',
      posts: 2,
      duplicateSlugs: ['same'],
    })
  })

  it('accepts the flat Ghost 6.x export shape (no db wrapper)', () => {
    const ghost = parseGhostExport({
      meta: { version: '6.54.0-rc.0', exported_on: 1784895464778 },
      data: {
        posts: [
          { id: '1', slug: 'same' },
          { id: '2', slug: 'same' },
        ],
        tags: [],
        users: [],
      },
    })
    expect(summarizeGhostExport(ghost)).toMatchObject({
      version: '6.54.0-rc.0',
      posts: 2,
      duplicateSlugs: ['same'],
    })
  })
})
