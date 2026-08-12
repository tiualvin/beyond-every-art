import { describe, expect, it } from 'vitest'

import { mcpTools, nativeGhostID } from '../../lib/mcp/tools'
import { mcpPluginConfig } from '../../lib/mcp/plugin'

describe('nativeGhostID', () => {
  // `ghostID` stays required and unique so the Ghost import remains idempotent.
  // A natively authored article has to satisfy it without ever looking like a
  // record the export could also contain.
  it('is namespaced so it cannot collide with a Ghost ObjectID', () => {
    const id = nativeGhostID()

    expect(id.startsWith('native:')).toBe(true)
    expect(id).not.toMatch(/^[a-f0-9]{24}$/)
  })

  it('is unique per call', () => {
    expect(nativeGhostID()).not.toBe(nativeGhostID())
  })
})

describe('mcpTools', () => {
  it('exposes the drafting loop: create, read back, revise, illustrate', () => {
    expect(mcpTools.map((tool) => tool.name)).toEqual([
      'draftArticle',
      'readArticleMarkdown',
      'updateArticleMarkdown',
      'uploadMedia',
    ])
  })

  it('describes every tool, since that is what a client selects on', () => {
    for (const tool of mcpTools) {
      expect(tool.description.length).toBeGreaterThan(20)
    }
  })
})

describe('mcpPluginConfig', () => {
  // The plugin exposes nothing it is not told to. These four hold personal,
  // billing, and credential data and have no editorial use over MCP.
  it.each(['members', 'billing-events', 'newsletter-signups', 'users'])(
    'does not expose %s',
    (slug) => {
      expect(mcpPluginConfig.collections).not.toHaveProperty(slug)
    },
  )

  it('never allows an agent to delete an article', () => {
    expect(mcpPluginConfig.collections?.posts?.enabled).toMatchObject({
      delete: false,
    })
  })

  it('exposes no globals', () => {
    expect(mcpPluginConfig.globals ?? {}).toEqual({})
  })

  // Collection files written to disk, `payload.config.ts` rewritten in place,
  // and password reset / account unlock tools are all things this endpoint has
  // no business offering.
  it('enables no experimental tools', () => {
    expect(mcpPluginConfig.experimental).toBeUndefined()
  })
})
