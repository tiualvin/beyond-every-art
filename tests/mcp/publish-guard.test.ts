import { describe, expect, it } from 'vitest'

import { mayPublish } from '../../lib/mcp/publish-guard'

describe('mayPublish', () => {
  it('refuses an editor key publishing through MCP', () => {
    expect(
      mayPublish({
        nextStatus: 'published',
        payloadAPI: 'MCP',
        role: 'editor',
      }),
    ).toBe(false)
  })

  it('allows an administrator key to publish through MCP', () => {
    expect(
      mayPublish({ nextStatus: 'published', payloadAPI: 'MCP', role: 'admin' }),
    ).toBe(true)
  })

  it('allows an editor key to save a draft through MCP', () => {
    expect(
      mayPublish({ nextStatus: 'draft', payloadAPI: 'MCP', role: 'editor' }),
    ).toBe(true)
  })

  // Everything that is not MCP keeps working exactly as before: the admin
  // panel, REST, GraphQL, the seeds, and the Ghost importer.
  it.each(['local', 'REST', 'GraphQL', undefined])(
    'leaves %s writes alone',
    (payloadAPI) => {
      expect(
        mayPublish({ nextStatus: 'published', payloadAPI, role: 'editor' }),
      ).toBe(true)
    },
  )

  it('refuses a key whose user has no role at all', () => {
    expect(
      mayPublish({
        nextStatus: 'published',
        payloadAPI: 'MCP',
        role: undefined,
      }),
    ).toBe(false)
  })
})
