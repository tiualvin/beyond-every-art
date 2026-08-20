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

  // An OAuth connector never publishes, whatever role it acts as. It is the
  // least supervised client this project has — a vendor's cloud, a schedule
  // nobody watches, content that includes migrated articles an attacker could
  // have influenced — and approving one on a phone is not a decision to let it
  // write to the live site.
  it('refuses an OAuth grant acting as an administrator', () => {
    expect(
      mayPublish({
        nextStatus: 'published',
        payloadAPI: 'MCP',
        role: 'admin',
        viaOAuth: true,
      }),
    ).toBe(false)
  })

  it('refuses an OAuth grant acting as an editor', () => {
    expect(
      mayPublish({
        nextStatus: 'published',
        payloadAPI: 'MCP',
        role: 'editor',
        viaOAuth: true,
      }),
    ).toBe(false)
  })

  it('still lets an OAuth grant save a draft', () => {
    expect(
      mayPublish({
        nextStatus: 'draft',
        payloadAPI: 'MCP',
        role: 'editor',
        viaOAuth: true,
      }),
    ).toBe(true)
  })

  // The API key rule is unchanged by the OAuth addition.
  it('leaves an administrator API key able to publish', () => {
    expect(
      mayPublish({
        nextStatus: 'published',
        payloadAPI: 'MCP',
        role: 'admin',
        viaOAuth: false,
      }),
    ).toBe(true)
  })

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
