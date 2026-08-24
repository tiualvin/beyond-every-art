import { describe, expect, it } from 'vitest'

import { mcpPluginConfig } from '../../lib/mcp/plugin'
import { mcpTools } from '../../lib/mcp/tools'
import { nativeGhostID } from '../../lib/migration/native-id'

describe('nativeGhostID', () => {
  // `ghostID` stays unique so the Ghost import remains idempotent. A natively
  // authored article is autofilled with one of these by the field itself, and
  // it has to be a value the export could never also contain.
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
      'uploadMediaFromUrl',
    ])
  })

  // The base64 tool cannot be called from a connector — the bytes would have to
  // pass through the model's context — so a client that can only hand over a
  // link needs the URL one to exist and to say so in its description. This
  // asserts the pair stays a pair.
  it('offers a way to illustrate that does not go through the model', () => {
    const fromUrl = mcpTools.find((tool) => tool.name === 'uploadMediaFromUrl')
    expect(fromUrl).toBeDefined()
    expect(fromUrl!.description).toMatch(/https/)
    expect(fromUrl!.description).toMatch(/phone|scheduled/)
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

  // Without this, one unbounded `findPosts` answers with every migrated
  // article's full Ghost body.
  it('keeps article bodies out of generated find responses', () => {
    expect(mcpPluginConfig.collections?.posts?.overrideResponse).toBeTypeOf(
      'function',
    )
  })

  // The only place a read is visible at all: nothing else in the stack logs a
  // tool call that did not write a document.
  it('logs every JSON-RPC call through the handler event hook', () => {
    expect(mcpPluginConfig.mcp?.handlerOptions?.onEvent).toBeTypeOf('function')
  })

  // Collection files written to disk, `payload.config.ts` rewritten in place,
  // and password reset / account unlock tools are all things this endpoint has
  // no business offering.
  it('enables no experimental tools', () => {
    expect(mcpPluginConfig.experimental).toBeUndefined()
  })
})
