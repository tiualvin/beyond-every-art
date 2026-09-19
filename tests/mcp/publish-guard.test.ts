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
  // have influenced. It is no longer refused outright, because publishing from
  // a phone is what the OAuth layer was asked for; it is held to two
  // independent conditions instead, and the tests below are what stop either
  // of them quietly becoming one.
  it('lets an approved administrator connector publish', () => {
    expect(
      mayPublish({
        nextStatus: 'published',
        payloadAPI: 'MCP',
        role: 'admin',
        viaOAuth: true,
        grantMayPublish: true,
      }),
    ).toBe(true)
  })

  it('refuses an administrator connector nobody granted publishing to', () => {
    // The box on the consent screen is never pre-ticked, so this is what an
    // administrator who approved a connector without reading it produces.
    expect(
      mayPublish({
        nextStatus: 'published',
        payloadAPI: 'MCP',
        role: 'admin',
        viaOAuth: true,
        grantMayPublish: false,
      }),
    ).toBe(false)
  })

  it('refuses a connector granted publishing whose user is not an admin', () => {
    // The capability is not a way around the role. Ticking the box on an
    // editor's consent screen grants nothing.
    expect(
      mayPublish({
        nextStatus: 'published',
        payloadAPI: 'MCP',
        role: 'editor',
        viaOAuth: true,
        grantMayPublish: true,
      }),
    ).toBe(false)
  })

  it('refuses a connector approved before the capability existed', () => {
    // Every grant issued before this shipped has no value in the column, and
    // the column defaults to false. An absent capability must read as refused
    // rather than as unset-therefore-fine.
    expect(
      mayPublish({
        nextStatus: 'published',
        payloadAPI: 'MCP',
        role: 'admin',
        viaOAuth: true,
      }),
    ).toBe(false)
  })

  it('does not let a truthy-but-not-true capability through', () => {
    expect(
      mayPublish({
        nextStatus: 'published',
        payloadAPI: 'MCP',
        role: 'admin',
        viaOAuth: true,
        grantMayPublish: 'yes' as unknown as boolean,
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
