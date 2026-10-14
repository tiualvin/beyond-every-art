import { describe, expect, it } from 'vitest'

import { Posts } from '../../collections/Posts'
import { keepMcpWritesInDraft, mayPublish } from '../../lib/mcp/publish-guard'

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

describe('keepMcpWritesInDraft', () => {
  const run = (
    args: Record<string, unknown>,
    payloadAPI: string,
    operation = 'update',
    role = 'editor',
  ) =>
    keepMcpWritesInDraft({
      args,
      operation,
      req: { payloadAPI, user: { role }, context: {} },
    } as never) as Record<string, unknown>

  // Payload fills a field a write leaves out from the newest version, so on a
  // live article with an unpublished revision on top, setting one field with
  // no `draft` flag wrote the live row as a draft and the article left the
  // site. Reproduced against a real database on 14 Oct 2026.
  it('saves an MCP write that is not a publish as a draft', () => {
    expect(run({ data: { featuredImage: 5 } }, 'MCP')).toMatchObject({
      draft: true,
    })
    expect(
      run({ data: { featuredImage: 5 }, draft: false }, 'MCP'),
    ).toMatchObject({ draft: true })
  })

  it('cannot be used to take an article off the site', () => {
    expect(run({ data: { _status: 'draft' } }, 'MCP')).toMatchObject({
      draft: true,
    })
  })

  // A publish is left for `refuseMcpPublish` to decide, as before.
  it('leaves an explicit publish to the publish guard', () => {
    const args = { data: { _status: 'published' }, id: 186 }
    expect(run(args, 'MCP')).toBe(args)
    expect(run(args, 'MCP', 'update', 'admin')).toBe(args)
  })

  // Payload's bulk update completes a write from the live row, not the newest
  // version, so a publish by `where` puts out the older text and buries the
  // revision. Checked end to end in e2e/mcp.spec.ts.
  it('refuses a publish by `where` from a caller who could publish', () => {
    const args = {
      data: { _status: 'published' },
      where: { slug: { equals: 'sfumato' } },
    }

    expect(() => run(args, 'MCP', 'update', 'admin')).toThrow(/publishArticle/)
    // One who could not is refused by `refuseMcpPublish`, in its own words.
    expect(run(args, 'MCP', 'update', 'editor')).toBe(args)
  })

  it('changes nothing outside MCP, or for anything but an update', () => {
    const args = { data: { _status: 'draft' } }
    const publish = { data: { _status: 'published' }, where: {} }
    for (const api of ['local', 'REST', 'GraphQL']) {
      expect(run(args, api)).toBe(args)
      expect(run(publish, api, 'update', 'admin')).toBe(publish)
    }
    expect(run(args, 'MCP', 'create')).toBe(args)
  })

  it('runs on Posts before anything decides which row a write lands on', () => {
    expect(Posts.hooks?.beforeOperation).toContain(keepMcpWritesInDraft)
  })
})
