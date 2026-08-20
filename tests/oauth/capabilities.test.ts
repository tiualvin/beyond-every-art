import { describe, expect, it } from 'vitest'

import {
  TOOL_GROUP,
  capabilityDocument,
  collectionCapabilities,
  toolCapabilities,
} from '../../lib/oauth/capabilities'

const config = {
  collections: {
    authors: { enabled: { find: true } },
    posts: {
      enabled: { create: true, delete: false, find: true, update: true },
    },
    tags: { enabled: true },
  },
} as unknown as Parameters<typeof collectionCapabilities>[0]

const tools = [
  { name: 'draftArticle' },
  { name: 'uploadMedia' },
] as unknown as Parameters<typeof toolCapabilities>[0]

describe('collectionCapabilities', () => {
  it('offers only the operations the plugin enabled', () => {
    const posts = collectionCapabilities(config).find(
      (r) => r.group === 'posts',
    )
    expect(posts?.operations.sort()).toEqual(['create', 'find', 'update'])
  })

  // `delete: false` on posts is a decision recorded in the plugin config. A
  // consent screen offering it would grant something the plugin never exposes.
  it('never offers an operation the config disabled', () => {
    const posts = collectionCapabilities(config).find(
      (r) => r.group === 'posts',
    )
    expect(posts?.operations).not.toContain('delete')
  })

  it('expands `enabled: true` to the full set', () => {
    const tags = collectionCapabilities(config).find((r) => r.group === 'tags')
    expect(tags?.operations.sort()).toEqual([
      'create',
      'delete',
      'find',
      'update',
    ])
  })

  // The grid is derived from the live plugin config rather than restated, so
  // adding a collection there cannot leave this screen understating the reach.
  it('tracks the real plugin config, not a copy', () => {
    expect(
      collectionCapabilities()
        .map((row) => row.group)
        .sort(),
    ).toEqual(['authors', 'media', 'posts', 'tags'])
  })
})

describe('capabilityDocument', () => {
  it('grants exactly what was ticked', () => {
    const doc = capabilityDocument(new Set(['posts.create']), config, tools)
    expect(doc.posts).toEqual({ create: true, find: false, update: false })
  })

  // The plugin's custom-tool checkboxes default to *true* on a new key. Writing
  // every tool explicitly is what stops an approver who ticked none of them
  // from silently granting all of them.
  it('writes unticked tools as false rather than omitting them', () => {
    const doc = capabilityDocument(new Set(), config, tools)
    expect(doc[TOOL_GROUP]).toEqual({ draftArticle: false, uploadMedia: false })
  })

  it('grants a ticked tool', () => {
    const doc = capabilityDocument(
      new Set(['tool.draftArticle']),
      config,
      tools,
    )
    expect(doc[TOOL_GROUP]).toEqual({ draftArticle: true, uploadMedia: false })
  })

  it('writes nothing for a collection the config does not enable', () => {
    const doc = capabilityDocument(new Set(['members.find']), config, tools)
    expect(doc.members).toBeUndefined()
  })
})
